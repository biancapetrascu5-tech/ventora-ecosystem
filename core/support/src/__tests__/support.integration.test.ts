import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { InvalidInput, ResourceNotFound } from '@ventora/errors';
import { closeAuditPools } from '@ventora/audit';
import { closeFilesPool, MemoryStorageAdapter, setStorageAdapter } from '@ventora/files';
import { founderAuth } from '@ventora/identity';
import { ConsumerRegistry, dispatchOutbox } from '@ventora/integrations';
import {
  SUPPORT_APPLICATIONS,
  closeSupportPools,
  closeSupportRequestAsTeam,
  countSupportRequestsForFounder,
  createSupportRequest,
  finishSupportUpload,
  finishTeamUpload,
  getSupportThread,
  getSupportThreadForFounder,
  isSupportRequestRefOf,
  listSupportRequests,
  listSupportRequestsForFounder,
  markSupportRequestInProgress,
  newSupportRequestId,
  reopenSupportRequest,
  replyAsTeam,
  replyToSupportRequest,
  resolveSupportActor,
  runSupportAutoCloseJob,
  startSupportUpload,
  startTeamUpload,
  supportAutoCloseWarningConsumer,
  supportReplyConsumer,
  type SupportActor,
} from '../index';

/*
 * Lot 4.6 on a real Postgres: the Hub as app_runtime → support_rw, Founder as founder_runtime →
 * support_founder, files as files_rw / files_founder, the storage in memory. „Gata când”:
 *   - a request sent from any application keeps that application;
 *   - T1 / T2: a request of business A is not visible from business B;
 *   - the team's reply turns it into „Răspuns nou” and sends the notification;
 *   - the attachments keep the limit (10 MB, PNG / JPG / PDF), checked on the server.
 * Plus: S-1 (who sees what in the Hub), the reopening, S116-D18 (the automatic closing), S-4.
 */

const admin = new Pool({ connectionString: process.env.DIRECT_URL, max: 2 });
const q = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;

const storage = new MemoryStorageAdapter();
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2]);
const HTML = new TextEncoder().encode('<html><script>alert(1)</script></html>');
const FOUNDER_PASSPHRASE = 'Founder-support-passphrase-1';

// ── fixtures (as in core/access support-recovery) ───────────────────────────────────────────

async function totpFromBase32(base32Secret: string): Promise<string> {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of base32Secret.toUpperCase().replace(/=+$/, '')) {
    const v = alpha.indexOf(c);
    if (v >= 0) bits += v.toString(2).padStart(5, '0');
  }
  const raw = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < raw.length; i++) raw[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  const counter = BigInt(Math.floor(Date.now() / 30_000));
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setBigUint64(0, counter, false);
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-1' }, false, [
    'sign',
  ]);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf));
  const o = sig[sig.length - 1]! & 0x0f;
  const code =
    (((sig[o]! & 0x7f) << 24) |
      ((sig[o + 1]! & 0xff) << 16) |
      ((sig[o + 2]! & 0xff) << 8) |
      (sig[o + 3]! & 0xff)) %
    1_000_000;
  return code.toString().padStart(6, '0');
}

