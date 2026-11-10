-- Lot 5.5 (FAZA-5; D-GRW-1…16; D5-2, D5-8, D5-10): Growth Engine v1, schema `growth`.
-- Rolurile `growth_rw` (Hub și job-uri, app_runtime) și `growth_founder` (Founder, founder_runtime),
-- ambele NOLOGIN NOINHERIT (D-DB-1 C), cu RLS pe app.organization_id (D-SEC-1).
--
-- Catalogul echipei Ventora (comun, scris doar din Founder):
--   placement      → registrul sloturilor (manifestele aplicațiilor + sloturile Hub), sincronizat la
--                    deploy cu DIRECT_URL (scripts/sync-growth-registry.ts); oprirea pe slot
--   offer          → oferta: tipul și obiectul din core/commercial spre care trimite (fără prețuri)
--   offer_text     → textele ofertei pe limbă, cu aprobarea lor (P20: fără text aprobat, nu apare)
--   audience       → audiențele salvate: doar regula (lista albă), fără liste de afaceri (P23)
--   campaign       → oferta + regula + perioada / semnalul + prioritatea + plafonul pe campanie
--   campaign_slot  → sloturile unei campanii
--   control        → oprirea globală și plafoanele globale (un singur rând)
--
-- Pe organizație (RLS):
--   impression     → ce s-a afișat, unde, cui, în ce limbă, proactiv sau cerut
--   interaction    → click, „Nu mă interesează”, „Amintește-mi”, „Recomandă”, „Anulează”
--   suppression    → oferta ascunsă unei persoane până la un termen (respingere, amânare, tooltip)
--   signal_hit     → semnalele growthSafe primite (campaniile automate, Lot 5.7)
--   conversion     → o conversie atribuită unui click din ultimele 7 zile (P24, D5-12)
--
-- Regulile de mai jos (CHECK-uri și triggere) țin indiferent de cine scrie. Tot ce cere date din
-- alte scheme (produsele deținute, audiența minimă de 5, rolul persoanei) se verifică în
-- core/growth, prin contracte (Lotul 5.6).
--
-- Producție: Growth pornește oprit global (control.paused), până la răspunsul juridic
-- (FAZA-5 §8, criteriul 9). Pornirea e o acțiune Founder, auditată.

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'growth_rw') THEN
    CREATE ROLE growth_rw NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'growth_founder') THEN
    CREATE ROLE growth_founder NOLOGIN NOINHERIT;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT growth_rw TO app_runtime;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    GRANT growth_founder TO founder_runtime;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS "growth";
GRANT USAGE ON SCHEMA "growth" TO growth_rw, growth_founder;

-- Lista albă a criteriilor (GROWTH §2.4, @ventora/contracts GROWTH_CRITERIA). Validarea completă
-- (operatori, valori) e în validateEligibilityRule; aici, ca plasă de siguranță: forma și criteriile.
CREATE OR REPLACE FUNCTION growth.rule_allowed(p_rule JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  -- CASE: SQL nu garantează ordinea din AND / OR, iar funcțiile pe obiect cer un obiect
  SELECT CASE WHEN jsonb_typeof(p_rule) <> 'object' THEN false
              WHEN (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_rule) k)
                   <> ARRAY['match', 'rules'] THEN false
              WHEN jsonb_typeof(p_rule->'match') <> 'string'
                OR p_rule->>'match' NOT IN ('all', 'any') THEN false
              WHEN jsonb_typeof(p_rule->'rules') <> 'array' THEN false
              WHEN jsonb_array_length(p_rule->'rules') NOT BETWEEN 1 AND 20 THEN false
              ELSE NOT EXISTS (
                SELECT 1 FROM jsonb_array_elements(p_rule->'rules') r
                 WHERE CASE WHEN jsonb_typeof(r) <> 'object' THEN true
                            WHEN jsonb_typeof(r->'criterion') <> 'string' THEN true
                            ELSE r->>'criterion' NOT IN (
                              'organization.applications', 'organization.plan',
                              'organization.addons', 'organization.quota_usage',
                              'organization.age_days', 'organization.country',
                              'organization.members', 'user.role', 'user.locale',
                              'signal.received')
                       END
              )
         END;
$$;

-- CreateTable
CREATE TABLE "growth"."placement" (
  "id"                    VARCHAR(128) NOT NULL,
  "application_id"        VARCHAR(64)  NOT NULL,
  "kind"                  VARCHAR(16)  NOT NULL,
  "user_initiated"        BOOLEAN      NOT NULL DEFAULT false,
  "critical"              BOOLEAN      NOT NULL DEFAULT false,
  "retired_at"            TIMESTAMPTZ,
  "stopped"               BOOLEAN      NOT NULL DEFAULT false,
  "stop_reason"           TEXT,
  "stopped_by_founder_id" UUID,
  "stopped_at"            TIMESTAMPTZ,
  "synced_at"             TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "placement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "placement_id_check" CHECK ("id" ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$'),
  CONSTRAINT "placement_application_check" CHECK (
    "application_id" ~ '^[a-z][a-z0-9_]{0,63}$' AND "id" LIKE "application_id" || '.%'
  ),
  CONSTRAINT "placement_kind_check" CHECK ("kind" IN ('card', 'upgrade', 'banner', 'tooltip')),
  -- GROWTH §2.2: niciun slot în fluxurile critice
  CONSTRAINT "placement_critical_check" CHECK (NOT "critical"),
  CONSTRAINT "placement_stop_check" CHECK (
    ("stopped" = ("stopped_at" IS NOT NULL))
    AND ("stopped" = ("stopped_by_founder_id" IS NOT NULL))
    AND (NOT "stopped" OR ("stop_reason" IS NOT NULL
                           AND char_length(btrim("stop_reason")) BETWEEN 1 AND 2000))
    AND ("stopped" OR "stop_reason" IS NULL)
  )
);

