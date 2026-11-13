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
import {
  customTemplateFor,
  fillTemplate,
  paragraphs,
  type TemplateKind,
  type TemplateText,
} from './message-templates';

/*
 * Lot B.13 — the confirmation and the reminder by e-mail, in the client's language (BOOKING.md
 * B.13; design BookingClientEmails, S116; D-B-10: the client's language, the business's by default).
 * Lot B.14 — the cancellation (by the client / by the business), the change and the thanks after
 * the visit, on the same queue and with the same rules (design BookingClientEmails, S116;
 * BookingMessageTemplates, S127).
 *
 * The job booking.client-emails (every 5 minutes), for each business with something to do:
 *   1. schedules, one row each in booking.client_message, unique on its dedupe key, so a double run
 *      schedules nothing twice (T6):
 *      - the confirmation of an appointment confirmed in the last 2 hours (the first of a visit or a
 *        series);
 *      - the reminder 24 hours before (confirmed, starting in 1–24 hours, booked more than 24 hours
 *        before, the reminder on in Setări);
 *      - B.14: the cancellation of a confirmed appointment in the last 2 hours, still ahead (of a
 *        series cancelled at once, only the first);
 *      - B.14: the change, a move by the business in the last 2 hours of a confirmed appointment
 *        still ahead (not a move by the client on their page; of a series moved at once, only the
 *        first; only the latest move);
 *      - B.14: the thanks, 2 hours after a completed appointment (of a visit: its last step), at most
 *        24 hours late, the thanks on in Setări;
 *   2. claims the e-mails due (pending → sending, FOR UPDATE SKIP LOCKED: two runs never take the
 *      same row), then sends each one outside the transaction. Before sending it checks again: past
 *      valid_until, the appointment changed since (cancelled, moved again, no longer completed), the
 *      e-mail turned off, no e-mail address (or the client erased) → cancelled, never sent. A failed
 *      delivery is retried after 1 and 5 minutes, then failed. A row left in 'sending' (a crash
 *      after the claim) is never sent again (at most once) and is marked failed after 15 minutes.
 *
 * Decisions of the founder (12.11, 13.11): the queue is Booking's own (the delivery of
 * core/notifications reaches only the platform's users); the confirmation, the cancellation and the
 * change always go and are not counted; the reminder and the thanks can be turned off and are
 * counted in messaging.email as scheduled (reserveQuota scheduled: true — they go even over the
 * limit, D3-6); the S3 template of core/notifications with the texts email.booking.* of
 * packages/i18n. The texts are Ventora's; their editor is B.14b.
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

export type ClientMessageKind = 'confirmation' | 'reminder' | 'cancellation' | 'change' | 'thanks';

/** The e-mails that can be turned off are counted in messaging.email, as scheduled. */
const COUNTED: ReadonlySet<ClientMessageKind> = new Set(['reminder', 'thanks']);

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
  cancelled_by: 'client' | 'business' | null;
  client_name: string;
  email: string | null;
  locale: string;
  erased_at: Date | null;
  reminder_email: boolean;
  thanks_email: boolean;
  free_cancel_hours: number;
  expired: boolean;
  /** change: the start written by the move, the start before it, who moved it. */
  moved_to: Date | null;
  moved_from: Date | null;
  moved_by: string | null;
};

/** The conditions shared by scheduling and by booking.client_messages_due (the migrations). */
const CLIENT = `JOIN booking.client c ON c.id = a.client_id
  WHERE c.email IS NOT NULL AND c.erased_at IS NULL`;
const BASE = `
  FROM booking.appointment a
  ${CLIENT}
   AND a.status = 'confirmed' AND a.starts_at > now() AND COALESCE(a.visit_step, 1) = 1`;
const INSERT = `INSERT INTO booking.client_message
       (id, organization_id, appointment_id, kind, dedupe_key, send_after, valid_until)`;
const ONCE = `ON CONFLICT (organization_id, dedupe_key) DO NOTHING`;

