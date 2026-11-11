import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import {
  addressHash,
  canSend,
  closeConsentPools,
  consentHistory,
  consentStates,
  recordConsent,
  suppress,
  suppressionCheck,
  withdraw,
} from '../index';
import { withConsentTx } from '../db';

// Lot C.5 — on the real role (app_runtime → consent_rw); checks as postgres (DIRECT_URL).
//   T1 / T2: a business's consents and suppressions are invisible from another business;
//   append-only: consent_rw cannot change or delete a row (no GRANT, and a trigger for anyone);
//   suppression: an unsubscribe holds after the person is gone; only the person subscribes again.

const adminPool = new Pool({ connectionString: process.env.DIRECT_URL, max: 1 });
const newUuid = () => crypto.randomUUID();
const ORG_A = newUuid();
const ORG_B = newUuid();
const TEXT = 'Sunt de acord să primesc oferte pe e-mail de la Salon Ana.';

async function pgCode(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (err) {
    return (err as { code?: string }).code ?? (err as Error).name;
  }
}

afterAll(async () => {
  await closeConsentPools();
  await adminPool.end();
});

describe('consent — the registry', () => {
  it('no consent → canSend is false; "given" with the text → true; withdrawn → false', async () => {
    const subject = { type: 'crm_contact' as const, id: newUuid() };
    const address = `ana-${subject.id.slice(0, 6)}@example.ro`;
    const send = () => canSend({ organizationId: ORG_A, channel: 'email', address, subject });
    expect(await send()).toBe(false);

    await recordConsent({
      organizationId: ORG_A,
      subject,
      channel: 'email',
      address,
      source: 'form',
      text: TEXT,
      textVersion: 'v1',
      ip: '86.120.33.214',
    });
    expect(await send()).toBe(true);
    // another address of the same person needs its own consent
    expect(
      await canSend({ organizationId: ORG_A, channel: 'email', address: `x${address}`, subject }),
    ).toBe(false);
    expect((await consentStates({ organizationId: ORG_A, subject })).email).toBe('given');

    await withdraw({
      organizationId: ORG_A,
      subject,
      channel: 'email',
      address,
      source: 'unsubscribe',
      origin: 'marketing',
    });
    expect(await send()).toBe(false);
    const history = await consentHistory({ organizationId: ORG_A, subject });
    expect(history.map((h) => h.state)).toEqual(['withdrawn', 'given']);
    const { rows } = await adminPool.query(
      `SELECT ip_truncated FROM consent.consent_event WHERE subject_id = $1 AND state = 'given'`,
      [subject.id],
    );
    expect(rows[0].ip_truncated).toBe('86.120.33.0/24');
  });

  it('import and manual need the reason; "given" needs the text (refused before the database)', async () => {
    const subject = { type: 'marketing_contact' as const, id: newUuid() };
    const base = {
      organizationId: ORG_A,
      subject,
      channel: 'sms' as const,
      address: '0722 000 111',
      text: TEXT,
      textVersion: 'v1',
    };
    expect(await pgCode(recordConsent({ ...base, source: 'import' }))).toBe('INVALID_INPUT');
    expect(await pgCode(recordConsent({ ...base, source: 'manual', text: ' ' }))).toBe(
      'INVALID_INPUT',
    );
    await recordConsent({ ...base, source: 'import', reason: 'Lista din salon, cu acord scris' });
    expect((await consentStates({ organizationId: ORG_A, subject })).sms).toBe('given');
  });

  it('the database refuses "given" without the text, whoever writes', async () => {
    const code = await pgCode(
      adminPool.query(
        `INSERT INTO consent.consent_event (organization_id, subject_type, subject_id, channel,
           state, address_hash, source) VALUES ($1, 'crm_contact', $2, 'email', 'given', $3, 'form')`,
        [ORG_A, newUuid(), 'a'.repeat(64)],
      ),
    );
    expect(code).toBe('23514');
  });
});