function sessionCookieFrom(resp: Response): string {
  const all =
    (resp.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ??
    (resp.headers.get('set-cookie') ?? '').split(', ');
  const line = all.find((c) => c.includes('session_token='));
  if (!line) throw new Error('no session cookie in response');
  return line.split(';')[0]!.trim();
}

async function createFounder(name: string): Promise<{ id: string; headers: () => Headers }> {
  const email = `founder-${randomUUID()}@test.local`;
  await founderAuth.api.signUpEmail({ body: { name, email, password: FOUNDER_PASSPHRASE } });
  const signIn = await founderAuth.api.signInEmail({
    body: { email, password: FOUNDER_PASSPHRASE },
    asResponse: true,
  });
  let cookie = sessionCookieFrom(signIn);
  const [{ id }] = await q(`SELECT id FROM founder_identity.users WHERE email = $1`, [email]);
  const enabled = await founderAuth.api.enableTwoFactor({
    headers: new Headers({ cookie }),
    body: { password: FOUNDER_PASSPHRASE },
  });
  const secret = (enabled as { totpURI: string }).totpURI.match(/[?&]secret=([A-Z2-7=]+)/i)![1]!;
  const verified = await founderAuth.api.verifyTOTP({
    headers: new Headers({ cookie }),
    body: { code: await totpFromBase32(secret) },
    asResponse: true,
  });
  cookie = sessionCookieFrom(verified);
  return { id, headers: () => new Headers({ cookie }) };
}

const orgs: string[] = [];

async function createOrg(name: string): Promise<string> {
  const id = randomUUID();
  await q(
    `INSERT INTO organizations.organization (id, slug, name, created_via, updated_at)
     VALUES ($1::uuid, $2, $3, 'self_service', NOW())`,
    [id, `sup-${id.slice(0, 8)}`, name],
  );
  orgs.push(id);
  return id;
}

async function createMember(
  orgId: string,
  role: 'owner' | 'admin' | 'member',
  name: string,
): Promise<SupportActor & { token: string }> {
  const userId = randomUUID();
  await q(
    `INSERT INTO identity.users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, true, false, NOW(), NOW())`,
    [userId, name, `${role}-${userId}@test.local`],
  );
  await q(
    `INSERT INTO organizations.membership (organization_id, user_id, role, status, updated_at)
     VALUES ($1::uuid, $2::uuid, $3, 'active', NOW())`,
    [orgId, userId, role],
  );
  const token = randomUUID();
  await q(
    `INSERT INTO identity.sessions (id, user_id, token, expires_at, created_at, updated_at, active_organization_id)
     VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', NOW(), NOW(), $4::uuid)`,
    [randomUUID(), userId, token, orgId],
  );
  return { organizationId: orgId, userId, role, token };
}

/** The client's side of an attachment: ask, send the bytes, confirm. */
async function hubUpload(
  actor: SupportActor,
  requestId: string,
  bytes: Uint8Array,
  type = 'image/png',
) {
  const { fileId } = await startSupportUpload(actor, requestId, {
    name: 'captura.png',
    contentType: type,
    sizeBytes: bytes.length,
  });
  storage.put(`${actor.organizationId}/${fileId}`, bytes, type);
  return finishSupportUpload(actor, fileId);
}

async function dispatchSupport() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    return await dispatchOutbox({
      pool,
      source: { schema: 'support', moduleRole: 'support_rw' },
      registry: new ConsumerRegistry()
        .register(supportReplyConsumer)
        .register(supportAutoCloseWarningConsumer),
      limit: 100,
    });
  } finally {
    await pool.end();
  }
}

let A: string;
let B: string;
let ownerA: SupportActor & { token: string };
let memberA: SupportActor & { token: string };
let otherMemberA: SupportActor & { token: string };
let memberB: SupportActor & { token: string };
let founder: { id: string; headers: () => Headers };

beforeAll(async () => {
  setStorageAdapter(storage);
  process.env.FILES_LINK_SECRET = 'integration-support-link-secret-0123456789';
  process.env.NEXT_PUBLIC_PLATFORM_URL = 'https://hub.example.test';
  A = await createOrg('Salon Aurora');
  B = await createOrg('Clinica Dentis');
  ownerA = await createMember(A, 'owner', 'Bianca Proprietar');
  memberA = await createMember(A, 'member', 'Ana Recepție');
  otherMemberA = await createMember(A, 'member', 'Radu Stilist');
  memberB = await createMember(B, 'member', 'Ioana Dentis');
  founder = await createFounder('Mihai Ionescu');
});

beforeEach(() => storage.objects.clear());

afterAll(async () => {
  const ids = [orgs];
  await q(`DELETE FROM notifications.delivery WHERE organization_id = ANY($1::uuid[])`, ids);
  await q(`DELETE FROM notifications.notification WHERE organization_id = ANY($1::uuid[])`, ids);
  for (const t of [
    'processed_events',
    'outbox_events',
    'support_status_event',
    'support_attachment',
    'support_message',
    'support_request',
  ]) {
    await q(`DELETE FROM support.${t} WHERE organization_id = ANY($1::uuid[])`, ids);
  }
  await q(`DELETE FROM files.outbox_events WHERE organization_id = ANY($1::uuid[])`, ids);
  await q(`DELETE FROM files.file WHERE organization_id = ANY($1::uuid[])`, ids);
  await closeSupportPools();
  await closeFilesPool();
  await closeAuditPools();
  await admin.end();
});

const newRequest = (
  actor: SupportActor,
  applicationId = 'booking',
  extra: Partial<{ fileIds: string[]; id: string }> = {},
) =>
  createSupportRequest(actor, {
    id: extra.id ?? newSupportRequestId(),
    applicationId,
    subject: 'Reamintirile SMS nu pleacă la clienții noi',
    description: 'Clienții adăugați de ieri nu primesc reamintirea.',
    urgency: 'blocking',
    fileIds: extra.fileIds,
  });

