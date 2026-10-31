import { uuidv7 } from './uuidv7';

/*
 * Outbox (ARCHITECTURE §11.2, D-INF-4; Lot 4.1, D4-1 = a, D4-2 = a).
 *
 * Aici stau doar helperii, fără concepte de business: plicul, scrierea în tranzacția
 * modulului, tabelele `outbox_events` și `processed_events` (migrarea-șablon) și operațiile
 * dispecerului pe ele (outbox-store.ts). Catalogul evenimentelor e în @ventora/contracts,
 * dispecerul și registrul consumatorilor în core/integrations.
 */

/** Identificator SQL sigur (schemă, rol): previne injecția în numele interpolate. */
export function sqlIdentifier(name: string, what = 'identificator'): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`[db-kit] ${what} invalid: "${name}"`);
  }
  return name;
}

/** Plicul complet al unui eveniment (§11.2). */
export interface OutboxEnvelope<TPayload = unknown> {
  /** UUIDv7, ordonat cronologic. */
  eventId: string;
  type: string;
  version: number;
  occurredAt: Date;
  organizationId: string;
  sourceApp: string;
  resourceId: string;
  correlationId: string | null;
  payload: TPayload;
}

/**
 * Ce știe db-kit despre un eveniment din catalog: tipul, versiunea și validarea payload-ului.
 * `EventDefinition` din @ventora/contracts are exact forma asta.
 */
export interface OutboxEventType<TPayload> {
  type: string;
  version: number;
  parse(payload: unknown): TPayload;
}

/** Tranzacția Prisma a modulului (Prisma.$executeRawUnsafe) sau un client pg (query). */
export type OutboxWriter =
  | { $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number> }
  | { query(sql: string, params?: unknown[]): Promise<unknown> };

const INSERT_COLUMNS = `event_id, type, version, occurred_at, organization_id, source_app,
       resource_id, correlation_id, payload`;

/**
 * Scrie evenimentul în `<schema>.outbox_events`, în tranzacția curentă a modulului: o
 * tranzacție anulată nu lasă eveniment. Payload-ul e validat cu schema din catalog înainte de
 * scriere. Tranzacția trebuie să aibă contextul organizației (RLS, WITH CHECK): un eveniment
 * pentru altă organizație e refuzat de baza de date.
 */
export async function writeOutboxEvent<TPayload>(
  tx: OutboxWriter,
  schema: string,
  event: OutboxEventType<TPayload>,
  input: {
    organizationId: string;
    sourceApp: string;
    resourceId: string;
    payload: TPayload;
    correlationId?: string | null;
    eventId?: string;
    occurredAt?: Date;
  },
): Promise<OutboxEnvelope<TPayload>> {
  const safeSchema = sqlIdentifier(schema, 'Schemă');
  const envelope: OutboxEnvelope<TPayload> = {
    eventId: input.eventId ?? uuidv7(),
    type: event.type,
    version: event.version,
    occurredAt: input.occurredAt ?? new Date(),
    organizationId: input.organizationId,
    sourceApp: input.sourceApp,
    resourceId: input.resourceId,
    correlationId: input.correlationId ?? null,
    payload: event.parse(input.payload),
  };
  const sql = `INSERT INTO ${safeSchema}.outbox_events (${INSERT_COLUMNS})
     VALUES ($1::uuid, $2, $3, $4, $5::uuid, $6, $7, $8, $9::jsonb)`;
  const values = [
    envelope.eventId,
    envelope.type,
    envelope.version,
    envelope.occurredAt,
    envelope.organizationId,
    envelope.sourceApp,
    envelope.resourceId,
    envelope.correlationId,
    JSON.stringify(envelope.payload),
  ];
  if ('$executeRawUnsafe' in tx) await tx.$executeRawUnsafe(sql, ...values);
  else await tx.query(sql, values);
  return envelope;
}

/** Dead-letter după atâtea eșecuri ale aceluiași eveniment (D-INF-4, Lot 4.1). */
export const OUTBOX_MAX_ATTEMPTS = 3;

/**
 * Migrarea-șablon: `outbox_events` și `processed_events` pentru o schemă care emite, cu RLS pe
 * `app.organization_id` (USING + WITH CHECK, §12.3) și rolul modulului. Se lipește într-o
 * migrare versionată a modulului (`<data>_outbox_init/migration.sql`), după crearea schemei și a
 * rolului. Fără DELETE pentru rolul modulului: evenimentele rămân ca istoric.
 *
 * - `<schema>.outbox_pending(limit)` (SECURITY DEFINER, doar pentru rolul modulului): ce
 *   așteaptă livrarea, în toate organizațiile, doar `event_id` și `organization_id`. Dispecerul
 *   ia apoi fiecare eveniment în contextul organizației lui, sub RLS.
 * - `<schema>.outbox_dead_letters(limit)` (SECURITY DEFINER, doar pentru `founder_runtime`):
 *   lista dead-letter, fără payload, pentru Founder.
 */
