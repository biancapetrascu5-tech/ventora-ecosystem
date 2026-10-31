import type { Locale } from '@ventora/i18n';
import { renderOperationalEmail } from '../templates/layout';
import { emailMessages, fill } from '../templates/messages';
import type { EmailChannel } from '../email';
import { defaultCatalog, type NotificationCatalog } from './catalog';
import { notificationText, renderNotification, toLocale } from './render';
import type { SqlClient } from './sql';

/*
 * The delivery job (Lot 4.3; registered in apps/platform/src/server/jobs.ts, every minute).
 * For each pending delivery, one transaction in the recipient's context (app.user_id from the
 * row, notifications_rw): the row is locked (FOR UPDATE SKIP LOCKED) until COMMIT, so two runs
 * never send the same email; a sent delivery is never sent again.
 *
 *   - past `valid_until` → cancelled, not sent;
 *   - the provider fails → retried after 1 and 5 minutes, then `failed` with the reason (no
 *     duplicate: the row stays locked during the send and is marked in the same transaction);
 *   - a channel without an adapter (SMS today, D4-26) → `failed: not_configured`, no retries.
 * The text is rendered in the recipient's language (UserPreference, D4-8), RO when not chosen.
 */

export const DELIVERY_MAX_ATTEMPTS = 3;
const BACKOFF_SECONDS = [60, 300];

export interface DeliveryContact {
  email: string;
  name: string;
  locale: string | null;
}

/** identity's getNotificationContactsInTx, injected by the app (no dependency cycle). */
export type ContactResolver = (
  tx: SqlClient,
  userIds: readonly string[],
) => Promise<Map<string, DeliveryContact>>;

export interface DeliveryChannels {
  email?: EmailChannel;
  // D4-7: sms, whatsapp… as more channels, without changing the model
  [channel: string]: EmailChannel | undefined;
}

export interface DeliveryReport {
  sent: number;
  retried: number;
  failed: number;
  cancelled: number;
  skipped: number;
}

interface PoolLike {
  connect(): Promise<SqlClient & { release(err?: Error | boolean): void }>;
}

type Row = {
  id: string;
  channel: string;
  attempts: number;
  recipient_user_id: string;
  organization_id: string | null;
  type: string;
  version: number;
  params: Record<string, string>;
  action_url: string | null;
  valid_until: Date | null;
};

function platformUrl(): string {
  return (process.env.NEXT_PUBLIC_PLATFORM_URL || 'http://localhost:3100').replace(/\/+$/, '');
}

function reasonOf(err: unknown): string {
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return message.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]').slice(0, 300);
}

export function renderNotificationEmail(
  row: Pick<Row, 'type' | 'version' | 'params' | 'action_url'>,
  contact: DeliveryContact,
  catalog: NotificationCatalog = defaultCatalog,
): { subject: string; html: string; text: string } {
  const template = catalog.get(row.type, row.version);
  if (!template) throw new Error(`[notifications] unknown template ${row.type}@${row.version}`);
  const locale: Locale = toLocale(contact.locale);
  const { title, body, action } = renderNotification(template, row.params, locale);
  const m = emailMessages(locale);
  if (template.email) {
    // Lot 4.5 (S115): the designed e-mail — subject „{title} · {business}”, the in-app text as
    // preheader, lead and what happens next, the action as the button, no greeting or signature
    const e = template.email;
    const text = (key: string, extra: Record<string, string> = {}) =>
      fill(notificationText(locale, key), { ...row.params, ...extra });
    return renderOperationalEmail({
      lang: locale,
      subject: text(e.subjectKey, { title }),
      preheader: body ?? title,
      eyebrow: text(e.eyebrowKey),
      title,
      lead: [text(e.leadKey), ...e.nextKeys.map((k) => text(k))],
      ...(row.action_url && action
        ? { button: { label: action, href: `${platformUrl()}${row.action_url}` } }
        : {}),
      after: [],
      signature: '',
      why: text(e.whyKey),
      company: m.common.company,
    });
  }
  const businessName = row.params.businessName;
  return renderOperationalEmail({
    lang: locale,
    subject: title,
    preheader: body ?? title,
    eyebrow: businessName ?? 'Ventora',
    title,
    lead: [fill(m.common.greeting, { name: contact.name }), ...(body ? [body] : [])],
    ...(row.action_url
      ? {
          button: {
            label: notificationText(locale, 'email.open'),
            href: `${platformUrl()}${row.action_url}`,
          },
        }
      : {}),
    after: [],
    signature: m.common.signature,
    why: businessName
      ? fill(notificationText(locale, 'email.why'), { businessName })
      : notificationText(locale, 'email.whyAccount'),
    company: m.common.company,
  });
}

