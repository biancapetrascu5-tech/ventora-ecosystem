-- Lot 4.10 (FAZA-4; D-WF-1…6; D4-22 = b, D4-23, D4-24; S116-D19…D22): motorul de automatizări.
-- Schema `workflows`, rolurile `workflows_rw` (Hub și job-uri, app_runtime) și `workflows_founder`
-- (Founder, founder_runtime), ambele NOLOGIN NOINHERIT, cu RLS pe app.organization_id (D-SEC-1).
--
--   definition          → automatizarea, construită în Founder (comună tuturor afacerilor)
--   definition_version  → versiunile ei, imuabile: declanșatorul, întârzierea, condițiile, pașii,
--                         doar din lista albă (S116-D19); execuția ia versiunea curentă
--   activation          → pornirea per afacere: cine, când, motivul, referința de suport; oprirea
--                         la fel. Doar Founder pornește și oprește (D-WF-2); afacerea doar citește
--                         (D-WF-3). Pornirea ține o unitate din cota `workflows.active` (D-WF-4)
--   business_setting    → setările afacerii (săptămânile pentru reactivare, reducerea de ziua
--                         clientului), scrise din Hub de owner și admini (S116-D22)
--   execution           → o execuție: declanșatorul, rezultatul (reușită / eșuată / sărită),
--                         motivul, mesajele trimise (S116-D20: doar ele se numără)
--   execution_step      → pașii unei execuții: un pas trimis nu se mai trimite (idempotent)
--   engine_control      → oprirea centrală (un singur rând)
--
-- Pașii doar trimit mesaje sau notificări, nu schimbă date (S116-D19). Lista albă e și în cod
-- (core/workflows/src/whitelist.ts); aici o impun CHECK-urile, indiferent de cine scrie.

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'workflows_rw') THEN
    CREATE ROLE workflows_rw NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'workflows_founder') THEN
    CREATE ROLE workflows_founder NOLOGIN NOINHERIT;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT workflows_rw TO app_runtime;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    GRANT workflows_founder TO founder_runtime;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS "workflows";
GRANT USAGE ON SCHEMA "workflows" TO workflows_rw, workflows_founder;

