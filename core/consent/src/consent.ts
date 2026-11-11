import { AuditActions, appendAuditEventInTx, pgExecutor } from '@ventora/audit';
import { Conflict, InvalidInput } from '@ventora/errors';
import type { PoolClient } from 'pg';
import { addressHash, CONSENT_CHANNELS, truncateIp, type ConsentChannel } from './address';
import { withConsentTx } from './db';
import { verifyPublicConsentToken } from './public-token';

/*
 * Lot C.5 — the shared consent (plans/CAMPAIGNKIT.md, D-CK-1 = a). Used by ClientDesk (CR.14,
 * instead of crm_consent), CampaignKit and later EasyBook. The caller has already authorized the
 * person (its own permission, in its own contract) and checked the organization (guardTenant);
 * this package only keeps the registry and answers "may I send?".
 *
 *   canSend         → not suppressed AND the person's last consent on the channel is "given"
 *   recordConsent   → "given", with the text and its version, the source and the proof
 *   withdraw        → "withdrawn" + the address goes into the suppression list (anyone, at once)
 *   suppress        → bounce / spam report / STOP: the address into the suppression list
 *   suppressionCheck→ is the address suppressed (without a person, e.g. an import)
 *   consentHistory  → every change of one person, newest first
 *
 * Audit (decision 11.11.2026): the registry is the history. A row in audit_log only for what a team
 * member does by hand (actorUserId set: record or withdraw from the application), in the same
 * transaction, on the category of the calling application (`audit: 'crm'`; `marketing` waits for
 * its category to be approved). A public form or the unsubscribe page writes no audit row.
 *
 * Booking messages and replies to requests need no consent (ClientDeskConsent): only the
 * "marketing" purpose exists.
 */

export const CONSENT_SUBJECT_TYPES = [
  'crm_contact',
  'marketing_contact',
  'booking_client',
] as const;
export type ConsentSubjectType = (typeof CONSENT_SUBJECT_TYPES)[number];

export type ConsentSubject = { type: ConsentSubjectType; id: string };

/**
 * What a business's contract may write (decision 11.11.2026): `form_confirmed` and `preferences`
 * are not here, they come only from the public flows with a signed token
 * (recordConsentFromPublicToken).
 */
export const CONSENT_GIVEN_SOURCES = ['form', 'import', 'manual', 'booking', 'crm'] as const;
export type ConsentGivenSource = (typeof CONSENT_GIVEN_SOURCES)[number];

export const CONSENT_WITHDRAW_SOURCES = [
  'manual',
  'unsubscribe',
  'sms_stop',
  'crm',
  'booking',
] as const;
export type ConsentWithdrawSource = (typeof CONSENT_WITHDRAW_SOURCES)[number];

export type SuppressionReason = 'unsubscribed' | 'bounced' | 'spam_report';

export type ConsentState = 'given' | 'withdrawn' | 'unknown';

