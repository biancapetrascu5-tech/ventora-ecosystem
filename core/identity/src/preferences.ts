import { SUPPORTED_LOCALES, type Locale } from '@ventora/i18n';
import type { AuditSqlExecutor } from '@ventora/audit';
import { InvalidInput } from '@ventora/errors';
import { getIdentityDb } from './db';

/*
 * UserPreference (ARCHITECTURE §4, Lot 4.3): the language a person chose, so the notifications
 * leave in the recipient's language (D4-8). Saved when the person changes the language in the
 * Hub; without it the notifications fall back to Romanian (the canonical catalog).
 */

const ROLE_RE = /^[a-z_][a-z0-9_]*$/;

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export async function setUserLocale(userId: string, locale: string): Promise<void> {
  if (!isLocale(locale)) throw new InvalidInput('locale');
  await getIdentityDb().userPreference.upsert({
    where: { userId },
    create: { userId, locale },
    update: { locale, updatedAt: new Date() },
  });
}

export async function getUserLocale(userId: string): Promise<Locale | null> {
  const row = await getIdentityDb().userPreference.findUnique({
    where: { userId },
    select: { locale: true },
  });
  return isLocale(row?.locale) ? row.locale : null;
}

export interface NotificationContact {
  email: string;
  name: string;
  locale: Locale | null;
}

/**
 * The contact and language of the recipients of a notification, inside the caller's transaction
 * (the delivery job of core/notifications, on app_runtime). Switches to identity_rw for the read,
 * then back to the caller's role (D-DB-1 C: app_runtime has no rights of its own).
 */
export async function getNotificationContactsInTx(
  exec: AuditSqlExecutor,
  userIds: readonly string[],
): Promise<Map<string, NotificationContact>> {
  const out = new Map<string, NotificationContact>();
  if (userIds.length === 0) return out;
  const [who] = await exec.query('SELECT current_user::text AS cu', []);
  const previous = String(who?.cu ?? '');
  if (!ROLE_RE.test(previous)) throw new Error(`[identity] unexpected role "${previous}"`);
  await exec.exec('SET LOCAL ROLE identity_rw');
  try {
    const rows = await exec.query(
      `SELECT u.id, u.email, u.name, p.locale
         FROM identity.users u
         LEFT JOIN identity.user_preference p ON p.user_id = u.id
        WHERE u.id = ANY($1::text[])`,
      [userIds],
    );
    for (const r of rows) {
      out.set(String(r.id), {
        email: String(r.email),
        name: String(r.name),
        locale: isLocale(r.locale) ? r.locale : null,
      });
    }
  } finally {
    await exec.exec(`SET LOCAL ROLE ${previous}`);
  }
  return out;
}
