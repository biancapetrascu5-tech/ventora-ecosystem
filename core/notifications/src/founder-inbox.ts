import { Pool, type PoolClient } from 'pg';
import { InvalidInput } from '@ventora/errors';
import { uuidv7, type SqlClient } from './model/sql';

/*
 * Lotul FounderNotifications (S136, P22; D4-29 a, D5-11 a) — clopoțelul Founder: inboxul echipei
 * Ventora, fără afacere, câte o notificare pe eveniment.
 *
 *   scrierea → sendFounderNotification(tx, …), în tranzacția care a produs evenimentul (oprirea
 *              automată, solicitarea de suport, factura neemisă, cererea de configurare), ca
 *              notifications_rw: DOAR INSERT, fără SELECT și fără RETURNING (o afacere nu poate
 *              citi inboxul Ventora); dedup pe cheie
 *   citirea  → founder_runtime (DATABASE_URL_FOUNDER), ca notifications_founder, cu
 *              app.founder_id: lista, citit / necitit pe fiecare om, „Marchează toate ca citite”.
 *              Apelantul (Founder) verifică sesiunea Founder cu 2FA înainte (requireFounderSession
 *              din @ventora/identity, care depinde de acest pachet) și trimite id-ul ei.
 *
 * Textele sunt în i18n (founder.notifications.*): aici rămân tipul și valorile.
 */

export const FOUNDER_NOTIFICATION_TYPES = {
  /** Growth a oprit singur o campanie (P22). */
  autoStop: 'founder.growth.auto_stopped',
  /** O afacere a deschis o solicitare de suport. */
  support: 'founder.support.request_new',
  /** Facturi care nu s-au emis (furnizorul de facturare le-a respins). */
  invoice: 'founder.billing.invoice_not_issued',
  /** O afacere a cerut configurare (implementare). */
  setup: 'founder.setup.request_new',
} as const;

export type FounderNotificationType =
  (typeof FOUNDER_NOTIFICATION_TYPES)[keyof typeof FOUNDER_NOTIFICATION_TYPES];
/** Filtrul „Tip” din pagină. */
export type FounderNotificationKind = 'auto' | 'support' | 'invoice' | 'setup';

const KIND: Record<FounderNotificationType, FounderNotificationKind> = {
  'founder.growth.auto_stopped': 'auto',
  'founder.support.request_new': 'support',
  'founder.billing.invoice_not_issued': 'invoice',
  'founder.setup.request_new': 'setup',
};
const TYPE_OF_KIND = Object.fromEntries(
  Object.entries(KIND).map(([type, kind]) => [kind, type]),
) as Record<FounderNotificationKind, FounderNotificationType>;

/** Valorile fiecărui tip: ce cere textul din clopoțel, din pagină și din Drawer. */
const REQUIRED: Record<FounderNotificationType, string[]> = {
  'founder.growth.auto_stopped': ['campaign', 'campaignId', 'reason'],
  'founder.support.request_new': ['organizationId', 'applicationId', 'subject', 'requestRef'],
  'founder.billing.invoice_not_issued': ['n', 'organizationIds'],
  'founder.setup.request_new': ['organizationId', 'applicationId', 'setupRequestId'],
};
// Numele afacerilor nu se copiază aici: Founder le citește la afișare (listBusinessesForFounder),
// ca în Suport; o afacere redenumită apare cu numele de acum.

/** Valori neutre: text scurt, număr, boolean sau listă de texte; fără obiecte. */
export type FounderNotificationParams = Record<string, string | number | boolean | null | string[]>;

const ROLE_RE = /^[a-z_][a-z0-9_]*$/;

function checkParams(type: FounderNotificationType, params: FounderNotificationParams): void {
  for (const key of REQUIRED[type]) {
    const v = params[key];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
      throw new InvalidInput('params', `${type} needs ${key}`);
    }
  }
  for (const [key, v] of Object.entries(params)) {
    const ok =
      v === null ||
      typeof v === 'boolean' ||
      (typeof v === 'number' && Number.isFinite(v)) ||
      (typeof v === 'string' && v.length <= 500) ||
      (Array.isArray(v) &&
        v.length <= 50 &&
        v.every((x) => typeof x === 'string' && x.length <= 200));
    if (!ok) throw new InvalidInput('params', `${type}: ${key} is not a neutral value`);
  }
}

