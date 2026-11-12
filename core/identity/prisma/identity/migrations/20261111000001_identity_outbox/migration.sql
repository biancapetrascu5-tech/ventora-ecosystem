-- Lot 5.10c (decizia Biancăi din 11.11.2026, 11:59): outbox-ul modulului identity, după modelul
-- organizations (20261031000002_outbox_init): aceleași coloane, RLS pe afacere și GRANT-uri
-- către identity_rw (rolul existent al modulului; niciun rol nou). Primul emițător:
-- user.locale_changed v1 (doar userId și codul limbii), câte un rând pe fiecare afacere a
-- persoanei, ca dispecerul (core/integrations) să lucreze ca la celelalte scheme.
--
-- Fără DELETE: ALTER DEFAULT PRIVILEGES din identity_init ar da DELETE pe tabelele noi, iar
-- generatorul îl revocă explicit (outbox_events: SELECT / INSERT / UPDATE; processed_events:
-- SELECT / INSERT). Doar aditivă: două tabele și două funcții noi; nimic existent nu se schimbă.
-- Outbox (Lot 4.1, ARCHITECTURE §11.2): generat de outboxMigrationSql('identity', 'identity_rw') din @ventora/db-kit.

CREATE TABLE "identity"."outbox_events" (
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
  ON "identity"."outbox_events" ("available_at", "occurred_at")
  WHERE "status" = 'pending';

CREATE INDEX "outbox_events_dead_idx"
  ON "identity"."outbox_events" ("failed_at")
  WHERE "status" = 'dead';

-- Idempotența consumatorilor (D4-1 = a): un rând per (consumator, eveniment), scris în aceeași
-- tranzacție cu efectul consumatorului.
CREATE TABLE "identity"."processed_events" (
  "consumer"        VARCHAR(128) NOT NULL,
  "event_id"        UUID         NOT NULL,
  "organization_id" UUID         NOT NULL,
  "processed_at"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "processed_events_pkey" PRIMARY KEY ("consumer", "event_id")
);

GRANT SELECT, INSERT, UPDATE ON "identity"."outbox_events" TO identity_rw;
GRANT SELECT, INSERT ON "identity"."processed_events" TO identity_rw;
REVOKE DELETE ON "identity"."outbox_events" FROM identity_rw;
REVOKE UPDATE, DELETE ON "identity"."processed_events" FROM identity_rw;

ALTER TABLE "identity"."outbox_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "identity"."processed_events" ENABLE ROW LEVEL SECURITY;

CREATE POLICY identity_rw_outbox_events ON "identity"."outbox_events"
  TO identity_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY identity_rw_processed_events ON "identity"."processed_events"
  TO identity_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE OR REPLACE FUNCTION "identity".outbox_pending(p_limit INTEGER)
RETURNS TABLE (event_id UUID, organization_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT e.event_id, e.organization_id
    FROM "identity".outbox_events e
   WHERE e.status = 'pending'
     AND e.available_at <= now()
   ORDER BY e.available_at, e.occurred_at, e.event_id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 100);
$$;

CREATE OR REPLACE FUNCTION "identity".outbox_dead_letters(p_limit INTEGER)
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
    FROM "identity".outbox_events e
   WHERE e.status = 'dead'
   ORDER BY e.failed_at DESC, e.event_id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 500);
$$;

REVOKE ALL ON FUNCTION "identity".outbox_pending(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION "identity".outbox_dead_letters(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "identity".outbox_pending(INTEGER) TO identity_rw;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA "identity" TO founder_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION "identity".outbox_dead_letters(INTEGER) TO founder_runtime';
  END IF;
END $$;