-- Lista albă (S116-D19). Declanșatorii din Booking sunt înregistrați, dar pornesc doar când
-- Booking emite evenimentele lor; azi rulează doar commercial.quota_threshold.
CREATE OR REPLACE FUNCTION workflows.trigger_allowed(p_type TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT p_type IN (
    'booking.appointment_completed',
    'booking.no_show',
    'booking.high_risk',
    'booking.client_inactive',
    'booking.client_birthday',
    'booking.daily_digest',
    'commercial.quota_threshold'
  );
$$;

CREATE OR REPLACE FUNCTION workflows.conditions_allowed(p_conditions TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT p_conditions <@ ARRAY[
    'recipient_has_email',
    'recipient_accepts_messages',
    'not_sent_in_30_days'
  ]::TEXT[];
$$;

-- Pașii: [{ "kind": …, "template": … }], 1–10, doar tipurile de mesaj din lista albă.
CREATE OR REPLACE FUNCTION workflows.steps_allowed(p_steps JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  -- CASE: SQL nu garantează ordinea din AND / OR, iar funcțiile pe obiect cer un obiect
  SELECT CASE WHEN jsonb_typeof(p_steps) <> 'array' THEN false
              WHEN jsonb_array_length(p_steps) NOT BETWEEN 1 AND 10 THEN false
              ELSE NOT EXISTS (
                SELECT 1 FROM jsonb_array_elements(p_steps) s
                 WHERE CASE WHEN jsonb_typeof(s) <> 'object' THEN true
                            WHEN (SELECT count(*) FROM jsonb_object_keys(s)) <> 2 THEN true
                            WHEN jsonb_typeof(s->'kind') <> 'string'
                              OR jsonb_typeof(s->'template') <> 'string' THEN true
                            ELSE s->>'kind' NOT IN ('email.client', 'email.member',
                                                    'email.owner', 'notification.hub')
                              OR (s->>'template') !~ '^[a-z][a-z0-9_]{0,63}$'
                       END
              )
         END;
$$;

-- Setările afacerii (S116-D22): doar cheile cunoscute, în limitele lor.
CREATE OR REPLACE FUNCTION workflows.settings_allowed(p_settings JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  -- reactivationWeeks: 1–52 (întreg); birthdayDiscountPercent: null („Fără reducere”) sau 1–50
  SELECT CASE WHEN jsonb_typeof(p_settings) <> 'object' THEN false
              ELSE NOT EXISTS (
                SELECT 1 FROM jsonb_each(p_settings) e
                 WHERE CASE
                         WHEN e.key = 'birthdayDiscountPercent' AND jsonb_typeof(e.value) = 'null'
                           THEN false
                         WHEN e.key NOT IN ('reactivationWeeks', 'birthdayDiscountPercent')
                           OR jsonb_typeof(e.value) <> 'number' THEN true
                         WHEN (e.value)::numeric <> trunc((e.value)::numeric) THEN true
                         WHEN e.key = 'reactivationWeeks'
                           THEN (e.value)::numeric NOT BETWEEN 1 AND 52
                         ELSE (e.value)::numeric NOT BETWEEN 1 AND 50
                       END
              )
         END;
$$;

-- CreateTable
CREATE TABLE "workflows"."definition" (
  "id"                    UUID         NOT NULL,
  "code"                  VARCHAR(64)  NOT NULL,
  "name"                  VARCHAR(200) NOT NULL,
  "current_version"       INTEGER      NOT NULL DEFAULT 1,
  "created_by_founder_id" UUID         NOT NULL,
  "created_at"            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "definition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "definition_code_check" CHECK ("code" ~ '^[a-z][a-z0-9-]{0,63}$'),
  CONSTRAINT "definition_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 200),
  CONSTRAINT "definition_current_version_check" CHECK ("current_version" >= 1)
);

CREATE UNIQUE INDEX "definition_code_key" ON "workflows"."definition" ("code");

-- CreateTable
CREATE TABLE "workflows"."definition_version" (
  "definition_id"         UUID         NOT NULL,
  "version"               INTEGER      NOT NULL,
  "trigger_type"          VARCHAR(64)  NOT NULL,
  -- commercial.quota_threshold: { "thresholds": [80] }; programele: { "at": "07:00" }
  "trigger_params"        JSONB        NOT NULL DEFAULT '{}',
  -- „Când”: imediat, după 2 ore, după o zi
  "delay_minutes"         INTEGER      NOT NULL DEFAULT 0,
  "conditions"            TEXT[]       NOT NULL DEFAULT '{}',
  "steps"                 JSONB        NOT NULL,
  "created_by_founder_id" UUID         NOT NULL,
  "created_at"            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "definition_version_pkey" PRIMARY KEY ("definition_id", "version"),
  CONSTRAINT "definition_version_definition_id_fkey" FOREIGN KEY ("definition_id")
    REFERENCES "workflows"."definition" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "definition_version_version_check" CHECK ("version" >= 1),
  CONSTRAINT "definition_version_trigger_check" CHECK (workflows.trigger_allowed("trigger_type")),
  CONSTRAINT "definition_version_trigger_params_check"
    CHECK (jsonb_typeof("trigger_params") = 'object'),
  CONSTRAINT "definition_version_delay_check" CHECK ("delay_minutes" IN (0, 120, 1440)),
  CONSTRAINT "definition_version_conditions_check"
    CHECK (workflows.conditions_allowed("conditions")),
  CONSTRAINT "definition_version_steps_check" CHECK (workflows.steps_allowed("steps"))
);

-- Activarea per afacere: un rând per perioadă pornită; oprirea închide rândul (istoricul rămâne).
CREATE TABLE "workflows"."activation" (
  "id"                      UUID         NOT NULL,
  "organization_id"         UUID         NOT NULL,
  "definition_id"           UUID         NOT NULL,
  "status"                  VARCHAR(16)  NOT NULL DEFAULT 'active',
  -- D-WF-4: rezervarea din workflows.active (operationId-ul cotei), eliberată la oprire
  "quota_operation_id"      VARCHAR(128) NOT NULL,
  "quota_freed_at"          TIMESTAMPTZ,
  "activated_at"            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "activated_by_founder_id" UUID         NOT NULL,
  "activation_reason"       TEXT         NOT NULL,
  "activation_support_ref"  VARCHAR(64),
  "stopped_at"              TIMESTAMPTZ,
  "stopped_by_founder_id"   UUID,
  "stop_reason"             TEXT,
  "stop_support_ref"        VARCHAR(64),
  CONSTRAINT "activation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "activation_definition_id_fkey" FOREIGN KEY ("definition_id")
    REFERENCES "workflows"."definition" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "activation_status_check" CHECK ("status" IN ('active', 'stopped')),
  CONSTRAINT "activation_reason_check"
    CHECK (char_length(btrim("activation_reason")) BETWEEN 1 AND 2000),
  CONSTRAINT "activation_support_ref_check"
    CHECK ("activation_support_ref" IS NULL OR char_length(btrim("activation_support_ref")) BETWEEN 1 AND 64),
  CONSTRAINT "activation_stop_check" CHECK (
    ("status" = 'stopped') = ("stopped_at" IS NOT NULL)
    AND ("stopped_at" IS NULL) = ("stopped_by_founder_id" IS NULL)
    AND ("stopped_at" IS NULL) = ("stop_reason" IS NULL)
    AND ("stopped_at" IS NOT NULL OR "stop_support_ref" IS NULL)
  ),
  CONSTRAINT "activation_stop_reason_check"
    CHECK ("stop_reason" IS NULL OR char_length(btrim("stop_reason")) BETWEEN 1 AND 2000),
  CONSTRAINT "activation_stop_support_ref_check"
    CHECK ("stop_support_ref" IS NULL OR char_length(btrim("stop_support_ref")) BETWEEN 1 AND 64),
  CONSTRAINT "activation_quota_freed_check"
    CHECK ("quota_freed_at" IS NULL OR "status" = 'stopped')
);

CREATE UNIQUE INDEX "activation_quota_operation_id_key"
  ON "workflows"."activation" ("quota_operation_id");
-- o automatizare e pornită cel mult o dată pe afacere
CREATE UNIQUE INDEX "activation_one_active_idx"
  ON "workflows"."activation" ("organization_id", "definition_id")
  WHERE "status" = 'active';
CREATE INDEX "activation_definition_id_idx" ON "workflows"."activation" ("definition_id", "status");
-- job-ul care reîncearcă eliberarea cotei după o oprire
CREATE INDEX "activation_quota_unfreed_idx" ON "workflows"."activation" ("stopped_at")
  WHERE "status" = 'stopped' AND "quota_freed_at" IS NULL;

-- CreateTable
CREATE TABLE "workflows"."business_setting" (
  "organization_id"    UUID         NOT NULL,
  "definition_id"      UUID         NOT NULL,
  "settings"           JSONB        NOT NULL DEFAULT '{}',
  "updated_by_user_id" UUID         NOT NULL,
  "updated_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "business_setting_pkey" PRIMARY KEY ("organization_id", "definition_id"),
  CONSTRAINT "business_setting_definition_id_fkey" FOREIGN KEY ("definition_id")
    REFERENCES "workflows"."definition" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "business_setting_settings_check" CHECK (workflows.settings_allowed("settings"))
);

-- CreateTable
CREATE TABLE "workflows"."execution" (
  "id"                 UUID         NOT NULL,
  "organization_id"    UUID         NOT NULL,
  "activation_id"      UUID         NOT NULL,
  "definition_id"      UUID         NOT NULL,
  -- versiunea cu care a rulat (S116: afacerile primesc versiunea nouă de la următoarea execuție)
  "definition_version" INTEGER,
  -- event:<eventId> sau schedule:<zi>[:<destinatar>] — o execuție per declanșator
  "run_key"            VARCHAR(255) NOT NULL,
  "trigger_type"       VARCHAR(64)  NOT NULL,
  "trigger_event_id"   UUID,
  -- doar id-uri și cifre, din plicul evenimentului (fără date personale)
  "trigger_payload"    JSONB        NOT NULL DEFAULT '{}',
  -- „Pentru”: cine primește (owner, membru, client), ca tip + id; numele se citește la afișare
  "subject_type"       VARCHAR(32),
  "subject_id"         VARCHAR(255),
  "status"             VARCHAR(16)  NOT NULL DEFAULT 'pending',
  "reason_code"        VARCHAR(64),
  "messages_sent"      INTEGER      NOT NULL DEFAULT 0,
  "attempts"           INTEGER      NOT NULL DEFAULT 0,
  "available_at"       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "started_at"         TIMESTAMPTZ,
  "finished_at"        TIMESTAMPTZ,
  "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "execution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "execution_activation_id_fkey" FOREIGN KEY ("activation_id")
    REFERENCES "workflows"."activation" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "execution_definition_id_fkey" FOREIGN KEY ("definition_id")
    REFERENCES "workflows"."definition" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "execution_trigger_check" CHECK (workflows.trigger_allowed("trigger_type")),
  CONSTRAINT "execution_trigger_payload_check" CHECK (jsonb_typeof("trigger_payload") = 'object'),
  CONSTRAINT "execution_status_check"
    CHECK ("status" IN ('pending', 'succeeded', 'failed', 'skipped')),
  CONSTRAINT "execution_finished_check" CHECK (("status" = 'pending') = ("finished_at" IS NULL)),
  CONSTRAINT "execution_reason_check" CHECK (
    ("status" IN ('failed', 'skipped')) <= ("reason_code" IS NOT NULL)
  ),
  CONSTRAINT "execution_reason_code_check"
    CHECK ("reason_code" IS NULL OR "reason_code" ~ '^[a-z][a-z0-9_.]{0,63}$'),
  CONSTRAINT "execution_messages_sent_check" CHECK ("messages_sent" >= 0),
  CONSTRAINT "execution_attempts_check" CHECK ("attempts" >= 0)
);

CREATE UNIQUE INDEX "execution_activation_id_run_key_key"
  ON "workflows"."execution" ("activation_id", "run_key");
-- job-ul execuțiilor
CREATE INDEX "execution_pending_idx" ON "workflows"."execution" ("available_at")
  WHERE "status" = 'pending';
-- jurnalul (Founder, Hub): cele mai noi întâi; UsageMeter-ul lunii
CREATE INDEX "execution_organization_id_created_at_idx"
  ON "workflows"."execution" ("organization_id", "created_at");
CREATE INDEX "execution_definition_id_created_at_idx"
  ON "workflows"."execution" ("definition_id", "created_at");

-- CreateTable
CREATE TABLE "workflows"."execution_step" (
  "execution_id"    UUID         NOT NULL,
  "step_index"      INTEGER      NOT NULL,
  "organization_id" UUID         NOT NULL,
  "kind"            VARCHAR(32)  NOT NULL,
  "template"        VARCHAR(64)  NOT NULL,
  "status"          VARCHAR(16)  NOT NULL,
  "messages_sent"   INTEGER      NOT NULL DEFAULT 0,
  "reason_code"     VARCHAR(64),
  "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "execution_step_pkey" PRIMARY KEY ("execution_id", "step_index"),
  CONSTRAINT "execution_step_execution_id_fkey" FOREIGN KEY ("execution_id")
    REFERENCES "workflows"."execution" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "execution_step_index_check" CHECK ("step_index" BETWEEN 0 AND 9),
  CONSTRAINT "execution_step_kind_check"
    CHECK ("kind" IN ('email.client', 'email.member', 'email.owner', 'notification.hub')),
  CONSTRAINT "execution_step_status_check" CHECK ("status" IN ('sent', 'failed', 'skipped')),
  CONSTRAINT "execution_step_reason_check"
    CHECK (("status" IN ('failed', 'skipped')) <= ("reason_code" IS NOT NULL)),
  CONSTRAINT "execution_step_reason_code_check"
    CHECK ("reason_code" IS NULL OR "reason_code" ~ '^[a-z][a-z0-9_.]{0,63}$'),
  CONSTRAINT "execution_step_messages_sent_check" CHECK ("messages_sent" >= 0)
);

-- Oprirea centrală: un singur rând; oprit → nicio execuție nu trimite (se marchează sărite).
CREATE TABLE "workflows"."engine_control" (
  "id"                    SMALLINT     NOT NULL DEFAULT 1,
  "paused"                BOOLEAN      NOT NULL DEFAULT false,
  "reason"                TEXT,
  "changed_by_founder_id" UUID,
  "changed_at"            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "engine_control_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "engine_control_single_check" CHECK ("id" = 1),
  CONSTRAINT "engine_control_reason_check" CHECK (
    NOT "paused" OR ("reason" IS NOT NULL AND char_length(btrim("reason")) BETWEEN 1 AND 2000)
  )
);

INSERT INTO "workflows"."engine_control" ("id", "paused") VALUES (1, false);

-- Pe server, indiferent de cine scrie: versiunile nu se schimbă; o activare se poate doar opri
-- (cu motivul ei), restul câmpurilor rămân; o execuție merge doar înainte, iar una eșuată se
-- poate relua („Rulează din nou”); un rând-copil stă în organizația părintelui.
CREATE OR REPLACE FUNCTION workflows.definition_version_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'definition_version %/%: a version cannot change; save a new one',
    OLD.definition_id, OLD.version USING ERRCODE = 'P0001';
END $$;

CREATE TRIGGER definition_version_immutable
  BEFORE UPDATE OR DELETE ON "workflows"."definition_version"
  FOR EACH ROW EXECUTE FUNCTION workflows.definition_version_immutable();

CREATE OR REPLACE FUNCTION workflows.activation_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'active';
    NEW.activated_at := now();
    NEW.stopped_at := NULL;
    NEW.stopped_by_founder_id := NULL;
    NEW.stop_reason := NULL;
    NEW.stop_support_ref := NULL;
    NEW.quota_freed_at := NULL;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.organization_id, NEW.definition_id, NEW.quota_operation_id, NEW.activated_at,
      NEW.activated_by_founder_id, NEW.activation_reason, NEW.activation_support_ref)
     IS DISTINCT FROM
     (OLD.id, OLD.organization_id, OLD.definition_id, OLD.quota_operation_id, OLD.activated_at,
      OLD.activated_by_founder_id, OLD.activation_reason, OLD.activation_support_ref) THEN
    RAISE EXCEPTION 'activation %: only stopping it may change it', OLD.id USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status = 'stopped' AND (NEW.status, NEW.stopped_at, NEW.stopped_by_founder_id,
      NEW.stop_reason, NEW.stop_support_ref) IS DISTINCT FROM (OLD.status, OLD.stopped_at,
      OLD.stopped_by_founder_id, OLD.stop_reason, OLD.stop_support_ref) THEN
    RAISE EXCEPTION 'activation %: already stopped; start it again as a new activation', OLD.id
      USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status = 'active' AND NEW.status = 'stopped' THEN
    NEW.stopped_at := now();
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER activation_guard
  BEFORE INSERT OR UPDATE ON "workflows"."activation"
  FOR EACH ROW EXECUTE FUNCTION workflows.activation_guard();

CREATE OR REPLACE FUNCTION workflows.execution_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_org UUID;
  v_definition UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT a.organization_id, a.definition_id INTO v_org, v_definition
      FROM workflows.activation a WHERE a.id = NEW.activation_id;
    IF v_org IS NULL OR v_org <> NEW.organization_id OR v_definition <> NEW.definition_id THEN
      RAISE EXCEPTION 'execution: organization or automation differs from the activation''s'
        USING ERRCODE = '23514';
    END IF;
    NEW.created_at := now();
    -- sărită de la început (motorul oprit, automatizarea oprită între timp)
    NEW.finished_at := CASE WHEN NEW.status = 'pending' THEN NULL ELSE now() END;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.organization_id, NEW.activation_id, NEW.definition_id, NEW.run_key,
      NEW.trigger_type, NEW.trigger_event_id, NEW.trigger_payload, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.organization_id, OLD.activation_id, OLD.definition_id, OLD.run_key,
      OLD.trigger_type, OLD.trigger_event_id, OLD.trigger_payload, OLD.created_at) THEN
    RAISE EXCEPTION 'execution %: the trigger of a run does not change', OLD.id
      USING ERRCODE = 'P0001';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'pending' AND NEW.status IN ('succeeded', 'failed', 'skipped'))
    OR (OLD.status = 'failed'  AND NEW.status = 'pending')
  ) THEN
    RAISE EXCEPTION 'execution %: % → % is not allowed', OLD.id, OLD.status, NEW.status
      USING ERRCODE = 'P0001';
  END IF;
  IF NEW.messages_sent < OLD.messages_sent THEN
    RAISE EXCEPTION 'execution %: messages sent are never taken back', OLD.id
      USING ERRCODE = 'P0001';
  END IF;
  IF NEW.status = 'pending' THEN
    NEW.finished_at := NULL;
    NEW.reason_code := NULL;
  ELSIF OLD.status = 'pending' THEN
    NEW.finished_at := now();
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER execution_guard
  BEFORE INSERT OR UPDATE ON "workflows"."execution"
  FOR EACH ROW EXECUTE FUNCTION workflows.execution_guard();

