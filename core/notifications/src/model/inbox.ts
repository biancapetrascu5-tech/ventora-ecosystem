import { Pool, type PoolClient } from 'pg';
import { InvalidInput, ResourceNotFound } from '@ventora/errors';
import type { Locale } from '@ventora/i18n';
import { defaultCatalog, type NotificationCatalog, type NotificationCategory } from './catalog';
import { renderNotification } from './render';
import {
  defaultEnabled,
  EMAIL_TOPICS,
  isChangeable,
  isSecurityTopic,
  topicCategory,
  type EmailTopic,
  type NotificationTopic,
} from './topics';

/*
 * The person's side of the notifications (Lot 4.4): the bell's list, „Marchează toate ca citite”,
 * opening one, and the preferences of „Contul tău · Notificări”. Every call runs on app_runtime
 * (DATABASE_URL), as notifications_rw, in the person's context (app.user_id): RLS lets a person
 * read and mark only their own notifications and change only their own preferences.
 */

/** D4-11 = a: the panel shows the last 30 days; the history page comes with its design. */
export const INBOX_DAYS = 30;
const INBOX_LIMIT = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let _pool: Pool | null = null;

function pool(): Pool {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('[notifications] DATABASE_URL is not set');
    // max: 1 — the serverless cap of every module (ARCHITECTURE §6.2)
    _pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 10_000 });
  }
  return _pool;
}

export async function closeNotificationsPool(): Promise<void> {
  const p = _pool;
  _pool = null;
  await p?.end();
}