describe('trimiterea din Hub', () => {
  it('actorul vine din sesiune, cu afacerea activă și rolul din baza de date', async () => {
    const actor = await resolveSupportActor(memberA.token);
    expect(actor).toEqual({ organizationId: A, userId: memberA.userId, role: 'member' });
  });

  it('din orice aplicație, solicitarea păstrează aplicația trimisă (și platform = Hub)', async () => {
    for (const app of SUPPORT_APPLICATIONS) {
      const { ref } = await newRequest(memberA, app);
      const [row] = await q(
        `SELECT application_id, status, urgency FROM support.support_request WHERE ref = $1`,
        [ref],
      );
      expect(row).toEqual({ application_id: app, status: 'open', urgency: 'blocking' });
    }
  });

  it('FounderNotifications: „Solicitare nouă de la …” în clopoțelul Founder, o dată', async () => {
    const id = newSupportRequestId();
    const { ref } = await newRequest(memberA, 'booking', { id });
    const rows = await q(
      `SELECT type, params, action_url FROM notifications.founder_notification WHERE dedup_key = $1`,
      [`founder.support.request_new:${id}`],
    );
    expect(rows).toEqual([
      {
        type: 'founder.support.request_new',
        params: {
          organizationId: A,
          applicationId: 'booking',
          subject: 'Reamintirile SMS nu pleacă la clienții noi',
          urgency: 'blocking',
          requestRef: ref,
        },
        action_url: `/support/${ref}`,
      },
    ]);
  });

  it('o aplicație necunoscută e refuzată', async () => {
    await expect(newRequest(memberA, 'nu-exista')).rejects.toBeInstanceOf(InvalidInput);
  });

  it('referința, primul mesaj, istoricul „opened” și rândul de audit', async () => {
    const { id, ref } = await newRequest(memberA);
    expect(ref).toMatch(/^VS-\d{4}-\d{4,}$/);
    const thread = await getSupportThread(memberA, ref);
    expect(thread.request.hubStatus).toBe('inProgress');
    expect(thread.request.founderStatus).toBe('open');
    expect(thread.request.requesterName).toBe('Ana Recepție');
    expect(thread.messages).toHaveLength(1);
    expect(thread.history.map((h) => h.kind)).toEqual(['opened']);
    const audit = await q(`SELECT action, actor_id FROM audit.audit_log WHERE target_id = $1`, [
      id,
    ]);
    expect(audit).toEqual([{ action: 'support.request_created', actor_id: memberA.userId }]);
  });
});

describe('T1 / T2 și S-1', () => {
  it('T1: o solicitare a afacerii A nu se vede din B', async () => {
    const { ref } = await newRequest(memberA);
    expect((await listSupportRequests(memberB)).map((r) => r.ref)).not.toContain(ref);
    await expect(getSupportThread(memberB, ref)).rejects.toBeInstanceOf(ResourceNotFound);
    await expect(
      replyToSupportRequest(memberB, ref, { body: 'Din altă afacere' }),
    ).rejects.toBeInstanceOf(ResourceNotFound);
  });

  it('T2: ca app_runtime, în contextul B, rândurile lui A nu există (RLS)', async () => {
    await newRequest(memberA);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE support_rw');
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [B]);
      const seen = await client.query(
        `SELECT count(*)::int AS n FROM support.support_request WHERE organization_id = $1::uuid`,
        [A],
      );
      expect(seen.rows[0].n).toBe(0);
      await client.query('SELECT set_config($1, $2, true)', ['app.organization_id', '']);
      const none = await client.query(`SELECT count(*)::int AS n FROM support.support_request`);
      expect(none.rows[0].n).toBe(0);
      await client.query('ROLLBACK');
    } finally {
      client.release();
      await pool.end();
    }
  });

  it('S-1: un membru vede doar solicitările lui; owner-ul le vede pe toate ale afacerii', async () => {
    const mine = await newRequest(memberA);
    const theirs = await newRequest(otherMemberA);
    const forMember = (await listSupportRequests(memberA)).map((r) => r.ref);
    expect(forMember).toContain(mine.ref);
    expect(forMember).not.toContain(theirs.ref);
    await expect(getSupportThread(memberA, theirs.ref)).rejects.toBeInstanceOf(ResourceNotFound);
    const forOwner = (await listSupportRequests(ownerA)).map((r) => r.ref);
    expect(forOwner).toEqual(expect.arrayContaining([mine.ref, theirs.ref]));
  });
});

