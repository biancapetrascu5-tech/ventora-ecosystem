-- Lot 4.9: Infrastructura AI — schema, roluri, tabele, RLS, GRANT-uri.
-- D4-20: OpenAI, în spatele unui adaptor. D4-21: intern tokeni→lei, client cota ai.analyses.

-- ─── Roluri (idempotent) ───────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ai_rw') THEN
    CREATE ROLE ai_rw NOLOGIN NOINHERIT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ai_founder') THEN
    CREATE ROLE ai_founder NOLOGIN NOINHERIT;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
    EXECUTE 'GRANT ai_rw TO app_runtime';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    EXECUTE 'GRANT ai_founder TO founder_runtime';
  END IF;
END $$;

-- ─── Schema ────────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS "ai";
GRANT USAGE ON SCHEMA "ai" TO ai_rw;
GRANT USAGE ON SCHEMA "ai" TO ai_founder;

-- ─── ai.models ─────────────────────────────────────────────────────────────────
-- Registru de modele AI (platformă, fără RLS pe org — fondatorii gestionează).

CREATE TABLE "ai"."models" (
  "id"                        UUID        NOT NULL DEFAULT gen_random_uuid(),
  "slug"                      VARCHAR(64) NOT NULL,
  "provider"                  VARCHAR(32) NOT NULL,
  "provider_model_id"         VARCHAR(128) NOT NULL,
  "display_name"              VARCHAR(128) NOT NULL,
  "max_input_tokens"          INT         NOT NULL,
  "max_output_tokens"         INT         NOT NULL,
  "cost_per_input_token_ron"  DECIMAL(12, 10) NOT NULL,
  "cost_per_output_token_ron" DECIMAL(12, 10) NOT NULL,
  "enabled"                   BOOLEAN     NOT NULL DEFAULT true,
  "created_at"                TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"                TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "models_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "models_slug_key" UNIQUE ("slug"),

  CONSTRAINT "models_cost_input_positive"  CHECK ("cost_per_input_token_ron"  >= 0),
  CONSTRAINT "models_cost_output_positive" CHECK ("cost_per_output_token_ron" >= 0),
  CONSTRAINT "models_max_input_positive"   CHECK ("max_input_tokens"  > 0),
  CONSTRAINT "models_max_output_positive"  CHECK ("max_output_tokens" > 0)
);

ALTER TABLE "ai"."models" ENABLE ROW LEVEL SECURITY;

-- ai_rw: doar SELECT (runtime-ul citește registrul, nu îl modifică).
CREATE POLICY ai_rw_models_select ON "ai"."models" FOR SELECT TO ai_rw USING (true);

-- ai_founder: CRUD complet pe models.
CREATE POLICY ai_founder_models_all ON "ai"."models" TO ai_founder USING (true) WITH CHECK (true);

REVOKE ALL ON "ai"."models" FROM PUBLIC;
GRANT SELECT ON "ai"."models" TO ai_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ai"."models" TO ai_founder;

-- ─── ai.system_prompts ────────────────────────────────────────────────────────
-- Prompturi de sistem. organization_id NULL = implicit platformă. Org-specific are RLS.

CREATE TABLE "ai"."system_prompts" (
  "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "application_id"  VARCHAR(64)  NOT NULL,
  "prompt_key"      VARCHAR(128) NOT NULL,
  "model_slug"      VARCHAR(64)  NOT NULL,
  "content"         TEXT         NOT NULL,
  "enabled"         BOOLEAN      NOT NULL DEFAULT true,
  "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "system_prompts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "system_prompts_org_app_key_key" UNIQUE ("organization_id", "application_id", "prompt_key"),
  CONSTRAINT "system_prompts_model_slug_fkey" FOREIGN KEY ("model_slug") REFERENCES "ai"."models"("slug")
);

ALTER TABLE "ai"."system_prompts" ENABLE ROW LEVEL SECURITY;

-- ai_rw: vede prompturile organizației curente + cele globale (NULL).
CREATE POLICY ai_rw_system_prompts_select ON "ai"."system_prompts" FOR SELECT TO ai_rw
  USING (
    organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid
    OR organization_id IS NULL
  );

-- ai_rw: poate insera/modifica doar pe organizația curentă (nu pe cele globale).
CREATE POLICY ai_rw_system_prompts_write ON "ai"."system_prompts" FOR ALL TO ai_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- ai_founder: CRUD complet (inclusiv prompturi globale).
CREATE POLICY ai_founder_system_prompts_all ON "ai"."system_prompts" TO ai_founder
  USING (true) WITH CHECK (true);

REVOKE ALL ON "ai"."system_prompts" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON "ai"."system_prompts" TO ai_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ai"."system_prompts" TO ai_founder;