export function outboxMigrationSql(schema: string, moduleRole: string): string {
  const s = sqlIdentifier(schema, 'Schemă');
  const r = sqlIdentifier(moduleRole, 'Rol');
  const org = `NULLIF(current_setting('app.organization_id', true), '')::uuid`;
  return `-- Outbox (Lot 4.1, ARCHITECTURE §11.2): generat de outboxMigrationSql('${s}', '${r}') din @ventora/db-kit.

CREATE TABLE "${s}"."outbox_events" (
  "event_id"        UUID         NOT NULL,
  "type"            VARCHAR(128) NOT NULL,
  "version"         INTEGER      NOT NULL,
  "occurred_at"     TIMESTAMPTZ  NOT NULL,
  "organization_id" UUID         NOT NULL,
  "source_app"      VARCHAR(64)  NOT NULL,
  "resource_id"     VARCHAR(255) NOT NULL,
  "correlation_id"  VARCHAR(255),
  "payload"         JSONB        NOT NULL,
  "status"          VARCHAR(16)  NOT NULL DEFAULT 'pending',
  "attempts"        INTEGER      NOT NULL DEFAULT 0,
  "available_at"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "last_error"      TEXT,
  "failed_at"       TIMESTAMPTZ,
  "dispatched_at"   TIMESTAMPTZ,
  "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("event_id"),
  CONSTRAINT "outbox_events_version_check" CHECK ("version" >= 1),
  CONSTRAINT "outbox_events_status_check" CHECK ("status" IN ('pending', 'dispatched', 'dead')),
  CONSTRAINT "outbox_events_attempts_check" CHECK ("attempts" >= 0)
);

CREATE INDEX "outbox_events_pending_idx"
  ON "${s}"."outbox_events" ("available_at", "occurred_at")
  WHERE "status" = 'pending';

CREATE INDEX "outbox_events_dead_idx"
  ON "${s}"."outbox_events" ("failed_at")
  WHERE "status" = 'dead';

-- Idempotența consumatorilor (D4-1 = a): un rând per (consumator, eveniment), scris în aceeași
-- tranzacție cu efectul consumatorului.
CREATE TABLE "${s}"."processed_events" (
  "consumer"        VARCHAR(128) NOT NULL,
  "event_id"        UUID         NOT NULL,
  "organization_id" UUID         NOT NULL,
  "processed_at"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "processed_events_pkey" PRIMARY KEY ("consumer", "event_id")
);

GRANT SELECT, INSERT, UPDATE ON "${s}"."outbox_events" TO ${r};
GRANT SELECT, INSERT ON "${s}"."processed_events" TO ${r};
REVOKE DELETE ON "${s}"."outbox_events" FROM ${r};
REVOKE UPDATE, DELETE ON "${s}"."processed_events" FROM ${r};

ALTER TABLE "${s}"."outbox_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "${s}"."processed_events" ENABLE ROW LEVEL SECURITY;

CREATE POLICY ${r}_outbox_events ON "${s}"."outbox_events"
  TO ${r}
  USING (organization_id = ${org})
  WITH CHECK (organization_id = ${org});

CREATE POLICY ${r}_processed_events ON "${s}"."processed_events"
  TO ${r}
  USING (organization_id = ${org})
  WITH CHECK (organization_id = ${org});

CREATE OR REPLACE FUNCTION "${s}".outbox_pending(p_limit INTEGER)
RETURNS TABLE (event_id UUID, organization_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT e.event_id, e.organization_id
    FROM "${s}".outbox_events e
   WHERE e.status = 'pending'
     AND e.available_at <= now()
   ORDER BY e.available_at, e.occurred_at, e.event_id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 100);
$$;

CREATE OR REPLACE FUNCTION "${s}".outbox_dead_letters(p_limit INTEGER)
RETURNS TABLE (
  event_id        UUID,
  type            VARCHAR(128),
  version         INTEGER,
  organization_id UUID,
  source_app      VARCHAR(64),
  resource_id     VARCHAR(255),
  attempts        INTEGER,
  last_error      TEXT,
  occurred_at     TIMESTAMPTZ,
  failed_at       TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT e.event_id, e.type, e.version, e.organization_id, e.source_app, e.resource_id,
         e.attempts, e.last_error, e.occurred_at, e.failed_at
    FROM "${s}".outbox_events e
   WHERE e.status = 'dead'
   ORDER BY e.failed_at DESC, e.event_id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 500);
$$;

REVOKE ALL ON FUNCTION "${s}".outbox_pending(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${s}".outbox_dead_letters(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${s}".outbox_pending(INTEGER) TO ${r};

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA "${s}" TO founder_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION "${s}".outbox_dead_letters(INTEGER) TO founder_runtime';
  END IF;
END $$;
`;
}