describe('răspunsul echipei (Founder · Suport)', () => {
  it('„Deschise” în Founder; răspunsul → „Răspuns nou” în Hub, notificarea și e-mailul E-7', async () => {
    const { id, ref } = await newRequest(memberA);
    const open = await listSupportRequestsForFounder({
      founderHeaders: founder.headers(),
      group: 'open',
    });
    expect(open.find((r) => r.ref === ref)?.organizationId).toBe(A);
    expect(
      (await countSupportRequestsForFounder({ founderHeaders: founder.headers() })).open,
    ).toBeGreaterThan(0);

    const after = await replyAsTeam({
      founderHeaders: founder.headers(),
      organizationId: A,
      requestId: id,
      body: 'Verificăm setările de trimitere.',
    });
    expect(after.status).toBe('awaiting_business');
    expect(after.hubStatus).toBe('newReply');
    expect(after.founderStatus).toBe('progress');
    expect(after.assigneeName).toBe('Mihai Ionescu');
    expect(after.autoCloseAt).not.toBeNull();

    const report = await dispatchSupport();
    expect(report.dead).toBe(0);
    const notes = await q(
      `SELECT n.type, n.params, n.action_url, d.channel
         FROM notifications.notification n
         LEFT JOIN notifications.delivery d ON d.notification_id = n.id
        WHERE n.recipient_user_id = $1::uuid AND n.type = 'support.reply'
          AND n.params->>'ref' = $2`,
      [memberA.userId, ref],
    );
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      type: 'support.reply',
      action_url: `/support/${ref}`,
      channel: 'email',
      params: { author: 'Mihai Ionescu', ref, businessName: 'Salon Aurora' },
    });

    // the business answers: back to the team („Deschisă” in Founder, „În lucru” in the Hub)
    const answered = await replyToSupportRequest(memberA, ref, {
      body: 'Am bifat acordul. Mulțumesc!',
    });
    expect(answered.status).toBe('open');
    expect(answered.autoCloseAt).toBeNull();
    const thread = await getSupportThreadForFounder({ founderHeaders: founder.headers(), ref });
    expect(thread.messages.map((m) => m.authorType)).toEqual(['business', 'team', 'business']);
    expect(thread.history.map((h) => h.kind)).toEqual(['business_reply', 'team_reply', 'opened']);
  });

  it('„Marchează În lucru”, „Trimite și închide”, redeschiderea din Hub', async () => {
    const { id, ref } = await newRequest(memberA);
    const marked = await markSupportRequestInProgress({
      founderHeaders: founder.headers(),
      organizationId: A,
      requestId: id,
    });
    expect(marked.status).toBe('in_progress');
    const closed = await replyAsTeam({
      founderHeaders: founder.headers(),
      organizationId: A,
      requestId: id,
      body: 'Rezolvat.',
      close: true,
    });
    expect(closed.status).toBe('closed');
    expect(closed.hubStatus).toBe('resolved');
    await expect(replyToSupportRequest(memberA, ref, { body: 'încă una' })).rejects.toThrow();
    const reopened = await reopenSupportRequest(memberA, ref, { body: 'A apărut din nou azi.' });
    expect(reopened.status).toBe('open');
    const thread = await getSupportThread(memberA, ref);
    expect(thread.history[0]!.kind).toBe('reopened');
    expect(thread.messages.at(-1)!.kind).toBe('reopen');
    const again = await closeSupportRequestAsTeam({
      founderHeaders: founder.headers(),
      organizationId: A,
      requestId: id,
    });
    expect(again.status).toBe('closed');
  });

  it('o solicitare a altei afaceri nu se scrie cu organizația greșită (RLS pe support_founder)', async () => {
    const { id } = await newRequest(memberA);
    await expect(
      replyAsTeam({
        founderHeaders: founder.headers(),
        organizationId: B,
        requestId: id,
        body: 'x',
      }),
    ).rejects.toBeInstanceOf(ResourceNotFound);
  });

  it('S-4: referința sesiunii de suport trebuie să fie a unei solicitări a aceleiași afaceri', async () => {
    const { ref } = await newRequest(memberA);
    const h = founder.headers();
    expect(await isSupportRequestRefOf({ founderHeaders: h, organizationId: A, ref })).toBe(true);
    expect(await isSupportRequestRefOf({ founderHeaders: h, organizationId: B, ref })).toBe(false);
    expect(
      await isSupportRequestRefOf({ founderHeaders: h, organizationId: A, ref: 'SUP-1' }),
    ).toBe(false);
  });
});

