-- Lot 2.5a — M1: jurnalul de audit unic (schema "audit").
--
-- Roluri (D-DB-1 varianta C: NOLOGIN NOINHERIT, folosite prin SET LOCAL ROLE):
--   audit_writer         → doar EXECUTE pe audit.append_event(...); fără INSERT/UPDATE/DELETE direct
--   audit_org_reader     → SELECT cu RLS pe app.organization_id (eșec sigur: fără setare → 0 rânduri)
--   audit_founder_reader → SELECT pe tot jurnalul, doar pentru founder_runtime
-- Imutabilitate: niciun rol de runtime nu are UPDATE/DELETE/TRUNCATE + trigger-e care blochează
-- inclusiv rolul postgres. Ștergerea pentru retenție (D7) se face într-un lot ulterior.

-- Roles (idempotent, separate DO blocks per role)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'audit_writer') THEN
    CREATE ROLE audit_writer NOLOGIN NOINHERIT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'audit_org_reader') THEN
    CREATE ROLE audit_org_reader NOLOGIN NOINHERIT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'audit_founder_reader') THEN
    CREATE ROLE audit_founder_reader NOLOGIN NOINHERIT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
    EXECUTE 'GRANT audit_writer TO app_runtime';
    EXECUTE 'GRANT audit_org_reader TO app_runtime';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    EXECUTE 'GRANT audit_writer TO founder_runtime';
    EXECUTE 'GRANT audit_founder_reader TO founder_runtime';
  END IF;
END $$;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "audit";

GRANT USAGE ON SCHEMA "audit" TO audit_writer, audit_org_reader, audit_founder_reader;

-- CreateTable
CREATE TABLE "audit"."audit_log" (
    "id"                 UUID         NOT NULL DEFAULT gen_random_uuid(),
    "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category"           VARCHAR(16)  NOT NULL,
    "action"             VARCHAR(64)  NOT NULL,
    "outcome"            VARCHAR(8)   NOT NULL,
    "actor_type"         VARCHAR(12)  NOT NULL,
    "actor_id"           TEXT,
    "founder_id"         TEXT,
    "support_session_id" UUID,
    "organization_id"    UUID,
    "target_type"        VARCHAR(32),
    "target_id"          TEXT,
    "ip"                 INET,
    "user_agent"         VARCHAR(512),
    "request_id"         VARCHAR(64),
    "metadata"           JSONB        NOT NULL DEFAULT '{}',

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_log_category_check"
      CHECK ("category" IN ('identity', 'organization', 'access', 'support', 'founder', 'commercial')),
    CONSTRAINT "audit_log_outcome_check"
      CHECK ("outcome" IN ('success', 'failure', 'denied')),
    CONSTRAINT "audit_log_actor_type_check"
      CHECK ("actor_type" IN ('user', 'founder', 'support', 'system', 'anonymous')),
    CONSTRAINT "audit_log_metadata_object_check"
      CHECK (jsonb_typeof("metadata") = 'object'),
    CONSTRAINT "audit_log_metadata_size_check"
      CHECK (octet_length("metadata"::text) <= 8192)
);

CREATE INDEX "audit_log_organization_id_created_at_idx"
  ON "audit"."audit_log"("organization_id", "created_at" DESC);
CREATE INDEX "audit_log_actor_id_created_at_idx"
  ON "audit"."audit_log"("actor_id", "created_at" DESC);
CREATE INDEX "audit_log_founder_id_created_at_idx"
  ON "audit"."audit_log"("founder_id", "created_at" DESC);
CREATE INDEX "audit_log_action_created_at_idx"
  ON "audit"."audit_log"("action", "created_at" DESC);
CREATE INDEX "audit_log_support_session_id_idx"
  ON "audit"."audit_log"("support_session_id");
-- Retenție (D7): ștergerea pe categorie + vechime folosește acest index (lot ulterior).
CREATE INDEX "audit_log_category_created_at_idx"
  ON "audit"."audit_log"("category", "created_at");

-- Immutability: rejects UPDATE / DELETE (row) and TRUNCATE (statement) for every role,
-- including postgres. Removing it requires a reviewed migration.
CREATE OR REPLACE FUNCTION audit.reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log_immutable: % is not allowed on audit.audit_log', TG_OP
    USING ERRCODE = 'P0001';
END $$;

CREATE TRIGGER audit_log_immutable
  BEFORE UPDATE OR DELETE ON "audit"."audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();

CREATE TRIGGER audit_log_immutable_truncate
  BEFORE TRUNCATE ON "audit"."audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION audit.reject_mutation();

-- Write path: the only way a runtime role can add a row.
-- created_at is always the database clock (now()); the caller cannot set it.
-- SECURITY DEFINER because the writer has no INSERT on the table and must not be able to read it
-- (Prisma create would need RETURNING → SELECT).
CREATE OR REPLACE FUNCTION audit.append_event(
  p_category           TEXT,
  p_action             TEXT,
  p_outcome            TEXT,
  p_actor_type         TEXT,
  p_actor_id           TEXT,
  p_founder_id         TEXT,
  p_support_session_id UUID,
  p_organization_id    UUID,
  p_target_type        TEXT,
  p_target_id          TEXT,
  p_ip                 INET,
  p_user_agent         TEXT,
  p_request_id         TEXT,
  p_metadata           JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_id       UUID;
  v_metadata JSONB := COALESCE(p_metadata, '{}'::jsonb);
BEGIN
  IF p_action IS NULL OR p_action !~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$' THEN
    RAISE EXCEPTION 'audit.append_event: invalid action "%"', p_action USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_metadata) <> 'object' THEN
    RAISE EXCEPTION 'audit.append_event: metadata must be a JSON object' USING ERRCODE = '22023';
  END IF;
  IF octet_length(v_metadata::text) > 8192 THEN
    RAISE EXCEPTION 'audit.append_event: metadata exceeds 8192 bytes' USING ERRCODE = '22001';
  END IF;

  INSERT INTO audit.audit_log (
    created_at, category, action, outcome, actor_type, actor_id, founder_id, support_session_id,
    organization_id, target_type, target_id, ip, user_agent, request_id, metadata
  )
  VALUES (
    now(), p_category, p_action, p_outcome, p_actor_type, p_actor_id, p_founder_id,
    p_support_session_id, p_organization_id, p_target_type, p_target_id, p_ip,
    left(p_user_agent, 512), left(p_request_id, 64), v_metadata
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION audit.append_event(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, TEXT, TEXT, INET, TEXT, TEXT, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.append_event(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, TEXT, TEXT, INET, TEXT, TEXT, JSONB
) TO audit_writer;

REVOKE ALL ON FUNCTION audit.reject_mutation() FROM PUBLIC;

-- Read path
GRANT SELECT ON "audit"."audit_log" TO audit_org_reader, audit_founder_reader;

ALTER TABLE "audit"."audit_log" ENABLE ROW LEVEL SECURITY;

-- Organization members (owner/admin, checked by authorize() in the app) see only their org.
-- Rows with organization_id IS NULL (logins, Founder-internal actions) never match.
CREATE POLICY audit_org_reader_select ON "audit"."audit_log"
  FOR SELECT
  TO audit_org_reader
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Founder application sees the full log.
CREATE POLICY audit_founder_reader_select ON "audit"."audit_log"
  FOR SELECT
  TO audit_founder_reader
  USING (true);