CREATE OR REPLACE FUNCTION workflows.execution_step_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_org UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT e.organization_id INTO v_org FROM workflows.execution e WHERE e.id = NEW.execution_id;
    IF v_org IS NULL OR v_org <> NEW.organization_id THEN
      RAISE EXCEPTION 'execution_step: organization_id differs from the execution''s'
        USING ERRCODE = '23514';
    END IF;
    NEW.created_at := now();
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  IF (NEW.execution_id, NEW.step_index, NEW.organization_id, NEW.kind, NEW.template, NEW.created_at)
     IS DISTINCT FROM
     (OLD.execution_id, OLD.step_index, OLD.organization_id, OLD.kind, OLD.template, OLD.created_at) THEN
    RAISE EXCEPTION 'execution_step %/%: only the result may change', OLD.execution_id, OLD.step_index
      USING ERRCODE = 'P0001';
  END IF;
  -- idempotent: un pas trimis rămâne trimis (nu se trimite a doua oară)
  IF OLD.status = 'sent' THEN
    RAISE EXCEPTION 'execution_step %/%: already sent', OLD.execution_id, OLD.step_index
      USING ERRCODE = 'P0001';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER execution_step_guard
  BEFORE INSERT OR UPDATE ON "workflows"."execution_step"
  FOR EACH ROW EXECUTE FUNCTION workflows.execution_step_guard();

