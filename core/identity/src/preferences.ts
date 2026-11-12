import { SUPPORTED_LOCALES, type Locale } from '@ventora/i18n';
import type { AuditSqlExecutor } from '@ventora/audit';
import { InvalidInput } from '@ventora/errors';
import { UserLocaleChangedV1 } from '@ventora/contracts';
import { writeOutboxEvent } from '@ventora/db-kit';
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lot 5.10c (decision 11.11.2026): when the language really changes, `user.locale_changed` v1 goes
 * to the identity outbox in the same transaction, one row per business of the person
 * (`organizationIds`, from the organizations contract in the caller: identity reads no other
 * schema). Only the person's id and the locale. Without businesses, only the preference is kept.
 */
export async function setUserLocale(
  userId: string,
  locale: string,
  organizationIds: readonly string[] = [],
): Promise<{ changed: boolean }> {
  if (!isLocale(locale)) throw new InvalidInput('locale');
  const orgIds = [...new Set(organizationIds)];
  if (orgIds.some((id) => !UUID_RE.test(id))) throw new InvalidInput('organizationIds');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getIdentityDb().$transaction(async (tx: any) => {
    const before = await tx.userPreference.findUnique({
      where: { userId },
      select: { locale: true },
    });
    await tx.userPreference.upsert({
      where: { userId },
      create: { userId, locale },
      update: { locale, updatedAt: new Date() },
    });
    if (before?.locale === locale) return { changed: false };
    for (const organizationId of orgIds) {
      // the outbox RLS is per business (like organizations): the row carries this business
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
      await writeOutboxEvent(tx, 'identity', UserLocaleChangedV1, {
        organizationId,
        sourceApp: 'platform',
        resourceId: userId,
        payload: { userId, locale },
      });
    }
    return { changed: true };
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