export type ConsentEvent = {
  id: string;
  channel: ConsentChannel;
  state: 'given' | 'withdrawn';
  source: string;
  text: string | null;
  textVersion: string | null;
  reason: string | null;
  proofFileId: string | null;
  actorUserId: string | null;
  createdAt: Date;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuid(field: string, value: string | null | undefined): void {
  if (value != null && !UUID.test(value)) throw new InvalidInput(field);
}

function channelOf(channel: string): ConsentChannel {
  if (!(CONSENT_CHANNELS as readonly string[]).includes(channel)) {
    throw new InvalidInput('channel');
  }
  return channel as ConsentChannel;
}

function subjectOf(subject: ConsentSubject): ConsentSubject {
  if (!(CONSENT_SUBJECT_TYPES as readonly string[]).includes(subject.type)) {
    throw new InvalidInput('subject');
  }
  uuid('subject', subject.id);
  return subject;
}

function text(field: string, value: string | null | undefined, max: number): string | null {
  if (value == null) return null;
  const v = value.trim();
  if (v.length === 0) return null;
  if (v.length > max) throw new InvalidInput(field);
  return v;
}

/** May a marketing message go to this address of this person, on this channel, now? */
export async function canSend(input: {
  organizationId: string;
  channel: ConsentChannel;
  address: string;
  subject: ConsentSubject;
}): Promise<boolean> {
  uuid('organizationId', input.organizationId);
  const channel = channelOf(input.channel);
  const subject = subjectOf(input.subject);
  const hash = addressHash(input.organizationId, channel, input.address);
  return withConsentTx(
    input.organizationId,
    async (client) => {
      const suppressed = await client.query(
        `SELECT 1 FROM consent.suppression WHERE channel = $1 AND address_hash = $2`,
        [channel, hash],
      );
      if (suppressed.rowCount) return false;
      const { rows } = await client.query<{ state: string; address_hash: string }>(
        `SELECT state, address_hash FROM consent.consent_state
          WHERE subject_type = $1 AND subject_id = $2 AND channel = $3 AND purpose = 'marketing'`,
        [subject.type, subject.id, channel],
      );
      // the consent was given for this address: a changed address needs a new consent
      return rows[0]?.state === 'given' && rows[0].address_hash === hash;
    },
    true,
  );
}

/** The person's state on each channel (ClientDeskConsent: „Dat” / „Retras” / „Necunoscut”). */
export async function consentStates(input: {
  organizationId: string;
  subject: ConsentSubject;
}): Promise<Record<ConsentChannel, ConsentState>> {
  uuid('organizationId', input.organizationId);
  const subject = subjectOf(input.subject);
  const { rows } = await withConsentTx(
    input.organizationId,
    (client) =>
      client.query<{ channel: ConsentChannel; state: 'given' | 'withdrawn' }>(
        `SELECT channel, state FROM consent.consent_state
          WHERE subject_type = $1 AND subject_id = $2 AND purpose = 'marketing'`,
        [subject.type, subject.id],
      ),
    true,
  );
  const out = { email: 'unknown', sms: 'unknown', whatsapp: 'unknown' } as Record<
    ConsentChannel,
    ConsentState
  >;
  for (const r of rows) out[r.channel] = r.state;
  return out;
}

/** Who calls on behalf of a team member: the application whose audit category gets the row. */
export type ConsentAuditApp = 'crm';

const AUDIT_TARGET: Record<ConsentAuditApp, ConsentSubjectType> = { crm: 'crm_contact' };

/** A team member's action needs the calling application; the subject must belong to it. */
function auditOf(
  actorUserId: string | null | undefined,
  audit: ConsentAuditApp | undefined,
  subject: ConsentSubject,
): ConsentAuditApp | null {
  if (!actorUserId) {
    if (audit) throw new InvalidInput('audit');
    return null;
  }
  if (!audit || !(audit in AUDIT_TARGET)) throw new InvalidInput('audit');
  if (AUDIT_TARGET[audit] !== subject.type) throw new InvalidInput('audit');
  return audit;
}

async function auditRow(
  client: PoolClient,
  input: { organizationId: string; actorUserId: string; subject: ConsentSubject },
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await appendAuditEventInTx(pgExecutor(client), {
    category: 'crm',
    action,
    outcome: 'success',
    actorType: 'user',
    actorId: input.actorUserId,
    organizationId: input.organizationId,
    targetType: 'crm_contact',
    targetId: input.subject.id,
    // never the address or the text: the channel, the source and the text version only
    metadata,
  });
}

/**
 * "Given": the text and its version are required; an import or a manual record also needs the
 * reason (ClientDeskConsent). A suppressed address can only be subscribed again by the person
 * (form_confirmed / preferences, recordConsentFromPublicToken); otherwise CONFLICT (the database refuses it too).
 */
export async function recordConsent(input: {
  organizationId: string;
  subject: ConsentSubject;
  channel: ConsentChannel;
  address: string;
  source: ConsentGivenSource;
  text: string;
  textVersion: string;
  reason?: string | null;
  proofFileId?: string | null;
  ip?: string | null;
  actorUserId?: string | null;
  /** Required with actorUserId (a team member's action): the application of the audit row. */
  audit?: ConsentAuditApp;
}): Promise<{ id: string }> {
  uuid('organizationId', input.organizationId);
  uuid('proofFileId', input.proofFileId);
  uuid('actorUserId', input.actorUserId);
  const channel = channelOf(input.channel);
  const subject = subjectOf(input.subject);
  if (!(CONSENT_GIVEN_SOURCES as readonly string[]).includes(input.source)) {
    throw new InvalidInput('source');
  }
  const consentText = text('text', input.text, 4000);
  if (!consentText) throw new InvalidInput('text');
  const version = text('textVersion', input.textVersion, 64);
  if (!version) throw new InvalidInput('textVersion');
  const reason = text('reason', input.reason, 1000);
  if ((input.source === 'import' || input.source === 'manual') && !reason) {
    throw new InvalidInput('reason');
  }
  const audit = auditOf(input.actorUserId, input.audit, subject);
  const hash = addressHash(input.organizationId, channel, input.address);
  try {
    return await withConsentTx(input.organizationId, async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO consent.consent_event
           (organization_id, subject_type, subject_id, channel, purpose, state, address_hash,
            source, text, text_version, reason, proof_file_id, ip_truncated, actor_user_id)
         VALUES ($1, $2, $3, $4, 'marketing', 'given', $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [
          input.organizationId,
          subject.type,
          subject.id,
          channel,
          hash,
          input.source,
          consentText,
          version,
          reason,
          input.proofFileId ?? null,
          truncateIp(input.ip),
          input.actorUserId ?? null,
        ],
      );
      const id = rows[0]!.id;
      if (audit) {
        await auditRow(
          client,
          { organizationId: input.organizationId, actorUserId: input.actorUserId!, subject },
          AuditActions.crmConsentRecorded,
          { consentId: id, channel, source: input.source, textVersion: version },
        );
      }
      return { id };
    });
  } catch (err) {
    if ((err as { code?: string }).code === '23514') throw new Conflict('address suppressed');
    throw err;
  }
}