describe('atașamentele, verificate pe server', () => {
  it('un fișier declarat peste 10 MB sau de alt tip e refuzat înainte de încărcare', async () => {
    const id = newSupportRequestId();
    await expect(
      startSupportUpload(memberA, id, {
        name: 'mare.png',
        contentType: 'image/png',
        sizeBytes: 10 * 1024 * 1024 + 1,
      }),
    ).rejects.toBeInstanceOf(InvalidInput);
    await expect(
      startSupportUpload(memberA, id, { name: 'a.html', contentType: 'text/html', sizeBytes: 10 }),
    ).rejects.toBeInstanceOf(InvalidInput);
  });

  it('conținutul real e verificat la confirmare, chiar dacă clientul minte', async () => {
    await expect(hubUpload(memberA, newSupportRequestId(), HTML)).rejects.toBeInstanceOf(
      InvalidInput,
    );
  });

  it('un atașament bun ajunge în fir; unul al altei solicitări sau al altcuiva e refuzat', async () => {
    const id = newSupportRequestId();
    const ok = await hubUpload(memberA, id, PNG);
    const { ref } = await newRequest(memberA, 'booking', { id, fileIds: [ok.fileId] });
    const thread = await getSupportThread(memberA, ref);
    expect(thread.messages[0]!.attachments.map((a) => a.fileId)).toEqual([ok.fileId]);
    expect(thread.links[ok.fileId]).toMatch(/^https:\/\/hub\.example\.test\/files\//);

    const other = await hubUpload(memberA, newSupportRequestId(), PNG);
    await expect(
      newRequest(memberA, 'booking', { fileIds: [other.fileId] }),
    ).rejects.toBeInstanceOf(InvalidInput);
    const someoneElse = await hubUpload(otherMemberA, id, PNG).catch((e) => e);
    // the request of another member is invisible: no upload into it
    expect(someoneElse).toBeInstanceOf(ResourceNotFound);
  });

  it('echipa atașează prin files_founder; afacerea vede fișierul', async () => {
    const { id, ref } = await newRequest(memberA);
    const { fileId } = await startTeamUpload({
      founderHeaders: founder.headers(),
      organizationId: A,
      requestId: id,
      file: { name: 'pasii-import.png', contentType: 'image/png', sizeBytes: PNG.length },
    });
    storage.put(`${A}/${fileId}`, PNG, 'image/png');
    await finishTeamUpload({ founderHeaders: founder.headers(), organizationId: A, fileId });
    await replyAsTeam({
      founderHeaders: founder.headers(),
      organizationId: A,
      requestId: id,
      body: 'Pașii, în atașament.',
      fileIds: [fileId],
    });
    const thread = await getSupportThread(memberA, ref);
    expect(thread.messages[1]!.attachments.map((a) => a.name)).toEqual(['pasii-import.png']);
  });
});

describe('S116-D18: închiderea automată după 7 zile', () => {
  it('avertizează cu o zi înainte (notificarea), apoi închide (system)', async () => {
    const { id, ref } = await newRequest(memberA);
    await replyAsTeam({
      founderHeaders: founder.headers(),
      organizationId: A,
      requestId: id,
      body: 'Ne spui dacă merge?',
    });
    await dispatchSupport();
    // the team answered 6 days and 1 hour ago (the trigger moves auto_close_at with it)
    await q(
      `UPDATE support.support_request SET last_message_at = now() - interval '6 days 1 hour' WHERE id = $1::uuid`,
      [id],
    );
    const first = await runSupportAutoCloseJob();
    expect(first.failed).toEqual([]);
    expect(first.warned).toBeGreaterThanOrEqual(1);
    await dispatchSupport();
    const warned = await q(
      `SELECT params FROM notifications.notification WHERE recipient_user_id = $1::uuid AND type = 'support.autoClose' AND params->>'ref' = $2`,
      [memberA.userId, ref],
    );
    expect(warned).toHaveLength(1);
    // not twice
    expect((await runSupportAutoCloseJob()).warned).toBe(0);

    await q(
      `UPDATE support.support_request SET last_message_at = now() - interval '8 days' WHERE id = $1::uuid`,
      [id],
    );
    const second = await runSupportAutoCloseJob();
    expect(second.closed).toBeGreaterThanOrEqual(1);
    const thread = await getSupportThread(memberA, ref);
    expect(thread.request.status).toBe('closed');
    expect(thread.request.closedByType).toBe('system');
    expect(thread.history[0]).toMatchObject({ kind: 'auto_closed', actorType: 'system' });
  });

  it('o solicitare care așteaptă echipa nu se închide singură', async () => {
    const { id } = await newRequest(memberA);
    await q(
      `UPDATE support.support_request SET last_message_at = now() - interval '30 days' WHERE id = $1::uuid`,
      [id],
    );
    await runSupportAutoCloseJob();
    const [row] = await q(`SELECT status FROM support.support_request WHERE id = $1::uuid`, [id]);
    expect(row.status).toBe('open');
  });
});
