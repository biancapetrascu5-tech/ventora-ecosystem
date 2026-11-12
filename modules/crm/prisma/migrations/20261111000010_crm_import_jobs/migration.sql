-- Lot CR.11b (part 2): the import jobs of ClientDesk (plans/CRM.md CR.11, design S132).
--
--   import_job → one CSV import: the file in core/files (crm / import / <job id>, C.4e), the
--                mapping, what to do with an existing contact (skip / update / create), the
--                progress (next_row and the counters), the errors (row, field, reason; never a
--                cell value), a lease so two runs never work on the same job, and when the file
--                was deleted (after the end, a cancel, or 7 days at most — review of 11.11).
--   contact.import_job_id → the contacts a job created: a cancel moves them to the bin.
--
-- The platform job (crm.import, every minute) lists the jobs to work on in every business through
-- crm.import_jobs_due (SECURITY DEFINER, ids only, fixed search_path, REVOKE FROM PUBLIC; the rule
-- of 11.11: approved by the coordinator after review), then works on each one in its business's
-- context, as crm_rw (RLS).

CREATE TABLE "crm"."import_job" (
  "id"                   UUID         NOT NULL,
  "organization_id"      UUID         NOT NULL,
  "file_id"              UUID         NOT NULL,
  "mapping"              JSONB        NOT NULL DEFAULT '{}',
  "duplicate_mode"       VARCHAR(6)   NOT NULL DEFAULT 'skip',
  "scope"                VARCHAR(3)   NOT NULL DEFAULT 'own',
  "state"                VARCHAR(9)   NOT NULL DEFAULT 'draft',
  "failure"              VARCHAR(16),
  "total_rows"           INTEGER      NOT NULL DEFAULT 0,
  "next_row"             INTEGER      NOT NULL DEFAULT 0,
  "created_count"        INTEGER      NOT NULL DEFAULT 0,
  "updated_count"        INTEGER      NOT NULL DEFAULT 0,
  "skipped_count"        INTEGER      NOT NULL DEFAULT 0,
  "error_count"          INTEGER      NOT NULL DEFAULT 0,
  "errors"               JSONB        NOT NULL DEFAULT '[]',
  "lease_until"          TIMESTAMPTZ,
  "file_deleted_at"      TIMESTAMPTZ,
  "created_by_user_id"   UUID         NOT NULL,
  "started_at"           TIMESTAMPTZ,
  "finished_at"          TIMESTAMPTZ,
  "cancelled_at"         TIMESTAMPTZ,
  "cancelled_by_user_id" UUID,
  "created_at"           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"           TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "import_job_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "import_job_mode_check" CHECK ("duplicate_mode" IN ('skip', 'update', 'create')),
  CONSTRAINT "import_job_scope_check" CHECK ("scope" IN ('all', 'own')),
  CONSTRAINT "import_job_state_check"
    CHECK ("state" IN ('draft', 'queued', 'running', 'done', 'cancelled', 'failed')),
  CONSTRAINT "import_job_failure_check"
    CHECK (("state" = 'failed') = ("failure" IS NOT NULL) AND ("failure" IS NULL OR "failure" IN ('quota', 'file', 'expired'))),
  CONSTRAINT "import_job_counts_check" CHECK (
    "total_rows" BETWEEN 0 AND 10000 AND "next_row" BETWEEN 0 AND "total_rows"
    AND "created_count" >= 0 AND "updated_count" >= 0 AND "skipped_count" >= 0 AND "error_count" >= 0
  ),
  CONSTRAINT "import_job_cancelled_check"
    CHECK (("state" = 'cancelled') = ("cancelled_at" IS NOT NULL) AND ("cancelled_at" IS NULL) = ("cancelled_by_user_id" IS NULL))
);
CREATE UNIQUE INDEX "import_job_organization_id_id_key" ON "crm"."import_job" ("organization_id", "id");
CREATE INDEX "import_job_organization_id_created_at_idx"
  ON "crm"."import_job" ("organization_id", "created_at" DESC);

CREATE TRIGGER import_job_touch BEFORE UPDATE ON "crm"."import_job"
  FOR EACH ROW EXECUTE FUNCTION crm.touch_updated_at();

ALTER TABLE "crm"."import_job" ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_rw_import_job ON "crm"."import_job" TO crm_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- the contacts a job created (composite: the job of the same business)
ALTER TABLE "crm"."contact"
  ADD COLUMN "import_job_id" UUID,
  ADD CONSTRAINT "contact_import_job_id_fkey" FOREIGN KEY ("organization_id", "import_job_id")
    REFERENCES "crm"."import_job" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX "contact_import_job_id_idx" ON "crm"."contact" ("import_job_id");

-- the jobs to work on in every business (ids only), oldest first, at most 100 per call:
-- queued or running; or finished / cancelled / failed with the file still there; or older than 7 days
CREATE OR REPLACE FUNCTION crm.import_jobs_due(p_limit INTEGER)
RETURNS TABLE (id UUID, organization_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT j.id, j.organization_id
    FROM crm.import_job j
   WHERE j.state IN ('queued', 'running')
      OR (j.file_deleted_at IS NULL
          AND (j.state IN ('done', 'cancelled', 'failed') OR j.created_at < now() - INTERVAL '7 days'))
   ORDER BY j.created_at, j.id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 100);
$$;

REVOKE ALL ON FUNCTION crm.import_jobs_due(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.import_jobs_due(INTEGER) TO crm_rw;

-- Grants: only crm_rw; no DELETE (§6.4 c)
REVOKE ALL ON "crm"."import_job" FROM PUBLIC;
GRANT SELECT, INSERT ON "crm"."import_job" TO crm_rw;
GRANT UPDATE ("mapping", "duplicate_mode", "scope", "state", "failure", "total_rows", "next_row",
              "created_count", "updated_count", "skipped_count", "error_count", "errors",
              "lease_until", "file_deleted_at", "started_at", "finished_at", "cancelled_at",
              "cancelled_by_user_id", "updated_at")
  ON "crm"."import_job" TO crm_rw;
GRANT UPDATE ("import_job_id") ON "crm"."contact" TO crm_rw;