/** "Withdrawn": anyone, at once, no proof; the address goes into the suppression list. */
export async function withdraw(input: {
  organizationId: string;
  subject: ConsentSubject;
  channel: ConsentChannel;
  address: string;
  source: ConsentWithdrawSource;
  reason?: string | null;
  ip?: string | null;
  actorUserId?: string | null;
  /** Where it came from: the application (crm / marketing / booking) or the public page. */
  origin: string;
  /** Required with actorUserId (a team member's action): the application of the audit row. */
  audit?: ConsentAuditApp;
}): Promise<void> {
  uuid('organizationId', input.organizationId);
  uuid('actorUserId', input.actorUserId);
  const channel = channelOf(input.channel);
  const subject = subjectOf(input.subject);
  if (!(CONSENT_WITHDRAW_SOURCES as readonly string[]).includes(input.source)) {
    throw new InvalidInput('source');
  }
  const origin = text('origin', input.origin, 32);
  if (!origin) throw new InvalidInput('origin');
  const audit = auditOf(input.actorUserId, input.audit, subject);
  const hash = addressHash(input.organizationId, channel, input.address);
  await withConsentTx(input.organizationId, async (client) => {
    await client.query(
      `INSERT INTO consent.consent_event
         (organization_id, subject_type, subject_id, channel, purpose, state, address_hash,
          source, reason, ip_truncated, actor_user_id)
       VALUES ($1, $2, $3, $4, 'marketing', 'withdrawn', $5, $6, $7, $8, $9)`,
      [
        input.organizationId,
        subject.type,
        subject.id,
        channel,
        hash,
        input.source,
        text('reason', input.reason, 1000),
        truncateIp(input.ip),
        input.actorUserId ?? null,
      ],
    );
    await client.query(
      `INSERT INTO consent.suppression (organization_id, channel, address_hash, reason, origin)
       VALUES ($1, $2, $3, 'unsubscribed', $4)
       ON CONFLICT DO NOTHING`,
      [input.organizationId, channel, hash, origin],
    );
    if (audit) {
      await auditRow(
        client,
        { organizationId: input.organizationId, actorUserId: input.actorUserId!, subject },
        AuditActions.crmConsentWithdrawn,
        { channel, source: input.source },
      );
    }
  });
}