describe('consent — suppression', () => {
  it('after an unsubscribe the business cannot subscribe the address again; the person can', async () => {
    const subject = { type: 'crm_contact' as const, id: newUuid() };
    const address = `ion-${subject.id.slice(0, 6)}@example.ro`;
    const given = (source: 'manual' | 'form_confirmed') =>
      recordConsent({
        organizationId: ORG_A,
        subject,
        channel: 'email',
        address,
        source,
        text: TEXT,
        textVersion: 'v1',
        reason: 'La recepție',
      });
    await given('manual');
    await withdraw({
      organizationId: ORG_A,
      subject,
      channel: 'email',
      address,
      source: 'preferences',
      origin: 'public',
    });
    expect(
      (await suppressionCheck({ organizationId: ORG_A, channel: 'email', address })).suppressed,
    ).toBe(true);

    // the business: refused (CONFLICT), in the database as well
    expect(await pgCode(given('manual'))).toBe('CONFLICT');
    // the person, from the confirmed form: subscribed again, out of the list
    await given('form_confirmed');
    expect(
      (await suppressionCheck({ organizationId: ORG_A, channel: 'email', address })).suppressed,
    ).toBe(false);
    expect(await canSend({ organizationId: ORG_A, channel: 'email', address, subject })).toBe(true);
  });

  it('a bounce suppresses without a person; it holds for any contact with that address', async () => {
    const address = '+40722999888';
    await suppress({
      organizationId: ORG_A,
      channel: 'sms',
      address,
      reason: 'bounced',
      origin: 'marketing',
    });
    await suppress({
      organizationId: ORG_A,
      channel: 'sms',
      address,
      reason: 'bounced',
      origin: 'marketing',
    });
    const check = await suppressionCheck({
      organizationId: ORG_A,
      channel: 'sms',
      address: '0722 999 888',
    });
    expect(check).toMatchObject({ suppressed: true, reason: 'bounced' });
    // a bounce is not lifted by a new consent (only an unsubscribe is): still suppressed
    const subject = { type: 'marketing_contact' as const, id: newUuid() };
    await recordConsent({
      organizationId: ORG_A,
      subject,
      channel: 'sms',
      address,
      source: 'form_confirmed',
      text: TEXT,
      textVersion: 'v1',
    });
    expect(await canSend({ organizationId: ORG_A, channel: 'sms', address, subject })).toBe(false);
  });

  it('the list keeps only the hash, never the address', async () => {
    const address = `maria-${newUuid().slice(0, 6)}@example.ro`;
    await suppress({
      organizationId: ORG_A,
      channel: 'email',
      address,
      reason: 'spam_report',
      origin: 'marketing',
    });
    const { rows } = await adminPool.query(
      `SELECT * FROM consent.suppression WHERE organization_id = $1 AND address_hash = $2`,
      [ORG_A, addressHash(ORG_A, 'email', address)],
    );
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0])).not.toContain('maria-');
  });
});

