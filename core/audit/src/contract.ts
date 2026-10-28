import { AuditActions } from './actions';
import { withAuditTransaction, type AuditSqlExecutor } from './db';
import { getRequestContext } from './request-context';
import { normalizeIp, sanitizeMetadata } from './sanitize';
import type {
  AuditConnection,
  AuditEvent,
  AuditLogEntry,
  AuditLogFilters,
  AuditMode,
  FounderAuditLogFilters,
} from './types';

const ROLE_RE = /^[a-z_][a-z0-9_]*$/;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const APPEND_SQL = `SELECT audit.append_event(
  $1, $2, $3, $4, $5, $6, $7::uuid, $8::uuid, $9, $10, $11::inet, $12, $13, $14::jsonb
)::text AS id`;

const SELECT_COLUMNS = `id::text AS id, created_at, category, action, outcome, actor_type, actor_id,
  founder_id, support_session_id::text AS support_session_id, organization_id::text AS organization_id,
  target_type, target_id, host(ip) AS ip, user_agent, request_id, metadata`;

/**
 * Appends one row inside a transaction the caller already owns (mode `required` with real
 * atomicity: if the caller's work rolls back, so does the audit row, and vice versa).
 * Switches to audit_writer only for the call and restores the caller's role afterwards.
 * The session user of the connection must be a member of audit_writer
 * (app_runtime / founder_runtime, granted by migration 20261028000001).
 */
export async function appendAuditEventInTx(
  exec: AuditSqlExecutor,
  event: AuditEvent,
): Promise<string> {
  const [who] = await exec.query('SELECT current_user::text AS cu, session_user::text AS su', []);
  const currentRole = String(who?.cu ?? '');
  const sessionRole = String(who?.su ?? '');

  await exec.exec('SET LOCAL ROLE audit_writer');
  const rows = await exec.query(APPEND_SQL, appendParams(event));

  if (currentRole === sessionRole) {
    await exec.exec('SET LOCAL ROLE NONE');
  } else {
    if (!ROLE_RE.test(currentRole)) throw new Error(`[audit] unexpected role "${currentRole}"`);
    await exec.exec(`SET LOCAL ROLE ${currentRole}`);
  }

  const id = rows[0]?.id;
  if (typeof id !== 'string') throw new Error('[audit] append_event returned no id');
  return id;
}

/**
 * Writes one audit row in its own transaction.
 * - `required`: errors propagate to the caller.
 * - `best_effort`: errors are logged with the request id and swallowed; returns null.
 */
export async function writeAuditEvent(
  event: AuditEvent,
  opts: { mode: AuditMode; connection?: AuditConnection },
): Promise<string | null> {
  try {
    return await withAuditTransaction(opts.connection ?? 'app', (exec) =>
      appendAuditEventInTx(exec, event),
    );
  } catch (err) {
    if (opts.mode === 'required') throw err;
    console.error('[audit] best_effort write failed', {
      action: event.action,
      requestId: event.requestId ?? getRequestContext()?.requestId ?? null,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Organization view of the log (app_runtime → audit_org_reader, RLS on app.organization_id).
 * Callers must have passed authorize() with `audit.log.read` — use listAuditLogs from
 * @ventora/access, not this function, in request code.
 */
export async function readOrganizationAuditLog(
  organizationId: string,
  filters: AuditLogFilters = {},
): Promise<AuditLogEntry[]> {
  return withAuditTransaction('app', async (exec) => {
    await exec.exec('SET LOCAL ROLE audit_org_reader');
    await exec.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId]);
    const rows = await exec.query(
      `SELECT ${SELECT_COLUMNS}
         FROM audit.audit_log
        WHERE organization_id = $1::uuid
          AND ($2::text IS NULL OR action = $2)
          AND ($3::timestamptz IS NULL OR created_at < $3)
        ORDER BY created_at DESC, id DESC
        LIMIT $4`,
      [organizationId, filters.action ?? null, filters.before ?? null, clampLimit(filters.limit)],
    );
    return rows.map(toEntry);
  });
}

/**
 * Founder view of the full log (founder_runtime → audit_founder_reader).
 * The read itself is audited (E33) in the same transaction: no row → no result.
 */
export async function readAuditLogAsFounder(
  founderId: string,
  filters: FounderAuditLogFilters = {},
): Promise<AuditLogEntry[]> {
  return withAuditTransaction('founder', async (exec) => {
    await exec.exec('SET LOCAL ROLE audit_founder_reader');
    const rows = await exec.query(
      `SELECT ${SELECT_COLUMNS}
         FROM audit.audit_log
        WHERE ($1::uuid IS NULL OR organization_id = $1::uuid)
          AND ($2::text IS NULL OR actor_id = $2)
          AND ($3::text IS NULL OR founder_id = $3)
          AND ($4::text IS NULL OR action = $4)
          AND ($5::timestamptz IS NULL OR created_at < $5)
        ORDER BY created_at DESC, id DESC
        LIMIT $6`,
      [
        filters.organizationId ?? null,
        filters.actorId ?? null,
        filters.founderId ?? null,
        filters.action ?? null,
        filters.before ?? null,
        clampLimit(filters.limit),
      ],
    );
    await appendAuditEventInTx(exec, {
      category: 'founder',
      action: AuditActions.founderAuditViewed,
      outcome: 'success',
      actorType: 'founder',
      actorId: founderId,
      founderId,
      organizationId: filters.organizationId ?? null,
      metadata: {
        filters: {
          organizationId: filters.organizationId ?? null,
          actorId: filters.actorId ?? null,
          founderId: filters.founderId ?? null,
          action: filters.action ?? null,
        },
        resultCount: rows.length,
      },
    });
    return rows.map(toEntry);
  });
}

function appendParams(event: AuditEvent): unknown[] {
  const ctx = getRequestContext();
  return [
    event.category,
    event.action,
    event.outcome,
    event.actorType,
    event.actorId ?? null,
    event.founderId ?? null,
    event.supportSessionId ?? null,
    event.organizationId ?? null,
    event.targetType ?? null,
    event.targetId ?? null,
    normalizeIp(event.ip !== undefined ? event.ip : ctx?.ip),
    (event.userAgent !== undefined ? event.userAgent : ctx?.userAgent) ?? null,
    (event.requestId !== undefined ? event.requestId : ctx?.requestId) ?? null,
    JSON.stringify(sanitizeMetadata(event.metadata)),
  ];
}

function clampLimit(limit: number | undefined): number {
  if (!limit || limit < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(limit), MAX_LIMIT);
}

function toEntry(row: Record<string, unknown>): AuditLogEntry {
  return {
    id: row.id as string,
    createdAt: row.created_at as Date,
    category: row.category as AuditLogEntry['category'],
    action: row.action as string,
    outcome: row.outcome as AuditLogEntry['outcome'],
    actorType: row.actor_type as AuditLogEntry['actorType'],
    actorId: (row.actor_id as string | null) ?? null,
    founderId: (row.founder_id as string | null) ?? null,
    supportSessionId: (row.support_session_id as string | null) ?? null,
    organizationId: (row.organization_id as string | null) ?? null,
    targetType: (row.target_type as string | null) ?? null,
    targetId: (row.target_id as string | null) ?? null,
    ip: (row.ip as string | null) ?? null,
    userAgent: (row.user_agent as string | null) ?? null,
    requestId: (row.request_id as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}
