import type { PoolClient } from 'pg';
import { guardBulkOp } from '@ventora/db-kit';
import {
  deliverEmail,
  emailFrom,
  emailMessages,
  fill,
  platformLink,
  renderOperationalEmail,
  type EmailMessages,
} from '@ventora/notifications';
import { getOrganizationCard, listLocations, type OrganizationCard } from '@ventora/organizations';
import { commitQuota, releaseQuota, reserveQuota } from '@ventora/quota';
import { CLIENT_LOCALES, type ClientLocale } from './appointments';
import { withBookingJobTx, withBookingTx } from './db';
import { issueManageToken } from './manage-token';

/*
 * Lot B.13 — the confirmation and the reminder by e-mail, in the client's language (BOOKING.md
 * B.13; design BookingClientEmails, S116; D-B-10: the client's language, the business's by default).
 *
 * The job booking.client-emails (every 5 minutes), for each business with something to do:
 *   1. schedules: the confirmation of an appointment confirmed in the last 2 hours (the first of a
 *      visit or a series), the reminder 24 hours before (confirmed, starting in 1–24 hours, booked
 *      more than 24 hours before, the reminder on in Setări). One row each in booking.client_message,
 *      unique on its dedupe key, so a double run schedules nothing twice (T6);
 *   2. claims the e-mails due (pending → sending, FOR UPDATE SKIP LOCKED: two runs never take the
 *      same row), then sends each one outside the transaction. Before sending it checks again: past
 *      valid_until, the appointment cancelled or moved, the reminder turned off, no e-mail address
 *      (or the client erased) → cancelled, never sent. A failed delivery is retried after 1 and 5
 *      minutes, then failed. A row left in 'sending' (a crash after the claim) is never sent again
 *      (at most once) and is marked failed after 15 minutes.
 *
 * Decisions of the founder (12.11): the queue is Booking's own (the delivery of core/notifications
 * reaches only the platform's users); the confirmation is not counted, the reminder is counted in
 * messaging.email as scheduled (reserveQuota scheduled: true — it goes even over the limit, D3-6);
 * the S3 template of core/notifications with the texts email.booking.* of packages/i18n.
 *
 * The sender is "{business} prin EasyBook" with the address of EMAIL_FROM (S116-D17). The reply to
 * the business's e-mail waits for a contact e-mail of the business (the organization has none
 * yet). The row keeps no personal data: the address and the language are read when it is sent.
 */

export const CLIENT_EMAIL_LIMITS = {
  businessesPerRun: 500,
  batch: 50,
  maxAttempts: 3,
  /** After the 1st and the 2nd failed attempt. */
  retryAfterSeconds: [60, 300],
  /** A row left in 'sending' longer than this is marked failed (never sent twice). */
  stuckMinutes: 15,
} as const;

export const EMAIL_QUOTA_KEY = 'messaging.email';

export type ClientMessageKind = 'confirmation' | 'reminder';

export type ClientEmailJobReport = {
  businesses: number;
  scheduled: number;
  sent: number;
  cancelled: number;
  retried: number;
  failed: number;
  errors: Array<{ organizationId: string; error: unknown }>;
};

type Claimed = {
  id: string;
  appointment_id: string;
  kind: ClientMessageKind;
  dedupe_key: string;
  valid_until: Date;
  attempts: number;
};

type Facts = {
  status: string;
  starts_at: Date;
  service_name: string;
  staff_display_name: string;
  location_id: string | null;
  client_name: string;
  email: string | null;
  locale: string;
  erased_at: Date | null;
  reminder_email: boolean;
  free_cancel_hours: number;
  expired: boolean;
};

/** The conditions shared by scheduling and by booking.client_messages_due (the migration). */
const BASE = `
  FROM booking.appointment a
  JOIN booking.client c ON c.id = a.client_id
 WHERE a.status = 'confirmed' AND c.email IS NOT NULL AND c.erased_at IS NULL
   AND a.starts_at > now() AND COALESCE(a.visit_step, 1) = 1`;

/** 1. the e-mails to schedule (each once: the unique dedupe key). */
async function schedule(client: PoolClient): Promise<number> {
  const confirmations = await client.query(
    `INSERT INTO booking.client_message
       (id, organization_id, appointment_id, kind, dedupe_key, send_after, valid_until)
     SELECT gen_random_uuid(), a.organization_id, a.id, 'confirmation',
            'confirmation:' || a.id::text, now(), a.starts_at
     ${BASE}
       AND a.status_changed_at >= now() - interval '2 hours'
       AND COALESCE(a.series_index, 1) = 1
     ON CONFLICT (organization_id, dedupe_key) DO NOTHING`,
  );
  const reminders = await client.query(
    `INSERT INTO booking.client_message
       (id, organization_id, appointment_id, kind, dedupe_key, send_after, valid_until)
     SELECT gen_random_uuid(), a.organization_id, a.id, 'reminder',
            'reminder:' || a.id::text || ':' || extract(epoch FROM a.starts_at)::bigint::text,
            now(), a.starts_at
     ${BASE}
       AND a.starts_at <= now() + interval '24 hours'
       AND a.starts_at > now() + interval '1 hour'
       AND a.created_at < a.starts_at - interval '24 hours'
       AND COALESCE((SELECT s.reminder_email FROM booking.settings s), true)
     ON CONFLICT (organization_id, dedupe_key) DO NOTHING`,
  );
  return (confirmations.rowCount ?? 0) + (reminders.rowCount ?? 0);
}