-- CreateTable
CREATE TABLE "growth"."offer" (
  "id"                    UUID         NOT NULL,
  "code"                  VARCHAR(64)  NOT NULL,
  "type"                  VARCHAR(32)  NOT NULL,
  -- Obiectul din core/commercial (fără chei străine între scheme, ARCHITECTURE §6.4: se validează
  -- prin contract la salvare). Exact câmpurile tipului, restul NULL.
  "application_id"        VARCHAR(64),
  "plan_version_id"       UUID,
  "addon_code"            VARCHAR(64),
  "feature_key"           VARCHAR(128),
  "trial_days"            INTEGER,
  "status"                VARCHAR(16)  NOT NULL DEFAULT 'draft',
  "created_by_founder_id" UUID         NOT NULL,
  "created_at"            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "offer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "offer_code_check" CHECK ("code" ~ '^[a-z][a-z0-9-]{0,63}$'),
  CONSTRAINT "offer_type_check"
    CHECK ("type" IN ('app_activation', 'plan_upgrade', 'addon', 'trial', 'bundle')),
  CONSTRAINT "offer_status_check" CHECK ("status" IN ('draft', 'published', 'archived')),
  CONSTRAINT "offer_target_check" CHECK (CASE "type"
    WHEN 'app_activation' THEN "application_id" IS NOT NULL AND "plan_version_id" IS NULL
      AND "addon_code" IS NULL AND "feature_key" IS NULL AND "trial_days" IS NULL
    WHEN 'plan_upgrade' THEN "plan_version_id" IS NOT NULL AND "application_id" IS NULL
      AND "addon_code" IS NULL AND "feature_key" IS NULL AND "trial_days" IS NULL
    WHEN 'bundle' THEN "plan_version_id" IS NOT NULL AND "application_id" IS NULL
      AND "addon_code" IS NULL AND "feature_key" IS NULL AND "trial_days" IS NULL
    WHEN 'addon' THEN "addon_code" IS NOT NULL AND "application_id" IS NULL
      AND "plan_version_id" IS NULL AND "feature_key" IS NULL AND "trial_days" IS NULL
    WHEN 'trial' THEN "trial_days" BETWEEN 1 AND 90 AND "plan_version_id" IS NULL
      AND "addon_code" IS NULL AND (("application_id" IS NULL) <> ("feature_key" IS NULL))
    ELSE false END)
);

CREATE UNIQUE INDEX "offer_code_key" ON "growth"."offer" ("code");

-- CreateTable
CREATE TABLE "growth"."offer_text" (
  "offer_id"               UUID         NOT NULL,
  "locale"                 VARCHAR(2)   NOT NULL,
  "title"                  VARCHAR(48)  NOT NULL,
  "body"                   VARCHAR(300) NOT NULL,
  "status"                 VARCHAR(16)  NOT NULL DEFAULT 'draft',
  "approved_by_founder_id" UUID,
  "approved_at"            TIMESTAMPTZ,
  "updated_by_founder_id"  UUID         NOT NULL,
  "updated_at"             TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "offer_text_pkey" PRIMARY KEY ("offer_id", "locale"),
  CONSTRAINT "offer_text_offer_id_fkey" FOREIGN KEY ("offer_id")
    REFERENCES "growth"."offer" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "offer_text_locale_check" CHECK ("locale" IN ('ro', 'en', 'fr', 'es', 'de', 'it')),
  CONSTRAINT "offer_text_title_check" CHECK (char_length(btrim("title")) BETWEEN 1 AND 48),
  CONSTRAINT "offer_text_body_check" CHECK (char_length(btrim("body")) BETWEEN 1 AND 300),
  CONSTRAINT "offer_text_status_check" CHECK ("status" IN ('draft', 'approved')),
  CONSTRAINT "offer_text_approval_check" CHECK (
    ("status" = 'approved') = ("approved_at" IS NOT NULL)
    AND ("approved_at" IS NULL) = ("approved_by_founder_id" IS NULL)
  )
);

-- CreateTable
CREATE TABLE "growth"."audience" (
  "id"                    UUID         NOT NULL,
  "name"                  VARCHAR(120) NOT NULL,
  "rule"                  JSONB        NOT NULL,
  "archived_at"           TIMESTAMPTZ,
  "created_by_founder_id" UUID         NOT NULL,
  "created_at"            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "audience_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audience_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 120),
  CONSTRAINT "audience_rule_check" CHECK (growth.rule_allowed("rule"))
);

