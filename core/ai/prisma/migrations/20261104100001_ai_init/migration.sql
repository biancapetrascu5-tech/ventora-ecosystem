-- Lot 4.9: infrastructura AI — schema ai, rolurile ai_rw / ai_founder, RLS, GRANT-uri.
-- D4-20: OpenAI, în spatele unui adaptor. D4-21: intern tokeni → lei; clientul vede cota ai.analyses.
-- Nicio ștergere: modelele, prompturile și plafoanele se dezactivează cu enabled = false.
-- Prompturile și plafoanele le scrie doar echipa (ai_founder); runtime-ul (ai_rw) doar le citește.

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
REVOKE ALL ON SCHEMA "ai" FROM PUBLIC;
GRANT USAGE ON SCHEMA "ai" TO ai_rw;
GRANT USAGE ON SCHEMA "ai" TO ai_founder;

-- ─── ai.models ─────────────────────────────────────────────────────────────────
-- Registrul modelelor (platformă, fără organizație). Prețul e în lei pe token.

CREATE TABLE "ai"."models" (
  "id"                        UUID           NOT NULL DEFAULT gen_random_uuid(),
  "slug"                      VARCHAR(64)    NOT NULL,
  "provider"                  VARCHAR(32)    NOT NULL,
  "provider_model_id"         VARCHAR(128)   NOT NULL,
  "display_name"              VARCHAR(128)   NOT NULL,
  "max_input_tokens"          INTEGER        NOT NULL,
  "max_output_tokens"         INTEGER        NOT NULL,
  "cost_per_input_token_ron"  DECIMAL(14,12) NOT NULL,
  "cost_per_output_token_ron" DECIMAL(14,12) NOT NULL,
  "enabled"                   BOOLEAN        NOT NULL DEFAULT true,
  "created_at"                TIMESTAMPTZ    NOT NULL DEFAULT now(),
  "updated_at"                TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT "models_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "models_cost_input_check"  CHECK ("cost_per_input_token_ron"  >= 0),
  CONSTRAINT "models_cost_output_check" CHECK ("cost_per_output_token_ron" >= 0),
  CONSTRAINT "models_max_input_check"   CHECK ("max_input_tokens"  > 0),
  CONSTRAINT "models_max_output_check"  CHECK ("max_output_tokens" > 0)
);

CREATE UNIQUE INDEX "models_slug_key" ON "ai"."models"("slug");

ALTER TABLE "ai"."models" ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_rw_models_select ON "ai"."models" FOR SELECT TO ai_rw USING (true);
CREATE POLICY ai_founder_models_select ON "ai"."models" FOR SELECT TO ai_founder USING (true);
CREATE POLICY ai_founder_models_insert ON "ai"."models" FOR INSERT TO ai_founder WITH CHECK (true);
CREATE POLICY ai_founder_models_update ON "ai"."models" FOR UPDATE TO ai_founder
  USING (true) WITH CHECK (true);

REVOKE ALL ON "ai"."models" FROM PUBLIC;
GRANT SELECT ON "ai"."models" TO ai_rw;
GRANT SELECT, INSERT, UPDATE ON "ai"."models" TO ai_founder;

-- ─── ai.system_prompts ────────────────────────────────────────────────────────
-- organization_id NULL = promptul implicit al platformei. max_output_tokens = plafonul de
-- tokeni pe analiză (trimis furnizorului ca max_tokens).

CREATE TABLE "ai"."system_prompts" (
  "id"                UUID         NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"   UUID,
  "application_id"    VARCHAR(64)  NOT NULL,
  "prompt_key"        VARCHAR(128) NOT NULL,
  "model_slug"        VARCHAR(64)  NOT NULL,
  "content"           TEXT         NOT NULL,
  "max_output_tokens" INTEGER      NOT NULL DEFAULT 1024,
  "enabled"           BOOLEAN      NOT NULL DEFAULT true,
  "created_at"        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"        TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "system_prompts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "system_prompts_max_output_check" CHECK ("max_output_tokens" > 0)
);

-- NULLS NOT DISTINCT (PG 15+): un singur prompt global (organization_id NULL) pe aplicație și cheie
CREATE UNIQUE INDEX "system_prompts_scope_key"
  ON "ai"."system_prompts"("organization_id", "application_id", "prompt_key") NULLS NOT DISTINCT;