/** 2. the e-mails due, claimed (two runs never take the same row). */
async function claim(client: PoolClient): Promise<Claimed[]> {
  guardBulkOp('booking.client_message.stuck', { state: 'sending', stuck: true });
  await client.query(
    `UPDATE booking.client_message
        SET state = 'failed', reason = 'interrupted', updated_at = now()
      WHERE state = 'sending' AND updated_at < now() - make_interval(mins => $1)`,
    [CLIENT_EMAIL_LIMITS.stuckMinutes],
  );
  const { rows } = await client.query<Claimed>(
    `UPDATE booking.client_message
        SET state = 'sending', attempts = attempts + 1, updated_at = now()
      WHERE id IN (
        SELECT id FROM booking.client_message
         WHERE state = 'pending' AND send_after <= now()
         ORDER BY send_after, id
         LIMIT $1
         FOR UPDATE SKIP LOCKED)
      RETURNING id, appointment_id, kind, dedupe_key, valid_until, attempts`,
    [CLIENT_EMAIL_LIMITS.batch],
  );
  return rows;
}

async function facts(client: PoolClient, m: Claimed): Promise<Facts | null> {
  const { rows } = await client.query<Facts>(
    `SELECT a.status, a.starts_at, a.service_name, a.staff_display_name, a.location_id,
            c.name AS client_name, c.email, c.locale, c.erased_at,
            COALESCE(s.reminder_email, true) AS reminder_email,
            COALESCE(s.free_cancel_hours, 24) AS free_cancel_hours,
            ($2::timestamptz <= now()) AS expired
       FROM booking.appointment a
       JOIN booking.client c ON c.id = a.client_id
       LEFT JOIN booking.settings s ON true
      WHERE a.id = $1`,
    [m.appointment_id, m.valid_until],
  );
  return rows[0] ?? null;
}

/** Why the e-mail must not go any more, or null. */
function stale(m: Claimed, f: Facts | null): string | null {
  if (!f) return 'appointment_changed';
  if (f.expired) return 'expired';
  if (f.status !== 'confirmed') return 'appointment_changed';
  if (m.kind === 'reminder') {
    const epoch = String(Math.floor(f.starts_at.getTime() / 1000));
    if (m.dedupe_key.split(':')[2] !== epoch) return 'appointment_changed';
    if (!f.reminder_email) return 'reminder_off';
  }
  if (!f.email || f.erased_at) return 'no_email';
  return null;
}

function toLocale(value: string): ClientLocale {
  return (CLIENT_LOCALES as readonly string[]).includes(value) ? (value as ClientLocale) : 'ro';
}

/** „24 de ore”, „12 ore”, „o oră” — the plural forms of the language. */
function hoursText(t: EmailMessages['booking'], locale: ClientLocale, n: number): string {
  // Intl.PluralRules('ro'): one (1), few (0, 2–19: „12 ore”), other (20+: „24 de ore”)
  const rule = new Intl.PluralRules(locale).select(n);
  const form = rule === 'one' ? t.hours.one : rule === 'few' ? t.hours.few : t.hours.other;
  return fill(form, { n: String(n) });
}

function senderAddress(): string {
  const from = emailFrom();
  const m = /<([^>]+)>/.exec(from);
  return (m ? m[1]! : from).trim();
}