-- CreateTable
CREATE TABLE "growth"."campaign" (
  "id"                        UUID         NOT NULL,
  "name"                      VARCHAR(120) NOT NULL,
  "offer_id"                  UUID         NOT NULL,
  "mode"                      VARCHAR(16)  NOT NULL,
  -- automat: semnalul (un eveniment growthSafe din catalog); programat: perioada
  "signal_type"               VARCHAR(128),
  "signal_version"            INTEGER,
  "starts_at"                 TIMESTAMPTZ,
  "ends_at"                   TIMESTAMPTZ,
  -- regula campaniei (copiată din audiență sau scrisă în editor); audiența e doar sursa ei
  "audience_id"               UUID,
  "rule"                      JSONB        NOT NULL,
  -- P21 / D5-4: `member` doar pentru „Recomandă aplicația” (o ofertă app_activation)
  "audience_role"             VARCHAR(8)   NOT NULL DEFAULT 'buyer',
  "priority"                  INTEGER      NOT NULL DEFAULT 50,
  "max_impressions_per_user"  INTEGER,
  "status"                    VARCHAR(16)  NOT NULL DEFAULT 'draft',
  "published_at"              TIMESTAMPTZ,
  "stopped_at"                TIMESTAMPTZ,
  "stop_reason"               VARCHAR(32),
  "stop_note"                 TEXT,
  "stopped_by_founder_id"     UUID,
  "created_by_founder_id"     UUID         NOT NULL,
  "created_at"                TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"                TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "campaign_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "campaign_offer_id_fkey" FOREIGN KEY ("offer_id")
    REFERENCES "growth"."offer" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "campaign_audience_id_fkey" FOREIGN KEY ("audience_id")
    REFERENCES "growth"."audience" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "campaign_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 120),
  CONSTRAINT "campaign_mode_check" CHECK (CASE "mode"
    WHEN 'signal' THEN "signal_type" ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
      AND "signal_version" >= 1
      AND ("ends_at" IS NULL OR "starts_at" IS NULL OR "ends_at" > "starts_at")
    WHEN 'scheduled' THEN "signal_type" IS NULL AND "signal_version" IS NULL
      AND "starts_at" IS NOT NULL AND "ends_at" IS NOT NULL AND "ends_at" > "starts_at"
    ELSE false END),
  CONSTRAINT "campaign_rule_check" CHECK (growth.rule_allowed("rule")),
  CONSTRAINT "campaign_audience_role_check" CHECK ("audience_role" IN ('buyer', 'member')),
  CONSTRAINT "campaign_priority_check" CHECK ("priority" BETWEEN 0 AND 100),
  CONSTRAINT "campaign_max_impressions_check"
    CHECK ("max_impressions_per_user" IS NULL OR "max_impressions_per_user" BETWEEN 1 AND 50),
  CONSTRAINT "campaign_status_check" CHECK ("status" IN ('draft', 'active', 'stopped')),
  -- manual (Founder) sau automat la rata de deranjare (P22, D5-8)
  CONSTRAINT "campaign_stop_check" CHECK (
    ("status" = 'stopped') = ("stopped_at" IS NOT NULL)
    AND ("status" = 'stopped') = ("stop_reason" IS NOT NULL)
    AND ("stop_reason" IS NULL OR "stop_reason" IN ('manual', 'auto_disturbance'))
    AND (("stop_reason" = 'manual') = ("stopped_by_founder_id" IS NOT NULL))
    AND ("stop_note" IS NULL OR char_length(btrim("stop_note")) BETWEEN 1 AND 2000)
  ),
  CONSTRAINT "campaign_published_check" CHECK (("status" = 'draft') = ("published_at" IS NULL))
);

CREATE INDEX "campaign_offer_id_idx" ON "growth"."campaign" ("offer_id");
CREATE INDEX "campaign_status_idx" ON "growth"."campaign" ("status", "mode");