export async function deliverPendingNotifications(options: {
  pool: PoolLike;
  contacts: ContactResolver;
  channels: DeliveryChannels;
  catalog?: NotificationCatalog;
  limit?: number;
}): Promise<DeliveryReport> {
  const catalog = options.catalog ?? defaultCatalog;
  const report: DeliveryReport = { sent: 0, retried: 0, failed: 0, cancelled: 0, skipped: 0 };
  const client = await options.pool.connect();
  try {
    let pending: unknown[];
    await client.query('BEGIN');
    try {
      await client.query('SET LOCAL ROLE notifications_rw');
      ({ rows: pending } = await client.query(
        `SELECT id, recipient_user_id, organization_id FROM notifications.pending_deliveries($1)`,
        [options.limit ?? 50],
      ));
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    }

    for (const p of pending as { id: string; recipient_user_id: string }[]) {
      await client.query('BEGIN');
      try {
        await client.query('SET LOCAL ROLE notifications_rw');
        await client.query(`SELECT set_config('app.user_id', $1, true)`, [p.recipient_user_id]);
        const { rows } = await client.query(
          `SELECT d.id, d.channel, d.attempts, d.recipient_user_id, d.organization_id,
                  n.type, n.version, n.params, n.action_url, n.valid_until
             FROM notifications.delivery d
             JOIN notifications.notification n ON n.id = d.notification_id
            WHERE d.id = $1 AND d.status = 'pending'
            FOR UPDATE OF d SKIP LOCKED`,
          [p.id],
        );
        const row = rows[0] as Row | undefined;
        if (!row) {
          report.skipped += 1;
          await client.query('COMMIT');
          continue;
        }
        const finish = (status: 'sent' | 'failed' | 'cancelled', error: string | null) =>
          client.query(
            `UPDATE notifications.delivery
                SET status = $2::text, last_error = $3, attempts = attempts + $4::int,
                    sent_at = CASE WHEN $2::text = 'sent' THEN now() ELSE sent_at END
              WHERE id = $1`,
            [row.id, status, error, status === 'cancelled' ? 0 : 1],
          );

        if (row.valid_until && new Date(row.valid_until) <= new Date()) {
          await finish('cancelled', 'expired');
          report.cancelled += 1;
          await client.query('COMMIT');
          continue;
        }
        const channel = options.channels[row.channel];
        if (!channel) {
          await finish('failed', 'not_configured');
          report.failed += 1;
          await client.query('COMMIT');
          continue;
        }
        const contacts = await options.contacts(client, [row.recipient_user_id]);
        const contact = contacts.get(row.recipient_user_id);
        if (!contact) {
          await finish('failed', 'no_recipient');
          report.failed += 1;
          await client.query('COMMIT');
          continue;
        }
        try {
          const email = renderNotificationEmail(row, contact, catalog);
          await channel.send({ to: contact.email, ...email });
          await finish('sent', null);
          report.sent += 1;
        } catch (err) {
          const attempts = row.attempts + 1;
          if (attempts >= DELIVERY_MAX_ATTEMPTS) {
            await finish('failed', reasonOf(err));
            report.failed += 1;
          } else {
            await client.query(
              `UPDATE notifications.delivery
                  SET attempts = $2, last_error = $3,
                      next_attempt_at = now() + make_interval(secs => $4)
                WHERE id = $1`,
              [row.id, attempts, reasonOf(err), BACKOFF_SECONDS[attempts - 1] ?? 300],
            );
            report.retried += 1;
          }
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      }
    }
    return report;
  } finally {
    client.release();
  }
}