/** The name in the From header: no quotes, angle brackets or line breaks. */
const headerSafe = (v: string) => v.replace(/["<>\r\n]/g, '').trim();

export type ClientEmail = {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  locale: ClientLocale;
};

/** The e-mail of one message, in the client's language (S3 template, texts email.booking.*). */
export function renderClientEmail(input: {
  kind: ClientMessageKind;
  locale: ClientLocale;
  business: string;
  timeZone: string;
  clientName: string;
  to: string;
  service: string;
  member: string;
  startsAt: Date;
  where: string | null;
  manageUrl: string;
  freeCancelHours: number;
}): ClientEmail {
  const { locale, business } = input;
  const t = emailMessages(locale).booking;
  const when = new Intl.DateTimeFormat(locale, {
    timeZone: input.timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(input.startsAt);
  const title = input.kind === 'confirmation' ? t.confirmed.title : t.reminder.title;
  const lead =
    input.kind === 'confirmation'
      ? fill(t.confirmed.lead, { when })
      : fill(t.reminder.lead, { when, business });
  const rendered = renderOperationalEmail({
    lang: locale,
    subject: fill(t.subject, { title, business }),
    preheader: lead,
    eyebrow: business,
    title,
    lead: [
      fill(t.greet, { name: input.clientName }),
      lead,
      `${t.k.service}: ${input.service}`,
      `${t.k.member}: ${input.member}`,
      `${t.k.when}: ${when}`,
      ...(input.where ? [`${t.k.where}: ${input.where}`] : []),
    ],
    button: { label: t.manage, href: input.manageUrl },
    after:
      input.kind === 'confirmation' && input.freeCancelHours > 0
        ? [fill(t.policy, { hours: hoursText(t, locale, input.freeCancelHours) })]
        : [],
    signature: '',
    why: fill(t.why, { business }),
    company: [business, input.where, t.sentBy].filter(Boolean).join(' · '),
  });
  return {
    to: input.to,
    from: `"${headerSafe(fill(t.sender, { business }))}" <${senderAddress()}>`,
    ...rendered,
    locale,
  };
}

type Outcome = 'sent' | 'cancelled' | 'retried' | 'failed';

async function finish(
  organizationId: string,
  m: Claimed,
  state: 'sent' | 'cancelled' | 'pending' | 'failed',
  reason: string | null,
): Promise<void> {
  await withBookingTx(organizationId, (client) =>
    client.query(
      `UPDATE booking.client_message
          SET state = $2::text, reason = $3::text, updated_at = now(),
              sent_at = CASE WHEN $2::text = 'sent' THEN now() END,
              send_after = CASE WHEN $2::text = 'pending'
                                THEN now() + make_interval(secs => $4::int) ELSE send_after END
        WHERE id = $1 AND state = 'sending'`,
      [
        m.id,
        state,
        reason,
        CLIENT_EMAIL_LIMITS.retryAfterSeconds[Math.min(m.attempts, 2) - 1] ?? 300,
      ],
    ),
  );
}

async function sendOne(org: OrganizationCard, m: Claimed): Promise<Outcome> {
  const organizationId = org.organizationId;
  const f = await withBookingTx(organizationId, (client) => facts(client, m), true);
  const why = stale(m, f);
  if (why || !f) {
    await finish(organizationId, m, 'cancelled', why ?? 'appointment_changed');
    if (m.kind === 'reminder') await releaseQuietly(organizationId, m.id);
    return 'cancelled';
  }
  // the reminder counts in messaging.email, as scheduled (it goes even over the limit, D3-6)
  if (m.kind === 'reminder') {
    await reserveQuota({ organizationId }, EMAIL_QUOTA_KEY, 1, m.id, { scheduled: true });
  }
  const where = f.location_id
    ? ((await listLocations({ organizationId })).find((l) => l.id === f.location_id)?.address ??
      null)
    : null;
  // each e-mail carries its own link to the client's page (B.11b)
  const token = await withBookingTx(organizationId, (client) =>
    issueManageToken(client, organizationId, m.appointment_id),
  );
  const email = renderClientEmail({
    kind: m.kind,
    locale: toLocale(f.locale),
    business: org.name,
    timeZone: org.timeZone,
    clientName: f.client_name,
    to: f.email!,
    service: f.service_name,
    member: f.staff_display_name,
    startsAt: f.starts_at,
    where,
    manageUrl: platformLink(`/r/${org.slug}/m/${token}`),
    freeCancelHours: f.free_cancel_hours,
  });
  const result = await deliverEmail({
    to: email.to,
    from: email.from,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
  if (result.status === 'sent') {
    await finish(organizationId, m, 'sent', null);
    if (m.kind === 'reminder') await commitQuota({ organizationId }, m.id);
    return 'sent';
  }
  if (m.attempts >= CLIENT_EMAIL_LIMITS.maxAttempts) {
    await finish(organizationId, m, 'failed', result.reason);
    if (m.kind === 'reminder') await releaseQuietly(organizationId, m.id);
    return 'failed';
  }
  await finish(organizationId, m, 'pending', result.reason);
  return 'retried';
}

/** A reminder that does not go gives its unit back (nothing was reserved: nothing to do). */
async function releaseQuietly(organizationId: string, operationId: string): Promise<void> {
  try {
    await releaseQuota({ organizationId }, operationId);
  } catch {
    // no reservation for this message (never reserved, or already settled)
  }
}

/** The job booking.client-emails. */
export async function runClientEmailJob(): Promise<ClientEmailJobReport> {
  const due = await withBookingJobTx(
    async (client) =>
      (
        await client.query<{ organization_id: string }>(
          `SELECT organization_id::text FROM booking.client_messages_due($1)`,
          [CLIENT_EMAIL_LIMITS.businessesPerRun],
        )
      ).rows,
  );
  const report: ClientEmailJobReport = {
    businesses: due.length,
    scheduled: 0,
    sent: 0,
    cancelled: 0,
    retried: 0,
    failed: 0,
    errors: [],
  };
  for (const { organization_id: organizationId } of due) {
    try {
      const org = await getOrganizationCard(organizationId);
      if (!org || !org.active) continue;
      const claimed = await withBookingTx(organizationId, async (client) => {
        report.scheduled += await schedule(client);
        return claim(client);
      });
      for (const m of claimed) {
        try {
          report[await sendOne(org, m)] += 1;
        } catch (error) {
          // the row stays 'sending' and is marked failed later: never sent twice
          report.errors.push({ organizationId, error });
        }
      }
    } catch (error) {
      report.errors.push({ organizationId, error });
    }
  }
  return report;
}