CREATE OR REPLACE FUNCTION workflows.engine_control_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW.id := 1;
  NEW.changed_at := now();
  IF NOT NEW.paused THEN
    NEW.reason := NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER engine_control_guard
  BEFORE UPDATE ON "workflows"."engine_control"
  FOR EACH ROW EXECUTE FUNCTION workflows.engine_control_guard();

-- RLS: T1 / T2. Catalogul (definițiile, versiunile, oprirea centrală) e comun; restul doar în
-- contextul organizației (app.organization_id), eșec sigur (0 rânduri).
ALTER TABLE "workflows"."definition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workflows"."definition_version" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workflows"."engine_control" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workflows"."activation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workflows"."business_setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workflows"."execution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workflows"."execution_step" ENABLE ROW LEVEL SECURITY;

CREATE POLICY workflows_rw_definition ON "workflows"."definition"
  FOR SELECT TO workflows_rw USING (true);
CREATE POLICY workflows_founder_definition ON "workflows"."definition"
  TO workflows_founder USING (true) WITH CHECK (true);
CREATE POLICY workflows_rw_definition_version ON "workflows"."definition_version"
  FOR SELECT TO workflows_rw USING (true);
CREATE POLICY workflows_founder_definition_version ON "workflows"."definition_version"
  TO workflows_founder USING (true) WITH CHECK (true);