-- CreateTable
CREATE TABLE "growth"."campaign_slot" (
  "campaign_id" UUID         NOT NULL,
  "slot_id"     VARCHAR(128) NOT NULL,
  CONSTRAINT "campaign_slot_pkey" PRIMARY KEY ("campaign_id", "slot_id"),
  CONSTRAINT "campaign_slot_campaign_id_fkey" FOREIGN KEY ("campaign_id")
    REFERENCES "growth"."campaign" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "campaign_slot_slot_id_fkey" FOREIGN KEY ("slot_id")
    REFERENCES "growth"."placement" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX "campaign_slot_slot_id_idx" ON "growth"."campaign_slot" ("slot_id");

-- CreateTable — un singur rând: oprirea globală și plafoanele globale (D-GRW-6, D-GRW-16, P25).
CREATE TABLE "growth"."control" (
  "id"                    SMALLINT     NOT NULL DEFAULT 1,
  "paused"                BOOLEAN      NOT NULL DEFAULT true,
  "pause_reason"          TEXT,
  "daily_per_user"        INTEGER      NOT NULL DEFAULT 1,
  "weekly_per_user"       INTEGER      NOT NULL DEFAULT 3,
  "dismiss_cooldown_days" INTEGER      NOT NULL DEFAULT 30,
  "changed_by_founder_id" UUID,
  "changed_at"            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "control_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "control_single_check" CHECK ("id" = 1),
  CONSTRAINT "control_pause_reason_check" CHECK (
    NOT "paused" OR ("pause_reason" IS NOT NULL AND char_length(btrim("pause_reason")) BETWEEN 1 AND 2000)
  ),
  -- maximele permise (P25): 2 pe zi, 5 pe săptămână, cel puțin 14 zile după respingere
  CONSTRAINT "control_daily_check" CHECK ("daily_per_user" BETWEEN 1 AND 2),
  CONSTRAINT "control_weekly_check"
    CHECK ("weekly_per_user" BETWEEN 1 AND 5 AND "weekly_per_user" >= "daily_per_user"),
  CONSTRAINT "control_cooldown_check" CHECK ("dismiss_cooldown_days" BETWEEN 14 AND 365)
);

INSERT INTO "growth"."control" ("id", "paused", "pause_reason")
VALUES (1, true, 'Pornește după răspunsul juridic (FAZA-5 §8, criteriul 9).');

-- CreateTable
CREATE TABLE "growth"."impression" (
  "id"              UUID         NOT NULL,
  "organization_id" UUID         NOT NULL,
  "user_id"         UUID         NOT NULL,
  "campaign_id"     UUID         NOT NULL,
  "offer_id"        UUID         NOT NULL,
  "slot_id"         VARCHAR(128) NOT NULL,
  "locale"          VARCHAR(2)   NOT NULL,
  -- false: cerută de persoană (catalog, funcționalitate blocată): nu intră sub plafoane
  "proactive"       BOOLEAN      NOT NULL,
  "audience_role"   VARCHAR(8)   NOT NULL,
  "shown_at"        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "impression_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "impression_campaign_id_fkey" FOREIGN KEY ("campaign_id")
    REFERENCES "growth"."campaign" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "impression_offer_id_fkey" FOREIGN KEY ("offer_id")
    REFERENCES "growth"."offer" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "impression_slot_id_fkey" FOREIGN KEY ("slot_id")
    REFERENCES "growth"."placement" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "impression_locale_check" CHECK ("locale" IN ('ro', 'en', 'fr', 'es', 'de', 'it')),
  CONSTRAINT "impression_audience_role_check" CHECK ("audience_role" IN ('buyer', 'member'))
);

-- plafoanele pe persoană (D5-10: în toate afacerile) și plafonul pe campanie
CREATE INDEX "impression_user_id_shown_at_idx" ON "growth"."impression" ("user_id", "shown_at");
CREATE INDEX "impression_campaign_id_shown_at_idx"
  ON "growth"."impression" ("campaign_id", "shown_at");
CREATE INDEX "impression_organization_id_shown_at_idx"
  ON "growth"."impression" ("organization_id", "shown_at");

-- CreateTable
CREATE TABLE "growth"."interaction" (
  "id"              UUID         NOT NULL,
  "organization_id" UUID         NOT NULL,
  "user_id"         UUID         NOT NULL,
  "impression_id"   UUID         NOT NULL,
  "kind"            VARCHAR(16)  NOT NULL,
  -- idempotența (dublu-click, reîncercări): o interacțiune pe cheie
  "idempotency_key" VARCHAR(128) NOT NULL,
  "snooze_until"    TIMESTAMPTZ,
  "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "interaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "interaction_impression_id_fkey" FOREIGN KEY ("impression_id")
    REFERENCES "growth"."impression" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "interaction_kind_check"
    CHECK ("kind" IN ('click', 'dismiss', 'snooze', 'recommend', 'undo')),
  CONSTRAINT "interaction_snooze_check" CHECK (("kind" = 'snooze') = ("snooze_until" IS NOT NULL))
);

CREATE UNIQUE INDEX "interaction_idempotency_key_key"
  ON "growth"."interaction" ("idempotency_key");
CREATE INDEX "interaction_impression_id_idx" ON "growth"."interaction" ("impression_id");
CREATE INDEX "interaction_organization_id_created_at_idx"
  ON "growth"."interaction" ("organization_id", "created_at");

-- CreateTable
CREATE TABLE "growth"."suppression" (
  "organization_id" UUID         NOT NULL,
  "user_id"         UUID         NOT NULL,
  "offer_id"        UUID         NOT NULL,
  "reason"          VARCHAR(16)  NOT NULL,
  -- „Anulează” din Toast: termenul devine acum
  "until"           TIMESTAMPTZ  NOT NULL,
  "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "suppression_pkey" PRIMARY KEY ("organization_id", "user_id", "offer_id"),
  CONSTRAINT "suppression_offer_id_fkey" FOREIGN KEY ("offer_id")
    REFERENCES "growth"."offer" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "suppression_reason_check" CHECK ("reason" IN ('dismiss', 'snooze', 'tooltip'))
);

-- CreateTable
CREATE TABLE "growth"."signal_hit" (
  "id"              UUID         NOT NULL,
  "organization_id" UUID         NOT NULL,
  -- semnalele pe persoană (funcționalitate blocată); NULL pentru cele pe afacere (limită, probă)
  "user_id"         UUID,
  "event_id"        UUID         NOT NULL,
  "event_type"      VARCHAR(128) NOT NULL,
  "event_version"   INTEGER      NOT NULL,
  -- doar id-uri, chei și cifre, din payload-ul growthSafe al evenimentului
  "payload"         JSONB        NOT NULL DEFAULT '{}',
  "received_at"     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "expires_at"      TIMESTAMPTZ  NOT NULL,
  CONSTRAINT "signal_hit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "signal_hit_event_type_check"
    CHECK ("event_type" ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$' AND "event_version" >= 1),
  CONSTRAINT "signal_hit_payload_check" CHECK (jsonb_typeof("payload") = 'object'),
  CONSTRAINT "signal_hit_expires_check" CHECK ("expires_at" > "received_at")
);

-- T6: același eveniment livrat de două ori → un singur rând
CREATE UNIQUE INDEX "signal_hit_event_id_key" ON "growth"."signal_hit" ("event_id");
CREATE INDEX "signal_hit_organization_id_event_type_idx"
  ON "growth"."signal_hit" ("organization_id", "event_type", "expires_at");

-- CreateTable
CREATE TABLE "growth"."conversion" (
  "id"                   UUID         NOT NULL,
  "organization_id"      UUID         NOT NULL,
  "campaign_id"          UUID         NOT NULL,
  "offer_id"             UUID         NOT NULL,
  "click_interaction_id" UUID         NOT NULL,
  "event_id"             UUID         NOT NULL,
  "event_type"           VARCHAR(128) NOT NULL,
  "converted_at"         TIMESTAMPTZ  NOT NULL,
  -- D5-12: prima plată a obiectului, fără TVA, citită din core/billing (NULL până la plată)
  "revenue_minor"        BIGINT,
  "currency"             VARCHAR(3),
  "created_at"           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "conversion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "conversion_campaign_id_fkey" FOREIGN KEY ("campaign_id")
    REFERENCES "growth"."campaign" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "conversion_offer_id_fkey" FOREIGN KEY ("offer_id")
    REFERENCES "growth"."offer" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "conversion_click_interaction_id_fkey" FOREIGN KEY ("click_interaction_id")
    REFERENCES "growth"."interaction" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "conversion_event_type_check"
    CHECK ("event_type" ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  CONSTRAINT "conversion_revenue_check" CHECK (
    ("revenue_minor" IS NULL) = ("currency" IS NULL)
    AND ("revenue_minor" IS NULL OR "revenue_minor" >= 0)
    AND ("currency" IS NULL OR "currency" IN ('RON', 'EUR'))
  )
);

-- un eveniment comercial se atribuie cel mult o dată
CREATE UNIQUE INDEX "conversion_event_id_key" ON "growth"."conversion" ("event_id");
CREATE INDEX "conversion_campaign_id_converted_at_idx"
  ON "growth"."conversion" ("campaign_id", "converted_at");

-- ── Gărzile: indiferent de cine scrie ────────────────────────────────────────────────────────────

-- Un text editat se întoarce la „draft” (aprobarea ține de textul aprobat, nu de rând).
CREATE OR REPLACE FUNCTION growth.offer_text_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'approved' THEN NEW.approved_at := now(); END IF;
    RETURN NEW;
  END IF;
  IF (NEW.offer_id, NEW.locale) IS DISTINCT FROM (OLD.offer_id, OLD.locale) THEN
    RAISE EXCEPTION 'offer_text: the offer and the language of a text do not change'
      USING ERRCODE = 'P0001';
  END IF;
  IF (NEW.title, NEW.body) IS DISTINCT FROM (OLD.title, OLD.body) THEN
    NEW.status := 'draft';
    NEW.approved_at := NULL;
    NEW.approved_by_founder_id := NULL;
  ELSIF NEW.status = 'approved' AND OLD.status = 'draft' THEN
    NEW.approved_at := now();
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER offer_text_guard
  BEFORE INSERT OR UPDATE ON "growth"."offer_text"
  FOR EACH ROW EXECUTE FUNCTION growth.offer_text_guard();

-- O ofertă se publică doar cu textul RO aprobat (P20); tipul și obiectul nu se schimbă după
-- publicare (afișările și conversiile vechi trebuie să rămână corecte).
CREATE OR REPLACE FUNCTION growth.offer_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.code IS DISTINCT FROM OLD.code
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by_founder_id IS DISTINCT FROM OLD.created_by_founder_id THEN
      RAISE EXCEPTION 'offer %: the id and the code do not change', OLD.id USING ERRCODE = 'P0001';
    END IF;
    IF OLD.status <> 'draft' AND (NEW.type, NEW.application_id, NEW.plan_version_id,
        NEW.addon_code, NEW.feature_key, NEW.trial_days) IS DISTINCT FROM (OLD.type,
        OLD.application_id, OLD.plan_version_id, OLD.addon_code, OLD.feature_key, OLD.trial_days) THEN
      RAISE EXCEPTION 'offer %: the commercial object of a published offer does not change', OLD.id
        USING ERRCODE = 'P0001';
    END IF;
    IF OLD.status <> 'draft' AND NEW.status = 'draft' THEN
      RAISE EXCEPTION 'offer %: a published offer does not go back to draft', OLD.id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status <> 'published') AND NOT EXISTS (
       SELECT 1 FROM growth.offer_text t
        WHERE t.offer_id = NEW.id AND t.locale = 'ro' AND t.status = 'approved') THEN
    RAISE EXCEPTION 'offer %: publishing needs the Romanian text approved', NEW.id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER offer_guard
  BEFORE INSERT OR UPDATE ON "growth"."offer"
  FOR EACH ROW EXECUTE FUNCTION growth.offer_guard();

-- Campania: membrii doar pentru „Recomandă aplicația” (P21); publicarea cere oferta publicată, cu
-- RO aprobat, și cel puțin un slot activ; starea merge draft → active ⇄ stopped.
CREATE OR REPLACE FUNCTION growth.campaign_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_offer_type   VARCHAR(32);
  v_offer_status VARCHAR(16);
BEGIN
  NEW.updated_at := now();
  SELECT o.type, o.status INTO v_offer_type, v_offer_status
    FROM growth.offer o WHERE o.id = NEW.offer_id;
  IF NEW.audience_role = 'member' AND v_offer_type IS DISTINCT FROM 'app_activation' THEN
    RAISE EXCEPTION 'campaign: members can only be an audience for recommending an app (P21)'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'campaign: a new campaign starts as a draft' USING ERRCODE = '23514';
    END IF;
    NEW.created_at := now();
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by_founder_id IS DISTINCT FROM OLD.created_by_founder_id THEN
    RAISE EXCEPTION 'campaign %: the id and the author do not change', OLD.id USING ERRCODE = 'P0001';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'draft'   AND NEW.status = 'active')
    OR (OLD.status = 'active'  AND NEW.status = 'stopped')
    OR (OLD.status = 'stopped' AND NEW.status = 'active')
  ) THEN
    RAISE EXCEPTION 'campaign %: % → % is not allowed', OLD.id, OLD.status, NEW.status
      USING ERRCODE = 'P0001';
  END IF;
  IF NEW.status = 'active' AND OLD.status <> 'active' THEN
    IF v_offer_status IS DISTINCT FROM 'published' THEN
      RAISE EXCEPTION 'campaign %: the offer is not published', OLD.id USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM growth.offer_text t
                    WHERE t.offer_id = NEW.offer_id AND t.locale = 'ro' AND t.status = 'approved') THEN
      RAISE EXCEPTION 'campaign %: publishing needs the Romanian texts approved', OLD.id
        USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM growth.campaign_slot cs
                     JOIN growth.placement p ON p.id = cs.slot_id
                    WHERE cs.campaign_id = NEW.id AND p.retired_at IS NULL) THEN
      RAISE EXCEPTION 'campaign %: publishing needs at least one slot', OLD.id
        USING ERRCODE = '23514';
    END IF;
    NEW.published_at := COALESCE(OLD.published_at, now());
    -- repornirea e manuală (P22) și curăță oprirea
    NEW.stopped_at := NULL;
    NEW.stop_reason := NULL;
    NEW.stop_note := NULL;
    NEW.stopped_by_founder_id := NULL;
  ELSIF NEW.status = 'stopped' AND OLD.status = 'active' THEN
    NEW.stopped_at := now();
  ELSIF NEW.status = OLD.status THEN
    -- fără schimbare de stare: oprirea rămâne cum era
    NEW.published_at := OLD.published_at;
    NEW.stopped_at := OLD.stopped_at;
    NEW.stop_reason := OLD.stop_reason;
    NEW.stop_note := OLD.stop_note;
    NEW.stopped_by_founder_id := OLD.stopped_by_founder_id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER campaign_guard
  BEFORE INSERT OR UPDATE ON "growth"."campaign"
  FOR EACH ROW EXECUTE FUNCTION growth.campaign_guard();