describe('consent — T1 / T2 and append-only', () => {
  it('a business does not see the consents or the suppressions of another', async () => {
    const subject = { type: 'crm_contact' as const, id: newUuid() };
    const address = `t1-${subject.id.slice(0, 6)}@example.ro`;
    await recordConsent({
      organizationId: ORG_A,
      subject,
      channel: 'email',
      address,
      source: 'form',
      text: TEXT,
      textVersion: 'v1',
    });
    await suppress({
      organizationId: ORG_A,
      channel: 'email',
      address: `s${address}`,
      reason: 'bounced',
      origin: 'crm',
    });
    expect(await consentHistory({ organizationId: ORG_B, subject })).toEqual([]);
    const seen = await withConsentTx(ORG_B, (c) =>
      c.query(`SELECT count(*)::int AS n FROM consent.suppression WHERE organization_id = $1`, [
        ORG_A,
      ]),
    );
    expect(seen.rows[0].n).toBe(0);
    // writing a row for another business: refused by RLS
    const code = await pgCode(
      withConsentTx(ORG_B, (c) =>
        c.query(
          `INSERT INTO consent.suppression (organization_id, channel, address_hash, reason, origin)
           VALUES ($1, 'email', $2, 'bounced', 'crm')`,
          [ORG_A, 'b'.repeat(64)],
        ),
      ),
    );
    expect(code).toBe('42501');
  });

  it('consent_rw cannot change or delete a consent, nor take an address off the list', async () => {
    const subject = { type: 'crm_contact' as const, id: newUuid() };
    const address = `ro-${subject.id.slice(0, 6)}@example.ro`;
    await recordConsent({
      organizationId: ORG_A,
      subject,
      channel: 'email',
      address,
      source: 'form',
      text: TEXT,
      textVersion: 'v1',
    });
    await suppress({
      organizationId: ORG_A,
      channel: 'email',
      address: `x${address}`,
      reason: 'bounced',
      origin: 'crm',
    });
    for (const sql of [
      `UPDATE consent.consent_event SET state = 'withdrawn' WHERE subject_id = '${subject.id}'`,
      `DELETE FROM consent.consent_event WHERE subject_id = '${subject.id}'`,
      `DELETE FROM consent.suppression`,
      `UPDATE consent.suppression SET reason = 'bounced'`,
    ]) {
      expect(await pgCode(withConsentTx(ORG_A, (c) => c.query(sql)))).toBe('42501');
    }
    // and not even the owner of the table changes the history (trigger)
    expect(
      await pgCode(
        adminPool.query(`UPDATE consent.consent_event SET text = 'x' WHERE subject_id = $1`, [
          subject.id,
        ]),
      ),
    ).toBe('42501');
  });
});

// Decision 11.11.2026: an audit row only for a team member's action, on the caller's category
describe('consent — the audit of a team member', () => {
  it('a manual record and withdraw by a member → crm.consent_* rows, without the address', async () => {
    const subject = { type: 'crm_contact' as const, id: newUuid() };
    const actorUserId = newUuid();
    const address = `audit-${subject.id.slice(0, 6)}@example.ro`;
    await recordConsent({
      organizationId: ORG_A,
      subject,
      channel: 'email',
      address,
      source: 'manual',
      text: TEXT,
      textVersion: 'v1',
      reason: 'Acord dat la recepție',
      actorUserId,
      audit: 'crm',
    });
    await withdraw({
      organizationId: ORG_A,
      subject,
      channel: 'email',
      address,
      source: 'manual',
      actorUserId,
      origin: 'crm',
      audit: 'crm',
    });
    const { rows } = await adminPool.query<{ action: string; category: string; metadata: object }>(
      `SELECT action, category, metadata FROM audit.audit_log
        WHERE organization_id = $1 AND target_id = $2 ORDER BY created_at, action`,
      [ORG_A, subject.id],
    );
    expect(rows.map((r) => [r.category, r.action])).toEqual([
      ['crm', 'crm.consent_recorded'],
      ['crm', 'crm.consent_withdrawn'],
    ]);
    expect(JSON.stringify(rows)).not.toContain(address);
  });

  it('a public form writes no audit row; a member without the calling application is refused', async () => {
    const subject = { type: 'crm_contact' as const, id: newUuid() };
    const address = `form-${subject.id.slice(0, 6)}@example.ro`;
    const base = {
      organizationId: ORG_A,
      subject,
      channel: 'email' as const,
      address,
      text: TEXT,
      textVersion: 'v1',
    };
    await recordConsent({ ...base, source: 'form_confirmed' });
    const { rows } = await adminPool.query(
      `SELECT 1 FROM audit.audit_log WHERE organization_id = $1 AND target_id = $2`,
      [ORG_A, subject.id],
    );
    expect(rows).toHaveLength(0);
    expect(
      await pgCode(
        recordConsent({ ...base, source: 'manual', reason: 'x', actorUserId: newUuid() }),
      ),
    ).toBe('INVALID_INPUT');
    expect(
      await pgCode(
        recordConsent({
          ...base,
          subject: { type: 'booking_client', id: newUuid() },
          source: 'manual',
          reason: 'x',
          actorUserId: newUuid(),
          audit: 'crm',
        }),
      ),
    ).toBe('INVALID_INPUT');
  });
});