CREATE POLICY workflows_rw_engine_control ON "workflows"."engine_control"
  FOR SELECT TO workflows_rw USING (true);
CREATE POLICY workflows_founder_engine_control ON "workflows"."engine_control"
  TO workflows_founder USING (true) WITH CHECK (true);

CREATE POLICY workflows_rw_activation ON "workflows"."activation"
  TO workflows_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY workflows_founder_activation ON "workflows"."activation"
  TO workflows_founder
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY workflows_rw_business_setting ON "workflows"."business_setting"
  TO workflows_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY workflows_founder_business_setting ON "workflows"."business_setting"
  TO workflows_founder
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY workflows_rw_execution ON "workflows"."execution"
  TO workflows_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY workflows_founder_execution ON "workflows"."execution"
  TO workflows_founder
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY workflows_rw_execution_step ON "workflows"."execution_step"
  TO workflows_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY workflows_founder_execution_step ON "workflows"."execution_step"
  TO workflows_founder
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Grants: nimeni nu șterge.
--   workflows_rw (Hub, job-uri): citește catalogul și activările afacerii — NU pornește și NU
--     oprește (D-WF-3: refuz în baza de date, nu doar în ecran); scrie setările afacerii
--     (S116-D22), execuțiile și pașii lor; marchează cota eliberată după o oprire.
--   workflows_founder (Founder): construiește (definiții, versiuni noi), pornește și oprește,
--     reia o execuție eșuată, oprește motorul central; citește setările afacerii.
REVOKE ALL ON "workflows"."definition", "workflows"."definition_version",
  "workflows"."engine_control", "workflows"."activation", "workflows"."business_setting",
  "workflows"."execution", "workflows"."execution_step" FROM PUBLIC;

