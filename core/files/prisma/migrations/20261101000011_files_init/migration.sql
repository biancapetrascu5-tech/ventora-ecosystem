-- Lot 4.7 (FAZA-4, ARCHITECTURE §4 rândul `files`, §12.4): fișierele.
-- Schema `files`, rolul `files_rw` (NOLOGIN NOINHERIT, membru al app_runtime), RLS pe organizație.
--   file           → un fișier al unei organizații: proprietarul (modulul și resursa), numele,
--                    tipul, mărimea, cheia din stocare și starea. Conținutul stă în stocare
--                    (D4-16: Supabase Storage, un bucket privat pe mediu), nu în baza de date.
--   outbox_events  → file.uploaded / file.deleted (Lot 4.1), cu processed_events.
-- Conținutul și versiunile documentelor rămân în Documents.

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'files_rw') THEN
    CREATE ROLE files_rw NOLOGIN NOINHERIT;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT files_rw TO app_runtime;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS "files";
GRANT USAGE ON SCHEMA "files" TO files_rw;

CREATE TABLE "files"."file" (
  "id"                  UUID         NOT NULL,
  "organization_id"     UUID         NOT NULL,
  "owner_module"        VARCHAR(64)  NOT NULL,
  "owner_resource_type" VARCHAR(64)  NOT NULL,
  "owner_resource_id"   VARCHAR(255) NOT NULL,
  "name"                VARCHAR(255) NOT NULL,
  "content_type"        VARCHAR(64)  NOT NULL,
  "size_bytes"          BIGINT       NOT NULL,
  "storage_key"         VARCHAR(512) NOT NULL,
  "status"              VARCHAR(16)  NOT NULL DEFAULT 'pending',
  "uploaded_by_user_id" UUID         NOT NULL,
  "upload_expires_at"   TIMESTAMPTZ  NOT NULL,
  "ready_at"            TIMESTAMPTZ,
  "deleted_at"          TIMESTAMPTZ,
  "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "file_pkey" PRIMARY KEY ("id"),
  -- D4-17 = a: doar PNG / JPG / PDF, până la 10 MB (verificat și în cod, înainte și după încărcare)
  CONSTRAINT "file_content_type_check"
    CHECK ("content_type" IN ('image/png', 'image/jpeg', 'application/pdf')),
  CONSTRAINT "file_size_bytes_check" CHECK ("size_bytes" > 0 AND "size_bytes" <= 10485760),
  CONSTRAINT "file_status_check" CHECK ("status" IN ('pending', 'ready', 'rejected', 'deleted'))
);

CREATE UNIQUE INDEX "file_storage_key_key" ON "files"."file" ("storage_key");
CREATE INDEX "file_organization_id_owner_idx"
  ON "files"."file" ("organization_id", "owner_module", "owner_resource_type", "owner_resource_id");

-- Fără DELETE: ștergerea e o stare (deleted), iar conținutul se scoate din stocare (retenția: D4-18).
GRANT SELECT, INSERT, UPDATE ON "files"."file" TO files_rw;

ALTER TABLE "files"."file" ENABLE ROW LEVEL SECURITY;

-- T1 / T2: un fișier se vede și se scrie doar în contextul organizației lui (app.organization_id).
CREATE POLICY files_rw_file ON "files"."file"
  TO files_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Outbox (Lot 4.1, ARCHITECTURE §11.2): generat de outboxMigrationSql('files', 'files_rw') din @ventora/db-kit.

CREATE TABLE "files"."outbox_events" (
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
  ON "files"."outbox_events" ("available_at", "occurred_at")
  WHERE "status" = 'pending';

CREATE INDEX "outbox_events_dead_idx"
  ON "files"."outbox_events" ("failed_at")
  WHERE "status" = 'dead';

-- Idempotența consumatorilor (D4-1 = a): un rând per (consumator, eveniment), scris în aceeași
-- tranzacție cu efectul consumatorului.
CREATE TABLE "files"."processed_events" (
  "consumer"        VARCHAR(128) NOT NULL,
  "event_id"        UUID         NOT NULL,
  "organization_id" UUID         NOT NULL,
  "processed_at"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "processed_events_pkey" PRIMARY KEY ("consumer", "event_id")
);

GRANT SELECT, INSERT, UPDATE ON "files"."outbox_events" TO files_rw;
GRANT SELECT, INSERT ON "files"."processed_events" TO files_rw;
REVOKE DELETE ON "files"."outbox_events" FROM files_rw;
REVOKE UPDATE, DELETE ON "files"."processed_events" FROM files_rw;

ALTER TABLE "files"."outbox_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "files"."processed_events" ENABLE ROW LEVEL SECURITY;

CREATE POLICY files_rw_outbox_events ON "files"."outbox_events"
  TO files_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY files_rw_processed_events ON "files"."processed_events"
  TO files_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE OR REPLACE FUNCTION "files".outbox_pending(p_limit INTEGER)
RETURNS TABLE (event_id UUID, organization_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT e.event_id, e.organization_id
    FROM "files".outbox_events e
   WHERE e.status = 'pending'
     AND e.available_at <= now()
   ORDER BY e.available_at, e.occurred_at, e.event_id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 100);
$$;

CREATE OR REPLACE FUNCTION "files".outbox_dead_letters(p_limit INTEGER)
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
    FROM "files".outbox_events e
   WHERE e.status = 'dead'
   ORDER BY e.failed_at DESC, e.event_id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 500);
$$;

REVOKE ALL ON FUNCTION "files".outbox_pending(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION "files".outbox_dead_letters(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "files".outbox_pending(INTEGER) TO files_rw;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA "files" TO founder_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION "files".outbox_dead_letters(INTEGER) TO founder_runtime';
  END IF;
END $$;