CREATE OR REPLACE FUNCTION growth.control_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW.id := 1;
  NEW.changed_at := now();
  IF NOT NEW.paused THEN
    NEW.pause_reason := NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER control_guard
  BEFORE UPDATE ON "growth"."control"
  FOR EACH ROW EXECUTE FUNCTION growth.control_guard();

CREATE OR REPLACE FUNCTION growth.placement_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stopped IS DISTINCT FROM OLD.stopped THEN
    NEW.stopped_at := CASE WHEN NEW.stopped THEN now() ELSE NULL END;
    IF NOT NEW.stopped THEN
      NEW.stop_reason := NULL;
      NEW.stopped_by_founder_id := NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER placement_guard
  BEFORE UPDATE ON "growth"."placement"
  FOR EACH ROW EXECUTE FUNCTION growth.placement_guard();

-- Afișarea: doar dintr-o campanie activă, pe un slot al ei, oferta ei, într-o limbă cu text aprobat
-- (P20), cu rolul campaniei (P21). Nu se schimbă după scriere (fără UPDATE).
CREATE OR REPLACE FUNCTION growth.impression_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_campaign growth.campaign%ROWTYPE;
BEGIN
  SELECT * INTO v_campaign FROM growth.campaign c WHERE c.id = NEW.campaign_id;
  IF v_campaign.id IS NULL OR v_campaign.status <> 'active' THEN
    RAISE EXCEPTION 'impression: the campaign is not active' USING ERRCODE = '23514';
  END IF;
  IF v_campaign.offer_id <> NEW.offer_id OR v_campaign.audience_role <> NEW.audience_role THEN
    RAISE EXCEPTION 'impression: the offer or the audience differs from the campaign''s'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM growth.campaign_slot cs
                  WHERE cs.campaign_id = NEW.campaign_id AND cs.slot_id = NEW.slot_id) THEN
    RAISE EXCEPTION 'impression: the slot is not one of the campaign''s' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM growth.offer_text t
                  WHERE t.offer_id = NEW.offer_id AND t.locale = NEW.locale
                    AND t.status = 'approved') THEN
    RAISE EXCEPTION 'impression: no approved text in %, so nothing is shown (P20)', NEW.locale
      USING ERRCODE = '23514';
  END IF;
  NEW.shown_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER impression_guard
  BEFORE INSERT ON "growth"."impression"
  FOR EACH ROW EXECUTE FUNCTION growth.impression_guard();