GRANT SELECT ON "workflows"."definition", "workflows"."definition_version",
  "workflows"."engine_control", "workflows"."activation" TO workflows_rw;
GRANT UPDATE ("quota_freed_at") ON "workflows"."activation" TO workflows_rw;
GRANT SELECT, INSERT ON "workflows"."business_setting" TO workflows_rw;
GRANT UPDATE ("settings", "updated_by_user_id", "updated_at") ON "workflows"."business_setting"
  TO workflows_rw;
GRANT SELECT, INSERT ON "workflows"."execution" TO workflows_rw;
GRANT UPDATE ("definition_version", "subject_type", "subject_id", "status", "reason_code",
  "messages_sent", "attempts", "available_at", "started_at", "finished_at")
  ON "workflows"."execution" TO workflows_rw;
GRANT SELECT, INSERT ON "workflows"."execution_step" TO workflows_rw;
GRANT UPDATE ("status", "messages_sent", "reason_code", "updated_at")
  ON "workflows"."execution_step" TO workflows_rw;

GRANT SELECT, INSERT ON "workflows"."definition", "workflows"."definition_version"
  TO workflows_founder;
GRANT UPDATE ("name", "current_version", "updated_at") ON "workflows"."definition"
  TO workflows_founder;
GRANT SELECT ON "workflows"."engine_control" TO workflows_founder;
GRANT UPDATE ("paused", "reason", "changed_by_founder_id") ON "workflows"."engine_control"
  TO workflows_founder;