/** A bounce, a spam report or a STOP: the address is suppressed (without a person, if unknown). */
export async function suppress(input: {
  organizationId: string;
  channel: ConsentChannel;
  address: string;
  reason: SuppressionReason;
  origin: string;
}): Promise<void> {
  uuid('organizationId', input.organizationId);
  const channel = channelOf(input.channel);
  if (!['unsubscribed', 'bounced', 'spam_report'].includes(input.reason)) {
    throw new InvalidInput('reason');
  }
  const origin = text('origin', input.origin, 32);
  if (!origin) throw new InvalidInput('origin');
  const hash = addressHash(input.organizationId, channel, input.address);
  await withConsentTx(input.organizationId, (client) =>
    client.query(
      `INSERT INTO consent.suppression (organization_id, channel, address_hash, reason, origin)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [input.organizationId, channel, hash, input.reason, origin],
    ),
  );
}

export async function suppressionCheck(input: {
  organizationId: string;
  channel: ConsentChannel;
  address: string;
}): Promise<{ suppressed: false } | { suppressed: true; reason: SuppressionReason; since: Date }> {
  uuid('organizationId', input.organizationId);
  const channel = channelOf(input.channel);
  const hash = addressHash(input.organizationId, channel, input.address);
  const { rows } = await withConsentTx(
    input.organizationId,
    (client) =>
      client.query<{ reason: SuppressionReason; created_at: Date }>(
        `SELECT reason, created_at FROM consent.suppression
          WHERE channel = $1 AND address_hash = $2`,
        [channel, hash],
      ),
    true,
  );
  const r = rows[0];
  return r ? { suppressed: true, reason: r.reason, since: r.created_at } : { suppressed: false };
}

export async function consentHistory(input: {
  organizationId: string;
  subject: ConsentSubject;
  limit?: number;
}): Promise<ConsentEvent[]> {
  uuid('organizationId', input.organizationId);
  const subject = subjectOf(input.subject);
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const { rows } = await withConsentTx(
    input.organizationId,
    (client) =>
      client.query<{
        id: string;
        channel: ConsentChannel;
        state: 'given' | 'withdrawn';
        source: string;
        text: string | null;
        text_version: string | null;
        reason: string | null;
        proof_file_id: string | null;
        actor_user_id: string | null;
        created_at: Date;
      }>(
        `SELECT id, channel, state, source, text, text_version, reason, proof_file_id,
                actor_user_id, created_at
           FROM consent.consent_event
          WHERE subject_type = $1 AND subject_id = $2 AND purpose = 'marketing'
          ORDER BY created_at DESC, id DESC
          LIMIT $3`,
        [subject.type, subject.id, limit],
      ),
    true,
  );
  return rows.map((r) => ({
    id: r.id,
    channel: r.channel,
    state: r.state,
    source: r.source,
    text: r.text,
    textVersion: r.text_version,
    reason: r.reason,
    proofFileId: r.proof_file_id,
    actorUserId: r.actor_user_id,
    createdAt: r.created_at,
  }));
}

/**
 * The public flows only (decision 11.11.2026): the confirmation link of a form (`form_confirmed`,
 * "given") and the preferences page (`preferences`, "given" or "withdrawn"), with the signed token
 * the person received. No team member, no session: the token is the proof. A "withdrawn" also puts
 * the address into the suppression list; a "given" from here is the only way out of an
 * unsubscribe (release_suppression).
 */
export async function recordConsentFromPublicToken(input: {
  token: string;
  state: 'given' | 'withdrawn';
  /** Required for "given": the exact text the person saw and its version. */
  text?: string | null;
  textVersion?: string | null;
  ip?: string | null;
}): Promise<void> {
  const claims = verifyPublicConsentToken(input.token);
  if (input.state !== 'given' && input.state !== 'withdrawn') throw new InvalidInput('state');
  if (claims.purpose === 'form_confirmed' && input.state !== 'given') {
    throw new InvalidInput('state');
  }
  const consentText = text('text', input.text, 4000);
  const version = text('textVersion', input.textVersion, 64);
  if (input.state === 'given' && (!consentText || !version)) throw new InvalidInput('text');
  await withConsentTx(claims.organizationId, async (client) => {
    await client.query(
      `INSERT INTO consent.consent_event
         (organization_id, subject_type, subject_id, channel, purpose, state, address_hash,
          source, text, text_version, ip_truncated, actor_user_id)
       VALUES ($1, $2, $3, $4, 'marketing', $5, $6, $7, $8, $9, $10, NULL)`,
      [
        claims.organizationId,
        claims.subject.type,
        claims.subject.id,
        claims.channel,
        input.state,
        claims.addressHash,
        claims.purpose,
        input.state === 'given' ? consentText : null,
        input.state === 'given' ? version : null,
        truncateIp(input.ip),
      ],
    );
    if (input.state === 'withdrawn') {
      await client.query(
        `INSERT INTO consent.suppression (organization_id, channel, address_hash, reason, origin)
         VALUES ($1, $2, $3, 'unsubscribed', 'public')
         ON CONFLICT DO NOTHING`,
        [claims.organizationId, claims.channel, claims.addressHash],
      );
    }
  });
}