-- Interacțiunea stă în organizația și la persoana afișării.
CREATE OR REPLACE FUNCTION growth.interaction_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_org  UUID;
  v_user UUID;
BEGIN
  SELECT i.organization_id, i.user_id INTO v_org, v_user
    FROM growth.impression i WHERE i.id = NEW.impression_id;
  IF v_org IS NULL OR v_org <> NEW.organization_id OR v_user <> NEW.user_id THEN
    RAISE EXCEPTION 'interaction: organization or person differs from the impression''s'
      USING ERRCODE = '23514';
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER interaction_guard
  BEFORE INSERT ON "growth"."interaction"
  FOR EACH ROW EXECUTE FUNCTION growth.interaction_guard();

CREATE OR REPLACE FUNCTION growth.suppression_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
  ELSIF (NEW.organization_id, NEW.user_id, NEW.offer_id, NEW.created_at)
        IS DISTINCT FROM (OLD.organization_id, OLD.user_id, OLD.offer_id, OLD.created_at) THEN
    RAISE EXCEPTION 'suppression: only the reason and the end may change' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER suppression_guard
  BEFORE INSERT OR UPDATE ON "growth"."suppression"
  FOR EACH ROW EXECUTE FUNCTION growth.suppression_guard();

-- Conversia: un click al aceleiași organizații, pe aceeași campanie și ofertă, cu cel mult 7 zile
-- înainte (P24, D5-12). Atribuirea o face core/growth; baza refuză orice altceva.
CREATE OR REPLACE FUNCTION growth.conversion_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_kind     VARCHAR(16);
  v_org      UUID;
  v_at       TIMESTAMPTZ;
  v_campaign UUID;
  v_offer    UUID;