GRANT SELECT, INSERT ON "workflows"."activation" TO workflows_founder;
GRANT UPDATE ("status", "stopped_by_founder_id", "stop_reason", "stop_support_ref",
  "quota_freed_at") ON "workflows"."activation" TO workflows_founder;
GRANT SELECT ON "workflows"."business_setting", "workflows"."execution_step" TO workflows_founder;
GRANT SELECT ON "workflows"."execution" TO workflows_founder;
-- „Rulează din nou”: doar starea și momentul (tranziția failed → pending o impune triggerul)
GRANT UPDATE ("status", "available_at") ON "workflows"."execution" TO workflows_founder;

-- Job-urile, pe app_runtime ca workflows_rw, în toate organizațiile, doar id-ul și organizația;
-- fiecare rând se ia apoi în contextul organizației lui, sub RLS.
CREATE OR REPLACE FUNCTION workflows.pending_executions(p_limit INTEGER)
RETURNS TABLE (id UUID, organization_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT e.id, e.organization_id
    FROM workflows.execution e
   WHERE e.status = 'pending'
     AND e.available_at <= now()
   ORDER BY e.available_at, e.id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 100);
$$;

-- D-WF-4: opririle a căror unitate din workflows.active nu s-a eliberat încă (o eroare între
-- oprire și eliberare); job-ul o eliberează, idempotent.
CREATE OR REPLACE FUNCTION workflows.unfreed_stopped_activations(p_limit INTEGER)
RETURNS TABLE (id UUID, organization_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT a.id, a.organization_id
    FROM workflows.activation a
   WHERE a.status = 'stopped' AND a.quota_freed_at IS NULL
   ORDER BY a.stopped_at, a.id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 100);
$$;