/**
 * Trimite o notificare în clopoțelul Founder, în tranzacția apelantului (rolul lui se schimbă
 * pe durata scrierii în notifications_rw și revine după). Aceeași cheie de idempotență → un
 * singur rând. Întoarce `created: false` pentru un duplicat.
 */
export async function sendFounderNotification(
  tx: SqlClient,
  input: {
    type: FounderNotificationType;
    params: FounderNotificationParams;
    idempotencyKey: string;
    /** Calea din Founder pentru „Vezi” (de ex. /support/{id}); fără ea, pagina deschide detaliul. */
    actionPath?: string | null;
  },
): Promise<{ created: boolean }> {
  if (!(input.type in KIND)) throw new InvalidInput('type');
  checkParams(input.type, input.params);
  const key = (input.idempotencyKey ?? '').trim();
  if (!key || key.length > 200) throw new InvalidInput('idempotencyKey');
  const path = input.actionPath ?? null;
  if (path !== null && (!path.startsWith('/') || path.length > 500)) {
    throw new InvalidInput('actionPath');
  }
  const { rows } = await tx.query(`SELECT current_user::text AS role`);
  const previous = (rows[0] as { role: string }).role;
  if (!ROLE_RE.test(previous)) throw new Error(`[notifications] unexpected role "${previous}"`);
  await tx.query('SET LOCAL ROLE notifications_rw');
  // notifications_rw nu are SELECT pe inboxul Ventora (condiția aprobării): fără RETURNING și
  // fără ON CONFLICT (care cere SELECT pe coloana cheii). Duplicatul se recunoaște după indexul
  // unic, într-un savepoint, ca tranzacția apelantului să continue. Orice altă eroare ajunge la
  // apelant (tranzacția e oricum anulată).
  await tx.query('SAVEPOINT founder_notification');
  let created = true;
  try {
    await tx.query(
      `INSERT INTO notifications.founder_notification
         (id, type, version, params, action_url, dedup_key)
       VALUES ($1, $2, 1, $3::jsonb, $4, $5)`,
      [uuidv7(), input.type, JSON.stringify(input.params), path, `${input.type}:${key}`],
    );
  } catch (err) {
    const pg = err as { code?: string; constraint?: string };
    if (pg.code !== '23505' || pg.constraint !== 'founder_notification_dedup_key_key') throw err;
    await tx.query('ROLLBACK TO SAVEPOINT founder_notification');
    created = false;
  }
  await tx.query('RELEASE SAVEPOINT founder_notification');
  await tx.query(`SET LOCAL ROLE ${previous}`);
  return { created };
}

/* ---- partea Founder: founder_runtime, notifications_founder, app.founder_id ---- */

let _founderPool: Pool | null = null;

function founderPool(): Pool {
  if (!_founderPool) {
    const url = process.env.DATABASE_URL_FOUNDER;
    if (!url) throw new Error('[notifications] DATABASE_URL_FOUNDER is not set');
    // max: 1 — the serverless cap of every module (ARCHITECTURE §6.2)
    _founderPool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 10_000 });
  }
  return _founderPool;
}

export async function closeFounderNotificationsPool(): Promise<void> {
  const p = _founderPool;
  _founderPool = null;
  await p?.end();
}

const FOUNDER_ID = /^[A-Za-z0-9_-]{1,64}$/;

