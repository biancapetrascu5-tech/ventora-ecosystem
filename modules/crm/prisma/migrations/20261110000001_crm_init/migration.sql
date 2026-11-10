-- Lot CR.1 (plans/CRM.md §3, aprobat 10.11.2026): schema crm (ClientDesk). The role crm_rw
-- (NOLOGIN NOINHERIT, granted only to app_runtime), RLS on app.organization_id (D-SEC-1).
--
--   settings          → the ClientDesk preferences of a business, one row, written on the first
--                       save (until then the contract answers the defaults):
--                       booking_link_enabled  — the automatic EasyBook link (D-CRM-2 = c: on by
--                                               default; the business can turn it off)
--                       inactive_after_months — „inactiv de N luni” in the client lifecycle
--                                               (D-CRM-18; N chosen by the business, 1–36)
--   outbox_events     → the crm.* events (from CR.2), with processed_events
--
-- No physical delete (§6.4 c). No UPDATE of organization_id / created_*. The contacts, companies
-- and the rest come with their own lots (CR.2 onwards), each with its migration and grants.

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'crm_rw') THEN
    CREATE ROLE crm_rw NOLOGIN NOINHERIT;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT crm_rw TO app_runtime;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS "crm";
GRANT USAGE ON SCHEMA "crm" TO crm_rw;

-- CreateTable
CREATE TABLE "crm"."settings" (
  "organization_id"       UUID        NOT NULL,
  "booking_link_enabled"  BOOLEAN     NOT NULL DEFAULT true,
  "inactive_after_months" SMALLINT    NOT NULL DEFAULT 6,
  "updated_by_user_id"    UUID        NOT NULL,
  "created_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "settings_pkey" PRIMARY KEY ("organization_id"),
  CONSTRAINT "settings_inactive_after_months_check"
    CHECK ("inactive_after_months" BETWEEN 1 AND 36)
);

CREATE OR REPLACE FUNCTION crm.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION crm.touch_updated_at() FROM PUBLIC;

CREATE TRIGGER settings_touch
  BEFORE UPDATE ON "crm"."settings"
  FOR EACH ROW EXECUTE FUNCTION crm.touch_updated_at();

-- RLS (D-SEC-1): USING + WITH CHECK on app.organization_id
ALTER TABLE "crm"."settings" ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_rw_settings ON "crm"."settings"
  TO crm_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Grants: explicit per table and per column; no DELETE (§6.4 c); no UPDATE of organization_id /
-- created_at. No ALTER DEFAULT PRIVILEGES: each table gets its grants in its own migration.
REVOKE ALL ON "crm"."settings" FROM PUBLIC;
GRANT SELECT, INSERT ON "crm"."settings" TO crm_rw;
GRANT UPDATE ("booking_link_enabled", "inactive_after_months", "updated_by_user_id", "updated_at")
  ON "crm"."settings" TO crm_rw;

-- Outbox (Lot 4.1, ARCHITECTURE §11.2): generat de outboxMigrationSql('crm', 'crm_rw') din @ventora/db-kit.

CREATE TABLE "crm"."outbox_events" (
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
  ON "crm"."outbox_events" ("available_at", "occurred_at")
  WHERE "status" = 'pending';

CREATE INDEX "outbox_events_dead_idx"
  ON "crm"."outbox_events" ("failed_at")
  WHERE "status" = 'dead';

-- Idempotența consumatorilor (D4-1 = a): un rând per (consumator, eveniment), scris în aceeași
-- tranzacție cu efectul consumatorului.
CREATE TABLE "crm"."processed_events" (
  "consumer"        VARCHAR(128) NOT NULL,
  "event_id"        UUID         NOT NULL,
  "organization_id" UUID         NOT NULL,
  "processed_at"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "processed_events_pkey" PRIMARY KEY ("consumer", "event_id")
);

GRANT SELECT, INSERT, UPDATE ON "crm"."outbox_events" TO crm_rw;
GRANT SELECT, INSERT ON "crm"."processed_events" TO crm_rw;
REVOKE DELETE ON "crm"."outbox_events" FROM crm_rw;
REVOKE UPDATE, DELETE ON "crm"."processed_events" FROM crm_rw;

ALTER TABLE "crm"."outbox_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm"."processed_events" ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_rw_outbox_events ON "crm"."outbox_events"
  TO crm_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY crm_rw_processed_events ON "crm"."processed_events"
  TO crm_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE OR REPLACE FUNCTION "crm".outbox_pending(p_limit INTEGER)
RETURNS TABLE (event_id UUID, organization_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT e.event_id, e.organization_id
    FROM "crm".outbox_events e
   WHERE e.status = 'pending'
     AND e.available_at <= now()
   ORDER BY e.available_at, e.occurred_at, e.event_id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 100);
$$;

CREATE OR REPLACE FUNCTION "crm".outbox_dead_letters(p_limit INTEGER)
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
    FROM "crm".outbox_events e
   WHERE e.status = 'dead'
   ORDER BY e.failed_at DESC, e.event_id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 500);
$$;

REVOKE ALL ON FUNCTION "crm".outbox_pending(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION "crm".outbox_dead_letters(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "crm".outbox_pending(INTEGER) TO crm_rw;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA "crm" TO founder_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION "crm".outbox_dead_letters(INTEGER) TO founder_runtime';
  END IF;
END $$;
