import { OUTBOX_MAX_ATTEMPTS, sqlIdentifier, type OutboxEnvelope } from './outbox';

/*
 * Operațiile dispecerului pe `outbox_events` / `processed_events` (Lot 4.1). Toate rulează pe un
 * client pg, în tranzacția deschisă de apelant (core/integrations), după enterTenantContext:
 * rolul modulului (SET LOCAL ROLE) și organizația din plic (set_config local), deci sub RLS.
 * Niciuna nu folosește un context de sistem; singura citire peste organizații este
 * `<schema>.outbox_pending`, care întoarce doar id-ul și organizația.
 */

export interface OutboxSqlClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount?: number | null }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rolul modulului și organizația evenimentului, locale tranzacției curente (§12.3). */
export async function enterTenantContext(
  client: OutboxSqlClient,
  moduleRole: string,
  organizationId: string,
): Promise<void> {
  if (!UUID.test(organizationId)) throw new Error('[db-kit] organizationId invalid în plic');
  await client.query(`SET LOCAL ROLE ${sqlIdentifier(moduleRole, 'Rol')}`);
  await client.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId]);
}

/** Ce așteaptă livrarea, în toate organizațiile: doar id-ul și organizația (SECURITY DEFINER). */
export async function listPendingOutboxEvents(
  client: OutboxSqlClient,
  schema: string,
  limit = 20,
): Promise<{ eventId: string; organizationId: string }[]> {
  const s = sqlIdentifier(schema, 'Schemă');
  const { rows } = await client.query(
    `SELECT event_id::text AS event_id, organization_id::text AS organization_id
       FROM ${s}.outbox_pending($1)`,
    [limit],
  );
  return (rows as { event_id: string; organization_id: string }[]).map((r) => ({
    eventId: r.event_id,
    organizationId: r.organization_id,
  }));
}

/**
 * Blochează evenimentul pentru restul tranzacției (FOR UPDATE SKIP LOCKED) și îl întoarce cu
 * plicul complet; null dacă nu mai așteaptă sau dacă îl ține deja alt dispecer.
 */
export async function lockPendingOutboxEvent(
  client: OutboxSqlClient,
  schema: string,
  eventId: string,
): Promise<(OutboxEnvelope & { attempts: number }) | null> {
  const s = sqlIdentifier(schema, 'Schemă');
  const { rows } = await client.query(
    `SELECT event_id::text AS event_id, type, version, occurred_at,
            organization_id::text AS organization_id, source_app, resource_id, correlation_id,
            payload, attempts
       FROM ${s}.outbox_events
      WHERE event_id = $1::uuid AND status = 'pending'
      FOR UPDATE SKIP LOCKED`,
    [eventId],
  );
  const r = rows[0] as
    | {
        event_id: string;
        type: string;
        version: number;
        occurred_at: Date;
        organization_id: string;
        source_app: string;
        resource_id: string;
        correlation_id: string | null;
        payload: unknown;
        attempts: number;
      }
    | undefined;
  if (!r) return null;
  return {
    eventId: r.event_id,
    type: r.type,
    version: r.version,
    occurredAt: new Date(r.occurred_at),
    organizationId: r.organization_id,
    sourceApp: r.source_app,
    resourceId: r.resource_id,
    correlationId: r.correlation_id,
    payload: r.payload,
    attempts: r.attempts,
  };
}

/**
 * Marchează evenimentul procesat de consumator, în tranzacția efectului lui (D4-1 = a). Întoarce
 * false dacă era deja procesat: apelantul anulează tranzacția, deci efectul nu se repetă.
 */
export async function markOutboxEventProcessed(
  client: OutboxSqlClient,
  schema: string,
  consumer: string,
  envelope: Pick<OutboxEnvelope, 'eventId' | 'organizationId'>,
): Promise<boolean> {
  const s = sqlIdentifier(schema, 'Schemă');
  const { rows } = await client.query(
    `INSERT INTO ${s}.processed_events (consumer, event_id, organization_id)
     VALUES ($1, $2::uuid, $3::uuid)
     ON CONFLICT (consumer, event_id) DO NOTHING
     RETURNING event_id`,
    [consumer, envelope.eventId, envelope.organizationId],
  );
  return rows.length === 1;
}

