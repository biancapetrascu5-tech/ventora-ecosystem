import { InvalidInput } from '@ventora/errors';
import { defaultCatalog, type NotificationCatalog, type NotificationCategory } from './catalog';
import { uuidv7, type SqlClient } from './sql';

/*
 * The `send` contract (Lot 4.3, FAZA-4): a notification is written inside the caller's
 * transaction, never sent from a request. The caller is a consumer of the outbox (dispatcher,
 * Lot 4.1), already in the organization's context from the envelope; `send` switches to
 * notifications_rw for its rows and back to the caller's role. The email (and later SMS,
 * WhatsApp — D4-7) leaves through the delivery job, with retries.
 *
 * Rules:
 *   - the category is required and must be the template's (D4-5);
 *   - one per recipient for the same idempotency key (deduplication);
 *   - at most `rateLimit.max` of a type per recipient in its window (limiting);
 *   - in the app, operational notifications are always on; commercial ones follow the person's
 *     toggle (D4-6); commercial email is blocked centrally (D-GRW-8);
 *   - email can be turned off per category, except security messages (S83) and, for the owner,
 *     the ones the design keeps on (D4-6);
 *   - the recipients are resolved by the caller (roles → people, core/organizations), as ids.
 */

export interface SendNotificationInput {
  /** Required (D4-5); must be the template's category. */
  category: NotificationCategory;
  type: string;
  version: number;
  /** null: an account notification, outside any organization. */
  organizationId: string | null;
  recipientUserIds: readonly string[];
  /** The owners among the recipients (D4-6: some emails the owner cannot turn off). */
  ownerUserIds?: readonly string[];
  /** Deterministic: the same key twice → one notification per recipient. */
  idempotencyKey: string;
  params?: Readonly<Record<string, string>>;
  /** A notification past this time is not delivered any more. */
  validUntil?: Date | null;
}

export interface SendNotificationResult {
  created: string[];
  duplicates: string[];
  rateLimited: string[];
  /** In-app off for a commercial notification (the person's toggle). */
  skipped: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE_RE = /^[a-z_][a-z0-9_]*$/;

async function preferenceOf(
  tx: SqlClient,
  userId: string,
  category: NotificationCategory,
  channel: string,
): Promise<boolean | null> {
  // the preference is the person's own row (RLS on app.user_id): read it as the recipient
  const { rows } = await tx.query(
    `SELECT set_config('app.user_id', $1, true),
            (SELECT enabled FROM notifications.notification_preference
              WHERE user_id = $1::uuid AND category = $2 AND channel = $3) AS enabled`,
    [userId, category, channel],
  );
  const enabled = (rows[0] as { enabled: boolean | null } | undefined)?.enabled;
  return typeof enabled === 'boolean' ? enabled : null;
}

export async function sendNotification(
  tx: SqlClient,
  input: SendNotificationInput,
  options: { catalog?: NotificationCatalog } = {},
): Promise<SendNotificationResult> {
  const catalog = options.catalog ?? defaultCatalog;
  if (input.category !== 'operational' && input.category !== 'commercial') {
    throw new InvalidInput('category', 'A notification needs its category (D4-5)');
  }
  const template = catalog.get(input.type, input.version);
  if (!template)
    throw new InvalidInput('type', `Unknown notification ${input.type}@${input.version}`);
  if (template.category !== input.category) {
    throw new InvalidInput('category', `${input.type} is ${template.category}`);
  }
  if (template.textsPending) {
    throw new InvalidInput('type', `${input.type}: its texts come in Lot 4.5`);
  }
  const key = (input.idempotencyKey ?? '').trim();
  if (!key || key.length > 200) throw new InvalidInput('idempotencyKey');
  if (input.organizationId !== null && !UUID.test(input.organizationId)) {
    throw new InvalidInput('organizationId');
  }
  const recipients = [...new Set(input.recipientUserIds)];
  if (recipients.some((id) => !UUID.test(id))) throw new InvalidInput('recipientUserIds');

  const result: SendNotificationResult = {
    created: [],
    duplicates: [],
    rateLimited: [],
    skipped: [],
  };
  if (recipients.length === 0) return result;

  const { rows: who } = await tx.query(
    `SELECT current_user::text AS role, current_setting('app.user_id', true) AS user_id`,
  );
  const previous = who[0] as { role: string; user_id: string | null };
  if (!ROLE_RE.test(previous.role))
    throw new Error(`[notifications] unexpected role "${previous.role}"`);
  await tx.query('SET LOCAL ROLE notifications_rw');
  try {
    const owners = new Set(input.ownerUserIds ?? []);
    const dedupKey = `${template.type}@${template.version}:${key}`;
    const actionUrl = template.actionPath?.(input.params ?? {}) ?? null;
    for (const userId of recipients) {
      if (template.category === 'commercial') {
        // D4-6: commercial recommendations have their own toggle in the app
        if ((await preferenceOf(tx, userId, 'commercial', 'in_app')) === false) {
          result.skipped.push(userId);
          continue;
        }
      }
      if (template.rateLimit) {
        const { rows } = await tx.query(
          `SELECT count(*)::int AS n FROM notifications.notification
            WHERE recipient_user_id = $1::uuid AND type = $2
              AND created_at > now() - make_interval(mins => $3)`,
          [userId, template.type, template.rateLimit.windowMinutes],
        );
        if ((rows[0] as { n: number }).n >= template.rateLimit.max) {
          result.rateLimited.push(userId);
          continue;
        }
      }
      const id = uuidv7();
      const inserted = await tx.query(
        `INSERT INTO notifications.notification
           (id, organization_id, recipient_user_id, category, display_group, type, version,
            params, action_url, dedup_key, valid_until)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)
         ON CONFLICT (recipient_user_id, dedup_key) DO NOTHING
         RETURNING id`,
        [
          id,
          input.organizationId,
          userId,
          template.category,
          template.group,
          template.type,
          template.version,
          JSON.stringify(input.params ?? {}),
          actionUrl,
          dedupKey,
          input.validUntil ?? null,
        ],
      );
      if (inserted.rows.length === 0) {
        result.duplicates.push(userId);
        continue;
      }
      result.created.push(userId);

      for (const channel of template.channels) {
        // D-GRW-8: commercial email is blocked centrally
        if (template.category === 'commercial' && channel === 'email') continue;
        const locked =
          template.security === true ||
          (template.emailLockedForOwner === true && owners.has(userId));
        if (!locked && (await preferenceOf(tx, userId, template.category, channel)) === false) {
          continue;
        }
        await tx.query(
          `INSERT INTO notifications.delivery
             (id, notification_id, organization_id, recipient_user_id, channel)
           VALUES ($1, $2, $3, $4, $5)`,
          [uuidv7(), id, input.organizationId, userId, channel],
        );
      }
    }
  } finally {
    await tx.query(`SELECT set_config('app.user_id', $1, true)`, [previous.user_id ?? '']);
    await tx.query(`SET LOCAL ROLE ${previous.role}`);
  }
  return result;
}