-- ─── ai.usage_records ──────────────────────────────────────────────────────────
-- Append-only: fiecare apel AI generează un rând.

CREATE TABLE "ai"."usage_records" (
  "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID         NOT NULL,
  "application_id"  VARCHAR(64)  NOT NULL,
  "user_id"         UUID         NOT NULL,
  "model_slug"      VARCHAR(64)  NOT NULL,
  "prompt_key"      VARCHAR(128) NOT NULL,
  "input_tokens"    INT          NOT NULL,
  "output_tokens"   INT          NOT NULL,
  "cost_ron"        DECIMAL(10, 6) NOT NULL,
  "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id"),

  CONSTRAINT "usage_records_tokens_positive" CHECK ("input_tokens" >= 0 AND "output_tokens" >= 0),
  CONSTRAINT "usage_records_cost_positive"   CHECK ("cost_ron" >= 0)
);

CREATE INDEX "usage_records_org_created" ON "ai"."usage_records" ("organization_id", "created_at");

ALTER TABLE "ai"."usage_records" ENABLE ROW LEVEL SECURITY;

-- ai_rw: vede și scrie doar pe organizația curentă.
CREATE POLICY ai_rw_usage_records ON "ai"."usage_records" TO ai_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- ai_founder: vede tot (raportare cross-org).
CREATE POLICY ai_founder_usage_records_select ON "ai"."usage_records" FOR SELECT TO ai_founder
  USING (true);

REVOKE ALL ON "ai"."usage_records" FROM PUBLIC;
GRANT SELECT, INSERT ON "ai"."usage_records" TO ai_rw;
GRANT SELECT ON "ai"."usage_records" TO ai_founder;

-- ─── ai.cost_limits ────────────────────────────────────────────────────────────
-- Plafon global (organization_id IS NULL) și per organizație.

CREATE TABLE "ai"."cost_limits" (
  "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "period"          VARCHAR(16)  NOT NULL DEFAULT 'month',
  "limit_ron"       DECIMAL(10, 2) NOT NULL,
  "enabled"         BOOLEAN      NOT NULL DEFAULT true,
  "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "cost_limits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cost_limits_org_period_key" UNIQUE ("organization_id", "period"),

  CONSTRAINT "cost_limits_limit_positive" CHECK ("limit_ron" > 0),
  CONSTRAINT "cost_limits_period_check"   CHECK ("period" IN ('month'))
);

ALTER TABLE "ai"."cost_limits" ENABLE ROW LEVEL SECURITY;

-- ai_rw: vede plafonul organizației curente + cel global.
CREATE POLICY ai_rw_cost_limits_select ON "ai"."cost_limits" FOR SELECT TO ai_rw
  USING (
    organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid
    OR organization_id IS NULL
  );

-- ai_founder: CRUD complet (setează plafoanele).
CREATE POLICY ai_founder_cost_limits_all ON "ai"."cost_limits" TO ai_founder
  USING (true) WITH CHECK (true);

REVOKE ALL ON "ai"."cost_limits" FROM PUBLIC;
GRANT SELECT ON "ai"."cost_limits" TO ai_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ai"."cost_limits" TO ai_founder;

-- ─── SECURITY DEFINER: costul global lunar ─────────────────────────────────────
-- Necesară pentru verificarea plafonului global (citire cross-org din usage_records).

CREATE OR REPLACE FUNCTION ai.global_monthly_cost(p_year INT, p_month INT)
RETURNS TABLE (total DECIMAL)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT COALESCE(SUM(u.cost_ron), 0) AS total
    FROM ai.usage_records u
   WHERE EXTRACT(YEAR  FROM u.created_at) = p_year
     AND EXTRACT(MONTH FROM u.created_at) = p_month;
$$;

REVOKE ALL ON FUNCTION ai.global_monthly_cost(INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ai.global_monthly_cost(INT, INT) TO ai_rw;
GRANT EXECUTE ON FUNCTION ai.global_monthly_cost(INT, INT) TO ai_founder;

-- ─── Seed: modelele inițiale ───────────────────────────────────────────────────
-- Costurile sunt orientative, în RON (curs ~4.97 RON/USD, nov 2026).
-- NECESITĂ DECIZIE FONDATORI: costurile exacte per token.

INSERT INTO "ai"."models" ("slug", "provider", "provider_model_id", "display_name",
  "max_input_tokens", "max_output_tokens",
  "cost_per_input_token_ron", "cost_per_output_token_ron")
VALUES
  ('gpt-4o-mini', 'openai', 'gpt-4o-mini', 'GPT-4o Mini',
   128000, 16384, 0.0000007450, 0.0000029800),
  ('gpt-4o', 'openai', 'gpt-4o', 'GPT-4o',
   128000, 16384, 0.0000012425, 0.0000049700)
ON CONFLICT ("slug") DO NOTHING;