ALTER TABLE "ai"."system_prompts"
  ADD CONSTRAINT "system_prompts_model_slug_fkey" FOREIGN KEY ("model_slug")
  REFERENCES "ai"."models"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai"."system_prompts" ENABLE ROW LEVEL SECURITY;

-- ai_rw: doar citire — prompturile organizației curente și cele globale
CREATE POLICY ai_rw_system_prompts_select ON "ai"."system_prompts" FOR SELECT TO ai_rw
  USING (
    organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid
    OR organization_id IS NULL
  );
CREATE POLICY ai_founder_system_prompts_select ON "ai"."system_prompts" FOR SELECT TO ai_founder
  USING (true);
CREATE POLICY ai_founder_system_prompts_insert ON "ai"."system_prompts" FOR INSERT TO ai_founder
  WITH CHECK (true);
CREATE POLICY ai_founder_system_prompts_update ON "ai"."system_prompts" FOR UPDATE TO ai_founder
  USING (true) WITH CHECK (true);

REVOKE ALL ON "ai"."system_prompts" FROM PUBLIC;
GRANT SELECT ON "ai"."system_prompts" TO ai_rw;
GRANT SELECT, INSERT, UPDATE ON "ai"."system_prompts" TO ai_founder;

-- ─── ai.usage_records ──────────────────────────────────────────────────────────
-- Un rând pe analiză reușită (append-only: fără UPDATE / DELETE pentru nimeni).

CREATE TABLE "ai"."usage_records" (
  "id"              UUID          NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID          NOT NULL,
  "application_id"  VARCHAR(64)   NOT NULL,
  "user_id"         UUID          NOT NULL,
  "model_slug"      VARCHAR(64)   NOT NULL,
  "prompt_key"      VARCHAR(128)  NOT NULL,
  "operation_id"    VARCHAR(128)  NOT NULL,
  "input_tokens"    INTEGER       NOT NULL,
  "output_tokens"   INTEGER       NOT NULL,
  "cost_ron"        DECIMAL(14,8) NOT NULL,
  "created_at"      TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "usage_records_tokens_check" CHECK ("input_tokens" >= 0 AND "output_tokens" >= 0),
  CONSTRAINT "usage_records_cost_check"   CHECK ("cost_ron" >= 0)
);

CREATE UNIQUE INDEX "usage_records_operation_id_key" ON "ai"."usage_records"("operation_id");
CREATE INDEX "usage_records_org_created_idx" ON "ai"."usage_records"("organization_id", "created_at");
CREATE INDEX "usage_records_created_idx" ON "ai"."usage_records"("created_at");

ALTER TABLE "ai"."usage_records" ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_rw_usage_records_select ON "ai"."usage_records" FOR SELECT TO ai_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY ai_rw_usage_records_insert ON "ai"."usage_records" FOR INSERT TO ai_rw
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY ai_founder_usage_records_select ON "ai"."usage_records" FOR SELECT TO ai_founder
  USING (true);

REVOKE ALL ON "ai"."usage_records" FROM PUBLIC;
GRANT SELECT, INSERT ON "ai"."usage_records" TO ai_rw;
GRANT SELECT ON "ai"."usage_records" TO ai_founder;

-- ─── ai.cost_limits ────────────────────────────────────────────────────────────
-- Plafonul global (organization_id NULL) și cel pe organizație, în lei pe lună (Europe/Bucharest).

CREATE TABLE "ai"."cost_limits" (
  "id"              UUID          NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "period"          VARCHAR(16)   NOT NULL DEFAULT 'month',
  "limit_ron"       DECIMAL(10,2) NOT NULL,
  "enabled"         BOOLEAN       NOT NULL DEFAULT true,
  "created_at"      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT "cost_limits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cost_limits_limit_check"  CHECK ("limit_ron" > 0),
  CONSTRAINT "cost_limits_period_check" CHECK ("period" IN ('month'))
);

-- NULLS NOT DISTINCT (PG 15+): un singur plafon global pe perioadă
CREATE UNIQUE INDEX "cost_limits_scope_key"
  ON "ai"."cost_limits"("organization_id", "period") NULLS NOT DISTINCT;