async function asPerson<T>(
  userId: string,
  readOnly: boolean,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!UUID.test(userId)) throw new InvalidInput('userId');
  const client = await pool().connect();
  try {
    await client.query(readOnly ? 'BEGIN READ ONLY' : 'BEGIN');
    await client.query('SET LOCAL ROLE notifications_rw');
    await client.query(`SELECT set_config('app.user_id', $1, true)`, [userId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export interface InboxItem {
  id: string;
  organizationId: string | null;
  category: NotificationCategory;
  group: 'operational' | 'activity' | 'recommendation';
  title: string;
  body?: string;
  /** S115: what opening it does („Vezi factura”), when the template has it. */
  action?: string;
  /** A path in the Hub (B-4); opening the notification goes there. */
  actionUrl: string | null;
  read: boolean;
  createdAt: Date;
}

export interface Inbox {
  items: InboxItem[];
  /** The bell's number: unread operational notifications only (HubRecommendation, D4-5). */
  unreadOperational: number;
}

type Row = {
  id: string;
  organization_id: string | null;
  category: NotificationCategory;
  display_group: InboxItem['group'];
  type: string;
  version: number;
  params: Record<string, string> | null;
  action_url: string | null;
  read_at: Date | null;
  created_at: Date;
};

/** The person's notifications of the last 30 days, newest first, in `locale`. */
export async function getInbox(
  userId: string,
  locale: Locale,
  options: { catalog?: NotificationCatalog } = {},
): Promise<Inbox> {
  const catalog = options.catalog ?? defaultCatalog;
  return asPerson(userId, true, async (client) => {
    const { rows } = await client.query<Row>(
      `SELECT id::text, organization_id::text, category, display_group, type, version, params,
              action_url, read_at, created_at
         FROM notifications.notification
        WHERE recipient_user_id = $1::uuid
          AND created_at > now() - make_interval(days => $2)
        ORDER BY created_at DESC, id DESC
        LIMIT $3`,
      [userId, INBOX_DAYS, INBOX_LIMIT],
    );
    const { rows: count } = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM notifications.notification
        WHERE recipient_user_id = $1::uuid AND category = 'operational' AND read_at IS NULL
          AND created_at > now() - make_interval(days => $2)`,
      [userId, INBOX_DAYS],
    );
    const items: InboxItem[] = [];
    for (const r of rows) {
      const template = catalog.get(r.type, r.version);
      // a template removed from the catalog (or without texts yet) is not shown
      if (!template || template.textsPending) continue;
      items.push({
        id: r.id,
        organizationId: r.organization_id,
        category: r.category,
        group: r.display_group,
        ...renderNotification(template, r.params ?? {}, locale),
        actionUrl: r.action_url,
        read: r.read_at !== null,
        createdAt: r.created_at,
      });
    }
    return { items, unreadOperational: count[0]?.n ?? 0 };
  });
}

/** Opening a notification: it is read; returns where it leads (and in which business). */
export async function openNotification(
  userId: string,
  notificationId: string,
): Promise<{ actionUrl: string | null; organizationId: string | null }> {
  if (!UUID.test(notificationId)) throw new InvalidInput('notificationId');
  return asPerson(userId, false, async (client) => {
    const { rows } = await client.query<{
      action_url: string | null;
      organization_id: string | null;
    }>(
      `UPDATE notifications.notification SET read_at = COALESCE(read_at, now())
        WHERE id = $1::uuid AND recipient_user_id = $2::uuid
        RETURNING action_url, organization_id::text`,
      [notificationId, userId],
    );
    const row = rows[0];
    if (!row) throw new ResourceNotFound('Notification not found');
    return { actionUrl: row.action_url, organizationId: row.organization_id };
  });
}

/** „Marchează toate ca citite”: returns how many were unread. */
export async function markAllNotificationsRead(userId: string): Promise<number> {
  return asPerson(userId, false, async (client) => {
    const { rowCount } = await client.query(
      `UPDATE notifications.notification SET read_at = now()
        WHERE recipient_user_id = $1::uuid AND read_at IS NULL`,
      [userId],
    );
    return rowCount ?? 0;
  });
}

/** What „Contul tău · Notificări” shows: only the switches the person can change (S114b). */
export interface NotificationPreferences {
  /** E-mail per operational topic; in the app they are always on. */
  email: Record<EmailTopic, boolean>;
  recommendations: { inApp: boolean };
  news: { inApp: boolean; email: boolean };
}

export async function getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  return asPerson(userId, true, async (client) => {
    const { rows } = await client.query<{ topic: string; channel: string; enabled: boolean }>(
      `SELECT topic, channel, enabled FROM notifications.notification_preference
        WHERE user_id = $1::uuid`,
      [userId],
    );
    const stored = new Map(rows.map((r) => [`${r.topic}:${r.channel}`, r.enabled]));
    const get = (topic: string, channel: string) =>
      stored.get(`${topic}:${channel}`) ?? defaultEnabled(topic, channel);
    return {
      email: Object.fromEntries(EMAIL_TOPICS.map((t) => [t, get(t, 'email')])) as Record<
        EmailTopic,
        boolean
      >,
      recommendations: { inApp: get('recommendations', 'in_app') },
      news: { inApp: get('news', 'in_app'), email: get('news', 'email') },
    };
  });
}

/**
 * One switch. Refused: the security rows (S83: „Nu se pot opri”), the operational notifications
 * in the app (always on, D4-6) and the recommendations by e-mail (D-GRW-8).
 */
export async function setNotificationPreference(
  userId: string,
  input: { topic: string; channel: string; enabled: boolean },
): Promise<void> {
  if (isSecurityTopic(input.topic)) {
    throw new InvalidInput('topic', 'Security notifications cannot be turned off (S83)');
  }
  if (!isChangeable(input.topic, input.channel)) {
    throw new InvalidInput('channel', `${input.topic} / ${input.channel} cannot be changed`);
  }
  if (typeof input.enabled !== 'boolean') throw new InvalidInput('enabled');
  const topic = input.topic as NotificationTopic;
  await asPerson(userId, false, async (client) => {
    await client.query(
      `INSERT INTO notifications.notification_preference
         (user_id, topic, category, channel, enabled, updated_at)
       VALUES ($1::uuid, $2, $3, $4, $5, now())
       ON CONFLICT (user_id, topic, channel)
       DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()`,
      [userId, topic, topicCategory(topic), input.channel, input.enabled],
    );
  });
}