/** 1. the e-mails to schedule (each once: the unique dedupe key). */
async function schedule(client: PoolClient): Promise<number> {
  const inserts = [
    `${INSERT}
     SELECT gen_random_uuid(), a.organization_id, a.id, 'confirmation',
            'confirmation:' || a.id::text, now(), a.starts_at
     ${BASE}
       AND a.status_changed_at >= now() - interval '2 hours'
       AND COALESCE(a.series_index, 1) = 1
     ${ONCE}`,
    `${INSERT}
     SELECT gen_random_uuid(), a.organization_id, a.id, 'reminder',
            'reminder:' || a.id::text || ':' || extract(epoch FROM a.starts_at)::bigint::text,
            now(), a.starts_at
     ${BASE}
       AND a.starts_at <= now() + interval '24 hours'
       AND a.starts_at > now() + interval '1 hour'
       AND a.created_at < a.starts_at - interval '24 hours'
       AND COALESCE((SELECT s.reminder_email FROM booking.settings s), true)
     ${ONCE}`,
    // B.14: a confirmed appointment cancelled (of a series cancelled at once: the first)
    `${INSERT}
     SELECT gen_random_uuid(), a.organization_id, a.id, 'cancellation',
            'cancellation:' || a.id::text, now(), a.starts_at
       FROM booking.appointment a
       ${CLIENT}
        AND a.status = 'cancelled' AND a.cancelled_at >= now() - interval '2 hours'
        AND a.starts_at > now() AND COALESCE(a.visit_step, 1) = 1
        AND EXISTS (
          SELECT 1 FROM booking.appointment_history h
           WHERE h.appointment_id = a.id AND h.kind = 'status'
             AND h.from_status = 'confirmed' AND h.to_status = 'cancelled')
        AND NOT EXISTS (
          SELECT 1 FROM booking.appointment b
           WHERE b.series_id = a.series_id AND b.status = 'cancelled'
             AND b.cancelled_at = a.cancelled_at AND b.starts_at < a.starts_at)
     ${ONCE}`,
    // B.14: a move (by the business, or by the client on their page: a short e-mail); of a series
    // moved at once: the first; only the latest move
    `${INSERT}
     SELECT gen_random_uuid(), a.organization_id, a.id, 'change',
            'change:' || h.id::text, now(), a.starts_at
       FROM booking.appointment_history h
       JOIN booking.appointment a ON a.id = h.appointment_id
       ${CLIENT}
        AND h.kind = 'moved'
        AND h.created_at >= now() - interval '2 hours'
        AND a.status = 'confirmed' AND a.starts_at > now() AND COALESCE(a.visit_step, 1) = 1
        AND NOT EXISTS (
          SELECT 1 FROM booking.appointment_history l
           WHERE l.appointment_id = h.appointment_id AND l.kind = 'moved' AND l.id > h.id)
        AND NOT EXISTS (
          SELECT 1 FROM booking.appointment_history h2
            JOIN booking.appointment b ON b.id = h2.appointment_id
           WHERE h2.kind = 'moved' AND h2.created_at = h.created_at
             AND b.series_id = a.series_id AND b.starts_at < a.starts_at)
     ${ONCE}`,
    // B.14: the thanks, 2 hours after a completed appointment (of a visit: its last step)
    `${INSERT}
     SELECT gen_random_uuid(), a.organization_id, a.id, 'thanks',
            'thanks:' || a.id::text, now(), a.ends_at + interval '26 hours'
       FROM booking.appointment a
       ${CLIENT}
        AND a.status = 'completed'
        AND a.ends_at <= now() - interval '2 hours'
        AND a.ends_at > now() - interval '26 hours'
        AND COALESCE(a.visit_step, 1) = COALESCE(a.visit_steps, 1)
        AND COALESCE((SELECT s.thanks_email FROM booking.settings s), true)
     ${ONCE}`,
  ];
  let scheduled = 0;
  for (const sql of inserts) scheduled += (await client.query(sql)).rowCount ?? 0;
  return scheduled;
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

/** change:<history row> → the history row; the other kinds have none. */
function movedHistoryId(m: Claimed): string | null {
  return m.kind === 'change' ? (m.dedupe_key.split(':')[1] ?? null) : null;
}

async function facts(client: PoolClient, m: Claimed): Promise<Facts | null> {
  const { rows } = await client.query<Facts>(
    `SELECT a.status, a.starts_at, a.service_name, a.staff_display_name, a.location_id,
            a.cancelled_by, c.name AS client_name, c.email, c.locale, c.erased_at,
            COALESCE(s.reminder_email, true) AS reminder_email,
            COALESCE(s.thanks_email, true) AS thanks_email,
            COALESCE(s.free_cancel_hours, 24) AS free_cancel_hours,
            ($2::timestamptz <= now()) AS expired,
            h.starts_at AS moved_to, h.actor_type AS moved_by,
            (SELECT p.starts_at FROM booking.appointment_history p
              WHERE p.appointment_id = a.id AND p.starts_at IS NOT NULL AND p.id < h.id
              ORDER BY p.id DESC LIMIT 1) AS moved_from
       FROM booking.appointment a
       JOIN booking.client c ON c.id = a.client_id
       LEFT JOIN booking.settings s ON true
       LEFT JOIN booking.appointment_history h
              ON h.id = $3::uuid AND h.appointment_id = a.id AND h.kind = 'moved'
      WHERE a.id = $1`,
    [m.appointment_id, m.valid_until, movedHistoryId(m)],
  );
  return rows[0] ?? null;
}

/** Why the e-mail must not go any more, or null. */
function stale(m: Claimed, f: Facts | null): string | null {
  if (!f) return 'appointment_changed';
  if (f.expired) return 'expired';
  switch (m.kind) {
    case 'confirmation':
      if (f.status !== 'confirmed') return 'appointment_changed';
      break;
    case 'reminder': {
      if (f.status !== 'confirmed') return 'appointment_changed';
      const epoch = String(Math.floor(f.starts_at.getTime() / 1000));
      if (m.dedupe_key.split(':')[2] !== epoch) return 'appointment_changed';
      if (!f.reminder_email) return 'reminder_off';
      break;
    }
    case 'cancellation':
      if (f.status !== 'cancelled') return 'appointment_changed';
      break;
    case 'change':
      // moved again since (the newer move has its own e-mail) or no longer confirmed
      if (f.status !== 'confirmed' || !f.moved_to || !f.moved_from) return 'appointment_changed';
      if (f.moved_to.getTime() !== f.starts_at.getTime()) return 'appointment_changed';
      break;
    case 'thanks':
      if (f.status !== 'completed') return 'appointment_changed';
      if (!f.thanks_email) return 'thanks_off';
      break;
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

/** {client} in the business's texts: the first name (S127, „prenumele clientului”). */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

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

export type ClientEmailInput = {
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
  /** The client's page (B.11b): confirmation, reminder, change. */
  manageUrl: string | null;
  /** The booking page of the business (/r/<slug>): cancellation, thanks. */
  bookUrl: string;
  freeCancelHours: number;
  /** cancellation: who cancelled. */
  cancelledBy?: 'client' | 'business' | null;
  /** change: the start before the move. */
  movedFrom?: Date | null;
  /** change: moved by the client on their page (a short e-mail). */
  movedByClient?: boolean;
  /**
   * B.14b: the business's text of this message in the client's language (subject + body, with the
   * variables), or null for the Ventora text. The appointment block, the policy line, the button and
   * the footer stay. Not used for the short e-mails of the client's own cancellation or move.
   */
  custom?: TemplateText | null;
};

/** B.14b: the e-mails that take the business's text (the client's own action keeps Ventora's). */
export function takesCustomText(
  input: Pick<ClientEmailInput, 'kind' | 'cancelledBy' | 'movedByClient'>,
) {
  if (input.kind === 'cancellation') return input.cancelledBy === 'business';
  if (input.kind === 'change') return !input.movedByClient;
  return true;
}

type Parts = {
  title: string;
  lead: string;
  rows: string[];
  after: string[];
  button: { label: string; href: string };
};

/** The e-mail of one message, in the client's language (S3 template, texts email.booking.*). */
export function renderClientEmail(input: ClientEmailInput): ClientEmail {
  const { locale, business } = input;
  const t = emailMessages(locale).booking;
  const format = (d: Date) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: input.timeZone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  const when = format(input.startsAt);
  const where = input.where ? [`${t.k.where}: ${input.where}`] : [];
  const appointment = [
    `${t.k.service}: ${input.service}`,
    `${t.k.member}: ${input.member}`,
    `${t.k.when}: ${when}`,
    ...where,
  ];
  const manage = { label: t.manage, href: input.manageUrl ?? input.bookUrl };
  const rebook = { label: t.rebook, href: input.bookUrl };

  const parts = ((): Parts => {
    switch (input.kind) {
      case 'confirmation':
        return {
          title: t.confirmed.title,
          lead: fill(t.confirmed.lead, { when }),
          rows: appointment,
          after:
            input.freeCancelHours > 0
              ? [fill(t.policy, { hours: hoursText(t, locale, input.freeCancelHours) })]
              : [],
          button: manage,
        };
      case 'reminder':
        return {
          title: t.reminder.title,
          lead: fill(t.reminder.lead, { when, business }),
          rows: appointment,
          after: [],
          button: manage,
        };
      case 'cancellation':
        return input.cancelledBy === 'business'
          ? {
              title: fill(t.cancelSalon.title, { business }),
              lead: fill(t.cancelSalon.lead, { when }),
              rows: [],
              after: [],
              button: { label: t.cancelSalon.cta, href: input.bookUrl },
            }
          : {
              title: t.cancelClient.title,
              lead: fill(t.cancelClient.lead, { when }),
              rows: [],
              after: [],
              button: rebook,
            };
      case 'change':
        if (input.movedByClient)
          return {
            title: t.movedClient.title,
            lead: fill(t.movedClient.lead, { when }),
            rows: [`${t.k.service}: ${input.service}`, ...where],
            after: [],
            button: manage,
          };
        return {
          title: t.moved.title,
          lead: fill(t.moved.lead, { business }),
          // the design: the new time, the time before, the service, who
          rows: [
            `${t.k.when}: ${when}`,
            ...(input.movedFrom ? [`${t.k.before}: ${format(input.movedFrom)}`] : []),
            `${t.k.service}: ${input.service}`,
            `${t.k.member}: ${input.member}`,
            ...where,
          ],
          after: [t.moved.note],
          button: manage,
        };
      case 'thanks':
        return {
          title: fill(t.thanks.title, { name: input.clientName }),
          lead: fill(t.thanks.lead, { business, service: input.service }),
          rows: [],
          after: [t.thanks.after],
          button: rebook,
        };
    }
  })();

  let title = parts.title;
  let opening = [fill(t.greet, { name: input.clientName }), parts.lead];
  let after = parts.after;
  if (input.custom && takesCustomText(input)) {
    const own = fillTemplate(input.custom, {
      client: firstName(input.clientName),
      service: input.service,
      date: new Intl.DateTimeFormat(locale, {
        timeZone: input.timeZone,
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(input.startsAt),
      time: new Intl.DateTimeFormat(locale, {
        timeZone: input.timeZone,
        hour: '2-digit',
        minute: '2-digit',
      }).format(input.startsAt),
      member: input.member,
      business,
      link: parts.button.href,
    });
    title = own.subject;
    opening = paragraphs(own.body);
    // the policy line of the confirmation stays; the other closing lines are part of the text now
    after = input.kind === 'confirmation' ? parts.after : [];
  }

  const rendered = renderOperationalEmail({
    lang: locale,
    subject: fill(t.subject, { title, business }),
    preheader: opening[1] ?? opening[0] ?? title,
    eyebrow: business,
    title,
    lead: [...opening, ...parts.rows],
    button: parts.button,
    after,
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

/** The client's page link goes with the e-mails about an appointment still ahead. */
const WITH_MANAGE: ReadonlySet<ClientMessageKind> = new Set(['confirmation', 'reminder', 'change']);

async function sendOne(org: OrganizationCard, m: Claimed): Promise<Outcome> {
  const organizationId = org.organizationId;
  const counted = COUNTED.has(m.kind);
  const f = await withBookingTx(organizationId, (client) => facts(client, m), true);
  const why = stale(m, f);
  if (why || !f) {
    await finish(organizationId, m, 'cancelled', why ?? 'appointment_changed');
    if (counted) await releaseQuietly(organizationId, m.id);
    return 'cancelled';
  }
  // the reminder and the thanks count in messaging.email, as scheduled (over the limit too, D3-6)
  if (counted) {
    await reserveQuota({ organizationId }, EMAIL_QUOTA_KEY, 1, m.id, { scheduled: true });
  }
  const where = f.location_id
    ? ((await listLocations({ organizationId })).find((l) => l.id === f.location_id)?.address ??
      null)
    : null;
  // each e-mail about an appointment ahead carries its own link to the client's page (B.11b)
  const token = WITH_MANAGE.has(m.kind)
    ? await withBookingTx(organizationId, (client) =>
        issueManageToken(client, organizationId, m.appointment_id),
      )
    : null;
  const locale = toLocale(f.locale);
  const custom = await withBookingTx(
    organizationId,
    (client) => customTemplateFor(client, m.kind as TemplateKind, locale),
    true,
  );
  const email = renderClientEmail({
    kind: m.kind,
    locale,
    business: org.name,
    timeZone: org.timeZone,
    clientName: f.client_name,
    to: f.email!,
    service: f.service_name,
    member: f.staff_display_name,
    startsAt: f.starts_at,
    where,
    manageUrl: token ? platformLink(`/r/${org.slug}/m/${token}`) : null,
    bookUrl: platformLink(`/r/${org.slug}`),
    freeCancelHours: f.free_cancel_hours,
    cancelledBy: f.cancelled_by,
    movedFrom: f.moved_from,
    movedByClient: f.moved_by === 'client',
    custom,
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
    if (counted) await commitQuota({ organizationId }, m.id);
    return 'sent';
  }
  if (m.attempts >= CLIENT_EMAIL_LIMITS.maxAttempts) {
    await finish(organizationId, m, 'failed', result.reason);
    if (counted) await releaseQuietly(organizationId, m.id);
    return 'failed';
  }
  await finish(organizationId, m, 'pending', result.reason);
  return 'retried';
}

/** An e-mail that does not go gives its unit back (nothing was reserved: nothing to do). */
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