BEGIN
  SELECT x.kind, x.organization_id, x.created_at, i.campaign_id, i.offer_id
    INTO v_kind, v_org, v_at, v_campaign, v_offer
    FROM growth.interaction x JOIN growth.impression i ON i.id = x.impression_id
   WHERE x.id = NEW.click_interaction_id;
  IF v_kind IS DISTINCT FROM 'click' OR v_org <> NEW.organization_id
     OR v_campaign <> NEW.campaign_id OR v_offer <> NEW.offer_id THEN
    RAISE EXCEPTION 'conversion: not a click of this organization on this campaign and offer'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.converted_at < v_at OR NEW.converted_at > v_at + INTERVAL '7 days' THEN
    RAISE EXCEPTION 'conversion: outside the 7 days after the click (P24)' USING ERRCODE = '23514';
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER conversion_guard
  BEFORE INSERT ON "growth"."conversion"
  FOR EACH ROW EXECUTE FUNCTION growth.conversion_guard();

-- ── RLS: T1 / T2 ─────────────────────────────────────────────────────────────────────────────────
-- Catalogul e comun; restul doar în contextul organizației (app.organization_id), eșec sigur.
ALTER TABLE "growth"."placement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "growth"."offer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "growth"."offer_text" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "growth"."audience" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "growth"."campaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "growth"."campaign_slot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "growth"."control" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "growth"."impression" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "growth"."interaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "growth"."suppression" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "growth"."signal_hit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "growth"."conversion" ENABLE ROW LEVEL SECURITY;

CREATE POLICY growth_rw_placement ON "growth"."placement" FOR SELECT TO growth_rw USING (true);
CREATE POLICY growth_rw_offer ON "growth"."offer" FOR SELECT TO growth_rw USING (true);
CREATE POLICY growth_rw_offer_text ON "growth"."offer_text" FOR SELECT TO growth_rw USING (true);
CREATE POLICY growth_rw_campaign ON "growth"."campaign" FOR SELECT TO growth_rw USING (true);
CREATE POLICY growth_rw_campaign_slot ON "growth"."campaign_slot"
  FOR SELECT TO growth_rw USING (true);
CREATE POLICY growth_rw_control ON "growth"."control" FOR SELECT TO growth_rw USING (true);

CREATE POLICY growth_founder_placement ON "growth"."placement"
  TO growth_founder USING (true) WITH CHECK (true);
CREATE POLICY growth_founder_offer ON "growth"."offer"
  TO growth_founder USING (true) WITH CHECK (true);
CREATE POLICY growth_founder_offer_text ON "growth"."offer_text"
  TO growth_founder USING (true) WITH CHECK (true);
CREATE POLICY growth_founder_audience ON "growth"."audience"
  TO growth_founder USING (true) WITH CHECK (true);
CREATE POLICY growth_founder_campaign ON "growth"."campaign"
  TO growth_founder USING (true) WITH CHECK (true);
CREATE POLICY growth_founder_campaign_slot ON "growth"."campaign_slot"
  TO growth_founder USING (true) WITH CHECK (true);