-- Founder, peste afaceri (RLS-ul lui workflows_founder vede o singură afacere pe tranzacție):
--   founder_definition_stats → lista „Automatizări”: pornită la câte afaceri, execuții și eșuate
--                              în ultimele 30 de zile
--   founder_list_activations → „Pornită la afaceri”: ultima activare a fiecărei afaceri, cu
--                              setarea afacerii
--   founder_list_executions  → „Jurnalul execuțiilor”, cu filtrele lui
CREATE OR REPLACE FUNCTION workflows.founder_definition_stats()
RETURNS TABLE (definition_id UUID, active_count BIGINT, runs_30d BIGINT, failed_30d BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT d.id,
         (SELECT count(*) FROM workflows.activation a
           WHERE a.definition_id = d.id AND a.status = 'active'),
         (SELECT count(*) FROM workflows.execution e
           WHERE e.definition_id = d.id AND e.created_at > now() - INTERVAL '30 days'),
         (SELECT count(*) FROM workflows.execution e
           WHERE e.definition_id = d.id AND e.status = 'failed'
             AND e.created_at > now() - INTERVAL '30 days')
    FROM workflows.definition d;
$$;

CREATE OR REPLACE FUNCTION workflows.founder_list_activations(p_definition_id UUID)
RETURNS TABLE (
  id                      UUID,
  organization_id         UUID,
  status                  VARCHAR(16),
  activated_at            TIMESTAMPTZ,
  activated_by_founder_id UUID,
  activation_reason       TEXT,
  activation_support_ref  VARCHAR(64),
  stopped_at              TIMESTAMPTZ,
  stopped_by_founder_id   UUID,
  stop_reason             TEXT,
  settings                JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT DISTINCT ON (a.organization_id)
         a.id, a.organization_id, a.status, a.activated_at, a.activated_by_founder_id,
         a.activation_reason, a.activation_support_ref, a.stopped_at, a.stopped_by_founder_id,
         a.stop_reason, s.settings
    FROM workflows.activation a
    LEFT JOIN workflows.business_setting s
      ON s.organization_id = a.organization_id AND s.definition_id = a.definition_id
   WHERE a.definition_id = p_definition_id
   ORDER BY a.organization_id, a.activated_at DESC, a.id;
$$;

CREATE OR REPLACE FUNCTION workflows.founder_list_executions(
  p_status          TEXT,
  p_definition_id   UUID,
  p_organization_id UUID,
  p_limit           INTEGER
)
RETURNS TABLE (
  id                 UUID,
  organization_id    UUID,
  definition_id      UUID,
  definition_version INTEGER,
  trigger_type       VARCHAR(64),
  subject_type       VARCHAR(32),
  subject_id         VARCHAR(255),
  status             VARCHAR(16),
  reason_code        VARCHAR(64),
  messages_sent      INTEGER,
  attempts           INTEGER,
  created_at         TIMESTAMPTZ,
  finished_at        TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT e.id, e.organization_id, e.definition_id, e.definition_version, e.trigger_type,
         e.subject_type, e.subject_id, e.status, e.reason_code, e.messages_sent, e.attempts,
         e.created_at, e.finished_at
    FROM workflows.execution e
   WHERE (p_status IS NULL OR e.status = p_status)
     AND (p_definition_id IS NULL OR e.definition_id = p_definition_id)
     AND (p_organization_id IS NULL OR e.organization_id = p_organization_id)
   ORDER BY e.created_at DESC, e.id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500);
$$;

REVOKE ALL ON FUNCTION workflows.trigger_allowed(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION workflows.conditions_allowed(TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION workflows.steps_allowed(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION workflows.settings_allowed(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION workflows.pending_executions(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION workflows.unfreed_stopped_activations(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION workflows.founder_definition_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION workflows.founder_list_activations(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION workflows.founder_list_executions(TEXT, UUID, UUID, INTEGER) FROM PUBLIC;
-- CHECK-urile apelează funcțiile listei albe cu drepturile celui care scrie
GRANT EXECUTE ON FUNCTION workflows.trigger_allowed(TEXT), workflows.conditions_allowed(TEXT[]),
  workflows.steps_allowed(JSONB), workflows.settings_allowed(JSONB)
  TO workflows_rw, workflows_founder;
GRANT EXECUTE ON FUNCTION workflows.pending_executions(INTEGER),
  workflows.unfreed_stopped_activations(INTEGER) TO workflows_rw;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA "workflows" TO founder_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION workflows.founder_definition_stats() TO founder_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION workflows.founder_list_activations(UUID) TO founder_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION workflows.founder_list_executions(TEXT, UUID, UUID, INTEGER) TO founder_runtime';
  END IF;
END $$;