/** A procesat deja consumatorul evenimentul? (o livrare repetată se sare). */
export async function isOutboxEventProcessed(
  client: OutboxSqlClient,
  schema: string,
  consumer: string,
  eventId: string,
): Promise<boolean> {
  const s = sqlIdentifier(schema, 'Schemă');
  const { rows } = await client.query(
    `SELECT 1 FROM ${s}.processed_events WHERE consumer = $1 AND event_id = $2::uuid`,
    [consumer, eventId],
  );
  return rows.length > 0;
}

/** Toți consumatorii au reușit (sau evenimentul nu are destinatar): livrat. */
export async function completeOutboxEvent(
  client: OutboxSqlClient,
  schema: string,
  eventId: string,
): Promise<void> {
  const s = sqlIdentifier(schema, 'Schemă');
  await client.query(
    `UPDATE ${s}.outbox_events
        SET status = 'dispatched', dispatched_at = now()
      WHERE event_id = $1::uuid AND status = 'pending'`,
    [eventId],
  );
}

/**
 * Un eșec al livrării: crește `attempts`; la al treilea (OUTBOX_MAX_ATTEMPTS) evenimentul trece
 * în dead-letter (`status = 'dead'`, `last_error`, `failed_at`) și nu mai e reluat automat.
 * Altfel așteaptă: 30 s după primul eșec, 2 minute după al doilea. Mesajul de eroare se trunchiază la 2.000 de caractere.
 */
export async function recordOutboxFailure(
  client: OutboxSqlClient,
  schema: string,
  eventId: string,
  error: unknown,
  maxAttempts: number = OUTBOX_MAX_ATTEMPTS,
): Promise<'retry' | 'dead'> {
  const s = sqlIdentifier(schema, 'Schemă');
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
  const { rows } = await client.query(
    `UPDATE ${s}.outbox_events
        SET attempts = attempts + 1,
            last_error = $2,
            status = CASE WHEN attempts + 1 >= $3 THEN 'dead' ELSE 'pending' END,
            failed_at = CASE WHEN attempts + 1 >= $3 THEN now() ELSE failed_at END,
            available_at = CASE WHEN attempts + 1 >= $3 THEN available_at
                                ELSE now() + make_interval(secs => 30 * power(4, attempts)) END
      WHERE event_id = $1::uuid AND status = 'pending'
      RETURNING status`,
    [eventId, message, maxAttempts],
  );
  return (rows[0] as { status?: string } | undefined)?.status === 'dead' ? 'dead' : 'retry';
}

export interface DeadLetterEvent {
  eventId: string;
  type: string;
  version: number;
  organizationId: string;
  sourceApp: string;
  resourceId: string;
  attempts: number;
  lastError: string | null;
  occurredAt: Date;
  failedAt: Date;
}

/** Lista dead-letter a unei scheme (founder_runtime; fără payload). */
export async function listDeadLetterEvents(
  client: OutboxSqlClient,
  schema: string,
  limit = 100,
): Promise<DeadLetterEvent[]> {
  const s = sqlIdentifier(schema, 'Schemă');
  const { rows } = await client.query(
    `SELECT event_id::text AS event_id, type, version, organization_id::text AS organization_id,
            source_app, resource_id, attempts, last_error, occurred_at, failed_at
       FROM ${s}.outbox_dead_letters($1)`,
    [limit],
  );
  return (rows as Record<string, unknown>[]).map((r) => ({
    eventId: r.event_id as string,
    type: r.type as string,
    version: r.version as number,
    organizationId: r.organization_id as string,
    sourceApp: r.source_app as string,
    resourceId: r.resource_id as string,
    attempts: r.attempts as number,
    lastError: (r.last_error as string | null) ?? null,
    occurredAt: new Date(r.occurred_at as string),
    failedAt: new Date(r.failed_at as string),
  }));
}