CREATE POLICY growth_founder_control ON "growth"."control"
  TO growth_founder USING (true) WITH CHECK (true);

CREATE POLICY growth_rw_impression ON "growth"."impression" TO growth_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY growth_rw_interaction ON "growth"."interaction" TO growth_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY growth_rw_suppression ON "growth"."suppression" TO growth_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY growth_rw_signal_hit ON "growth"."signal_hit" TO growth_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY growth_rw_conversion ON "growth"."conversion" TO growth_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Founder citește o afacere pe tranzacție; rezultatele peste afaceri vin prin funcții (Lotul 5.10d)
CREATE POLICY growth_founder_impression ON "growth"."impression" FOR SELECT TO growth_founder
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY growth_founder_interaction ON "growth"."interaction" FOR SELECT TO growth_founder
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY growth_founder_conversion ON "growth"."conversion" FOR SELECT TO growth_founder
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- ── Grants: nimeni nu șterge, cu o excepție (sloturile unei campanii, la editare) ────────────────
--   growth_rw (Hub, job-uri): citește catalogul și controlul — NU scrie oferte, campanii, plafoane
--     sau opriri (refuz în baza de date, nu doar în ecran); scrie afișările, interacțiunile,
--     respingerile, semnalele și conversiile afacerii.
--   growth_founder (Founder): scrie catalogul, campaniile, opririle și plafoanele; citește
--     afișările, interacțiunile și conversiile unei afaceri. Registrul sloturilor îl scrie doar
--     sincronizarea de la deploy (DIRECT_URL); Founder poate doar opri / porni un slot.
REVOKE ALL ON "growth"."placement", "growth"."offer", "growth"."offer_text", "growth"."audience",
  "growth"."campaign", "growth"."campaign_slot", "growth"."control", "growth"."impression",
  "growth"."interaction", "growth"."suppression", "growth"."signal_hit", "growth"."conversion"
  FROM PUBLIC;

GRANT SELECT ON "growth"."placement", "growth"."offer", "growth"."offer_text", "growth"."campaign",
  "growth"."campaign_slot", "growth"."control" TO growth_rw;
GRANT SELECT, INSERT ON "growth"."impression", "growth"."interaction", "growth"."signal_hit",
  "growth"."conversion" TO growth_rw;
GRANT SELECT, INSERT ON "growth"."suppression" TO growth_rw;
GRANT UPDATE ("reason", "until", "updated_at") ON "growth"."suppression" TO growth_rw;

GRANT SELECT ON "growth"."placement" TO growth_founder;
GRANT UPDATE ("stopped", "stop_reason", "stopped_by_founder_id", "stopped_at")
  ON "growth"."placement" TO growth_founder;
GRANT SELECT, INSERT ON "growth"."offer", "growth"."offer_text", "growth"."audience",
  "growth"."campaign" TO growth_founder;
GRANT UPDATE ("type", "application_id", "plan_version_id", "addon_code", "feature_key",
  "trial_days", "status", "updated_at") ON "growth"."offer" TO growth_founder;
GRANT UPDATE ("title", "body", "status", "approved_by_founder_id", "approved_at",
  "updated_by_founder_id", "updated_at") ON "growth"."offer_text" TO growth_founder;
GRANT UPDATE ("name", "rule", "archived_at", "updated_at") ON "growth"."audience" TO growth_founder;
GRANT UPDATE ("name", "offer_id", "mode", "signal_type", "signal_version", "starts_at", "ends_at",
  "audience_id", "rule", "audience_role", "priority", "max_impressions_per_user", "status",
  "published_at", "stopped_at", "stop_reason", "stop_note", "stopped_by_founder_id", "updated_at")
  ON "growth"."campaign" TO growth_founder;
GRANT SELECT, INSERT, DELETE ON "growth"."campaign_slot" TO growth_founder;
GRANT SELECT ON "growth"."control" TO growth_founder;
GRANT UPDATE ("paused", "pause_reason", "daily_per_user", "weekly_per_user",
  "dismiss_cooldown_days", "changed_by_founder_id") ON "growth"."control" TO growth_founder;
GRANT SELECT ON "growth"."impression", "growth"."interaction", "growth"."conversion"
  TO growth_founder;

-- D5-10: plafonul e pe persoană, în toate afacerile ei. RLS-ul vede o singură afacere, deci
-- numărătoarea vine dintr-o funcție care întoarce doar un număr (nu rânduri și nici afaceri).
CREATE OR REPLACE FUNCTION growth.proactive_impressions_since(p_user_id UUID, p_since TIMESTAMPTZ)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT count(*)::integer
    FROM growth.impression i
   WHERE i.user_id = p_user_id AND i.proactive AND i.shown_at >= p_since;
$$;

REVOKE ALL ON FUNCTION growth.rule_allowed(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth.proactive_impressions_since(UUID, TIMESTAMPTZ) FROM PUBLIC;
-- CHECK-urile apelează funcția listei albe cu drepturile celui care scrie
GRANT EXECUTE ON FUNCTION growth.rule_allowed(JSONB) TO growth_rw, growth_founder;
GRANT EXECUTE ON FUNCTION growth.proactive_impressions_since(UUID, TIMESTAMPTZ) TO growth_rw;