async function asFounder<T>(
  founderId: string,
  readOnly: boolean,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!FOUNDER_ID.test(founderId ?? '')) throw new InvalidInput('founderId');
  const client = await founderPool().connect();
  try {
    await client.query(readOnly ? 'BEGIN READ ONLY' : 'BEGIN');
    await client.query('SET LOCAL ROLE notifications_founder');
    await client.query(`SELECT set_config('app.founder_id', $1, true)`, [founderId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export interface FounderNotificationRow {
  id: string;
  type: FounderNotificationType;
  kind: FounderNotificationKind;
  params: FounderNotificationParams;
  actionPath: string | null;
  createdAt: Date;
  read: boolean;
}

export interface FounderInbox {
  items: FounderNotificationRow[];
  /** Necitite de acest om, pe toate tipurile („Necitite · n”, bulina clopoțelului). */
  unread: number;
}

/** Clopoțelul și pagina arată ultimele 90 de zile, cel mult 200 de rânduri. */
export const FOUNDER_INBOX_DAYS = 90;
const FOUNDER_INBOX_LIMIT = 200;

export async function listFounderNotifications(input: {
  founderId: string;
  unreadOnly?: boolean;
  kind?: FounderNotificationKind | null;
  limit?: number;
}): Promise<FounderInbox> {
  if (input.kind && !(input.kind in TYPE_OF_KIND)) throw new InvalidInput('kind');
  const limit = Math.min(Math.max(input.limit ?? FOUNDER_INBOX_LIMIT, 1), FOUNDER_INBOX_LIMIT);
  return asFounder(input.founderId, true, async (c) => {
    const { rows } = await c.query<{
      id: string;
      type: FounderNotificationType;
      params: FounderNotificationParams;
      action_url: string | null;
      created_at: Date;
      read: boolean;
    }>(
      `SELECT n.id, n.type, n.params, n.action_url, n.created_at, (r.notification_id IS NOT NULL) AS read
         FROM notifications.founder_notification n
         LEFT JOIN notifications.founder_notification_read r ON r.notification_id = n.id
        WHERE n.created_at > now() - make_interval(days => $1)
          AND ($2::text IS NULL OR n.type = $2)
          AND (NOT $3 OR r.notification_id IS NULL)
        ORDER BY n.created_at DESC, n.id DESC
        LIMIT $4`,
      [FOUNDER_INBOX_DAYS, input.kind ? TYPE_OF_KIND[input.kind] : null, !!input.unreadOnly, limit],
    );
    const { rows: count } = await c.query<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM notifications.founder_notification n
        WHERE n.created_at > now() - make_interval(days => $1)
          AND NOT EXISTS (SELECT 1 FROM notifications.founder_notification_read r
                           WHERE r.notification_id = n.id)`,
      [FOUNDER_INBOX_DAYS],
    );
    return {
      items: rows
        .filter((r) => r.type in KIND)
        .map((r) => ({
          id: r.id,
          type: r.type,
          kind: KIND[r.type],
          params: r.params ?? {},
          actionPath: r.action_url,
          createdAt: r.created_at,
          read: r.read,
        })),
      unread: count[0]?.n ?? 0,
    };
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** „Vezi” pe o notificare: citită pentru acest om. Idempotent. */
export async function markFounderNotificationRead(input: {
  founderId: string;
  notificationId: string;
}): Promise<void> {
  if (!UUID.test(input.notificationId ?? '')) throw new InvalidInput('notificationId');
  await asFounder(input.founderId, false, async (c) => {
    await c.query(
      `INSERT INTO notifications.founder_notification_read (founder_id, notification_id)
       SELECT $1, n.id FROM notifications.founder_notification n WHERE n.id = $2
       ON CONFLICT DO NOTHING`,
      [input.founderId, input.notificationId],
    );
  });
}

/** „Marchează toate ca citite”: pentru acest om, ce e în inbox acum. */
export async function markAllFounderNotificationsRead(input: { founderId: string }): Promise<void> {
  await asFounder(input.founderId, false, async (c) => {
    await c.query(
      `INSERT INTO notifications.founder_notification_read (founder_id, notification_id)
       SELECT $1, n.id FROM notifications.founder_notification n
        WHERE n.created_at > now() - make_interval(days => $2)
       ON CONFLICT DO NOTHING`,
      [input.founderId, FOUNDER_INBOX_DAYS],
    );
  });
}