ALTER TABLE "ai"."cost_limits" ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_rw_cost_limits_select ON "ai"."cost_limits" FOR SELECT TO ai_rw
  USING (
    organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid
    OR organization_id IS NULL
  );
CREATE POLICY ai_founder_cost_limits_select ON "ai"."cost_limits" FOR SELECT TO ai_founder
  USING (true);
CREATE POLICY ai_founder_cost_limits_insert ON "ai"."cost_limits" FOR INSERT TO ai_founder
  WITH CHECK (true);
CREATE POLICY ai_founder_cost_limits_update ON "ai"."cost_limits" FOR UPDATE TO ai_founder
  USING (true) WITH CHECK (true);

REVOKE ALL ON "ai"."cost_limits" FROM PUBLIC;
GRANT SELECT ON "ai"."cost_limits" TO ai_rw;
GRANT SELECT, INSERT, UPDATE ON "ai"."cost_limits" TO ai_founder;

-- ─── Luna de facturare internă: Europe/Bucharest ───────────────────────────────
-- Intervalul [început, sfârșit) al lunii calendaristice la București, ca timestamptz. Sfârșitul se
-- calculează din data lunii următoare (nu început + 1 lună), ca trecerea la ora de iarnă să nu
-- mute granița cu o oră.

CREATE FUNCTION ai.month_bounds(p_year INTEGER, p_month INTEGER)
RETURNS TABLE (from_at TIMESTAMPTZ, to_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT make_date(p_year, p_month, 1)::timestamp AT TIME ZONE 'Europe/Bucharest',
         (make_date(p_year, p_month, 1) + interval '1 month')::timestamp AT TIME ZONE 'Europe/Bucharest';
$$;

REVOKE ALL ON FUNCTION ai.month_bounds(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ai.month_bounds(INTEGER, INTEGER) TO ai_rw, ai_founder;

-- ─── SECURITY DEFINER: costul total al platformei într-o lună ──────────────────
-- Plafonul global cere suma peste toate organizațiile; ai_rw vede prin RLS doar organizația lui.
-- Întoarce doar o sumă, nimic pe organizație.

CREATE FUNCTION ai.global_monthly_cost(p_year INTEGER, p_month INTEGER)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT COALESCE(SUM(u.cost_ron), 0)
    FROM ai.usage_records u, ai.month_bounds(p_year, p_month) b
   WHERE u.created_at >= b.from_at
     AND u.created_at <  b.to_at;
$$;

REVOKE ALL ON FUNCTION ai.global_monthly_cost(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ai.global_monthly_cost(INTEGER, INTEGER) TO ai_rw, ai_founder;

-- ─── Seed: modelele inițiale ───────────────────────────────────────────────────
-- Sursa prețurilor: https://developers.openai.com/api/docs/pricing (platform.openai.com/docs/pricing
-- redirecționează aici), tabelul „Standard”, citit pe 2026-11-05:
--   gpt-4o:      2.50 USD / 1M tokeni intrare, 10.00 USD / 1M tokeni ieșire
--   gpt-4o-mini: 0.15 USD / 1M tokeni intrare,  0.60 USD / 1M tokeni ieșire
-- Cursul: BNR, https://curs.bnr.ro/nbrfxrates.xml, 1 USD = 4.7518 RON (cursul din 2026-11-04,
-- ultimul publicat la 2026-11-05).
-- Lei pe token = USD / 1M × 4.7518 / 1 000 000. DE CONFIRMAT de fondatoare.

INSERT INTO "ai"."models" ("slug", "provider", "provider_model_id", "display_name",
  "max_input_tokens", "max_output_tokens",
  "cost_per_input_token_ron", "cost_per_output_token_ron")
VALUES
  ('gpt-4o-mini', 'openai', 'gpt-4o-mini', 'GPT-4o mini',
   128000, 16384, 0.000000712770, 0.000002851080),
  ('gpt-4o', 'openai', 'gpt-4o', 'GPT-4o',
   128000, 16384, 0.000011879500, 0.000047518000)
ON CONFLICT ("slug") DO NOTHING;
