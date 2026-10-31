-- Lot 3.2 — commercial_subscription: moneda afacerii, abonamentul (versiunea exactă, periodicitatea,
-- ziua de ancorare), mutarea pe altă versiune, pachetele active și outbox-ul schemei.
--
-- RLS pe app.organization_id (D-SEC-1: USING + WITH CHECK, eșec sigur — fără setare, 0 rânduri):
--   commercial_rw      → doar citire, în contextul afacerii (getEffectiveEntitlements)
--   commercial_founder → citire și scriere, tot în contextul unei singure afaceri pe tranzacție
-- Nicio ștergere: un abonament se anulează, o mutare se anulează, un pachet se încheie.

-- CreateTable: D3-2, moneda afacerii (fixată din Founder)
CREATE TABLE "commercial"."billing_account" (
    "organization_id" UUID NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "set_by_founder_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_account_pkey" PRIMARY KEY ("organization_id"),
    CONSTRAINT "billing_account_currency" CHECK ("currency" IN ('RON', 'EUR'))
);

-- CreateTable: D3-3, ziua de ancorare = ziua de start (29–31 → ultima zi a lunilor mai scurte)
CREATE TABLE "commercial"."subscription" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "plan_version_id" UUID NOT NULL,
    "interval" VARCHAR(8) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "started_on" DATE NOT NULL,
    "anchor_day" SMALLINT NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "trial_ends_at" TIMESTAMPTZ,
    "canceled_at" TIMESTAMPTZ,
    "created_by_founder_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subscription_interval" CHECK ("interval" IN ('month', 'year')),
    CONSTRAINT "subscription_currency" CHECK ("currency" IN ('RON', 'EUR')),
    CONSTRAINT "subscription_status" CHECK ("status" IN ('trialing', 'active', 'past_due', 'canceled')),
    CONSTRAINT "subscription_anchor_day" CHECK ("anchor_day" = EXTRACT(DAY FROM "started_on")),
    -- D3-5: perioada de probă pe tot abonamentul, doar din Founder, are mereu un termen
    CONSTRAINT "subscription_trial" CHECK ("status" <> 'trialing' OR "trial_ends_at" IS NOT NULL),
    CONSTRAINT "subscription_canceled" CHECK (("status" = 'canceled') = ("canceled_at" IS NOT NULL))
);

-- CreateTable: §8.5 / D-COM-9 — în dezavantajul clientului, cu cel puțin 30 de zile înainte
CREATE TABLE "commercial"."subscription_change" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subscription_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "from_version_id" UUID NOT NULL,
    "to_version_id" UUID NOT NULL,
    "classification" VARCHAR(16) NOT NULL,
    "effective_at" TIMESTAMPTZ NOT NULL,
    "canceled_at" TIMESTAMPTZ,
    "created_by_founder_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_change_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subscription_change_classification" CHECK ("classification" IN ('advantage', 'disadvantage')),
    CONSTRAINT "subscription_change_versions" CHECK ("from_version_id" <> "to_version_id"),
    CONSTRAINT "subscription_change_notice" CHECK (
      "classification" = 'advantage' OR "effective_at" >= "created_at" + INTERVAL '30 days'
    )
);

-- CreateTable: D3-7 — pachetele lunare sunt linii recurente ale abonamentului; cele pentru luna
-- curentă au termen (următoarea resetare)
CREATE TABLE "commercial"."addon_grant" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "addon_id" UUID NOT NULL,
    "subscription_id" UUID,
    "packs" INTEGER NOT NULL DEFAULT 1,
    "recurring" BOOLEAN NOT NULL,
    "source" VARCHAR(16) NOT NULL,
    "starts_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMPTZ,
    "ended_at" TIMESTAMPTZ,
    "created_by_founder_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "addon_grant_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "addon_grant_packs" CHECK ("packs" > 0),
    CONSTRAINT "addon_grant_source" CHECK ("source" IN ('purchase', 'founder')),
    CONSTRAINT "addon_grant_founder" CHECK ("source" <> 'founder' OR "created_by_founder_id" IS NOT NULL),
    CONSTRAINT "addon_grant_validity" CHECK (
      ("recurring" AND "subscription_id" IS NOT NULL AND "ends_at" IS NULL)
      OR (NOT "recurring" AND "ends_at" IS NOT NULL AND "ends_at" > "starts_at")
    )
);

-- CreateIndex
CREATE INDEX "subscription_organization_id_idx" ON "commercial"."subscription"("organization_id");

-- Un singur abonament neanulat pe afacere
CREATE UNIQUE INDEX "subscription_one_live_per_org"
  ON "commercial"."subscription"("organization_id") WHERE "canceled_at" IS NULL;

-- CreateIndex
CREATE INDEX "subscription_change_subscription_id_effective_at_idx" ON "commercial"."subscription_change"("subscription_id", "effective_at");

-- CreateIndex
CREATE INDEX "addon_grant_organization_id_idx" ON "commercial"."addon_grant"("organization_id");

-- AddForeignKey
ALTER TABLE "commercial"."subscription" ADD CONSTRAINT "subscription_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "commercial"."plan_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial"."subscription_change" ADD CONSTRAINT "subscription_change_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "commercial"."subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial"."subscription_change" ADD CONSTRAINT "subscription_change_from_version_id_fkey" FOREIGN KEY ("from_version_id") REFERENCES "commercial"."plan_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial"."subscription_change" ADD CONSTRAINT "subscription_change_to_version_id_fkey" FOREIGN KEY ("to_version_id") REFERENCES "commercial"."plan_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial"."addon_grant" ADD CONSTRAINT "addon_grant_addon_id_fkey" FOREIGN KEY ("addon_id") REFERENCES "commercial"."addon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial"."addon_grant" ADD CONSTRAINT "addon_grant_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "commercial"."subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Pe server, indiferent de interfață: momentul creării nu se poate da din afară (garda de 30 de
-- zile se măsoară de la el), iar abonamentul și mutarea cer o versiune publicată.
CREATE OR REPLACE FUNCTION commercial.subscription_change_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = commercial, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
  ELSIF NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.effective_at IS DISTINCT FROM OLD.effective_at
     OR NEW.classification IS DISTINCT FROM OLD.classification
     OR NEW.to_version_id IS DISTINCT FROM OLD.to_version_id
     OR NEW.from_version_id IS DISTINCT FROM OLD.from_version_id
     OR NEW.subscription_id IS DISTINCT FROM OLD.subscription_id THEN
    RAISE EXCEPTION 'subscription_change % can only be canceled', OLD.id USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM commercial.plan_version WHERE id = NEW.to_version_id AND published_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'plan_version % is not published', NEW.to_version_id USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER subscription_change_guard
  BEFORE INSERT OR UPDATE ON "commercial"."subscription_change"
  FOR EACH ROW EXECUTE FUNCTION commercial.subscription_change_guard();

CREATE OR REPLACE FUNCTION commercial.subscription_version_published()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = commercial, pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM commercial.plan_version WHERE id = NEW.plan_version_id AND published_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'plan_version % is not published', NEW.plan_version_id USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER subscription_version_published
  BEFORE INSERT OR UPDATE OF "plan_version_id" ON "commercial"."subscription"
  FOR EACH ROW EXECUTE FUNCTION commercial.subscription_version_published();

-- RLS
ALTER TABLE "commercial"."billing_account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commercial"."subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commercial"."subscription_change" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commercial"."addon_grant" ENABLE ROW LEVEL SECURITY;

CREATE POLICY commercial_rw_billing_account ON "commercial"."billing_account" FOR SELECT TO commercial_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY commercial_rw_subscription ON "commercial"."subscription" FOR SELECT TO commercial_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY commercial_rw_subscription_change ON "commercial"."subscription_change" FOR SELECT TO commercial_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY commercial_rw_addon_grant ON "commercial"."addon_grant" FOR SELECT TO commercial_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY commercial_founder_billing_account ON "commercial"."billing_account" TO commercial_founder
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY commercial_founder_subscription ON "commercial"."subscription" TO commercial_founder
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY commercial_founder_subscription_change ON "commercial"."subscription_change" TO commercial_founder
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY commercial_founder_addon_grant ON "commercial"."addon_grant" TO commercial_founder
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

GRANT SELECT ON
  "commercial"."billing_account", "commercial"."subscription", "commercial"."subscription_change",
  "commercial"."addon_grant"
  TO commercial_rw;
GRANT SELECT, INSERT, UPDATE ON
  "commercial"."billing_account", "commercial"."subscription", "commercial"."subscription_change",
  "commercial"."addon_grant"
  TO commercial_founder;

-- Outbox (Lot 4.1, ARCHITECTURE §11.2): generat de outboxMigrationSql('commercial', 'commercial_rw') din @ventora/db-kit.

CREATE TABLE "commercial"."outbox_events" (
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
  ON "commercial"."outbox_events" ("available_at", "occurred_at")
  WHERE "status" = 'pending';

CREATE INDEX "outbox_events_dead_idx"
  ON "commercial"."outbox_events" ("failed_at")
  WHERE "status" = 'dead';

-- Idempotența consumatorilor (D4-1 = a): un rând per (consumator, eveniment), scris în aceeași
-- tranzacție cu efectul consumatorului.
CREATE TABLE "commercial"."processed_events" (
  "consumer"        VARCHAR(128) NOT NULL,
  "event_id"        UUID         NOT NULL,
  "organization_id" UUID         NOT NULL,
  "processed_at"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "processed_events_pkey" PRIMARY KEY ("consumer", "event_id")
);

GRANT SELECT, INSERT, UPDATE ON "commercial"."outbox_events" TO commercial_rw;
GRANT SELECT, INSERT ON "commercial"."processed_events" TO commercial_rw;
REVOKE DELETE ON "commercial"."outbox_events" FROM commercial_rw;
REVOKE UPDATE, DELETE ON "commercial"."processed_events" FROM commercial_rw;

ALTER TABLE "commercial"."outbox_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commercial"."processed_events" ENABLE ROW LEVEL SECURITY;

CREATE POLICY commercial_rw_outbox_events ON "commercial"."outbox_events"
  TO commercial_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY commercial_rw_processed_events ON "commercial"."processed_events"
  TO commercial_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE OR REPLACE FUNCTION "commercial".outbox_pending(p_limit INTEGER)
RETURNS TABLE (event_id UUID, organization_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT e.event_id, e.organization_id
    FROM "commercial".outbox_events e
   WHERE e.status = 'pending'
     AND e.available_at <= now()
   ORDER BY e.available_at, e.occurred_at, e.event_id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 100);
$$;

CREATE OR REPLACE FUNCTION "commercial".outbox_dead_letters(p_limit INTEGER)
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
    FROM "commercial".outbox_events e
   WHERE e.status = 'dead'
   ORDER BY e.failed_at DESC, e.event_id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 500);
$$;

REVOKE ALL ON FUNCTION "commercial".outbox_pending(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION "commercial".outbox_dead_letters(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "commercial".outbox_pending(INTEGER) TO commercial_rw;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA "commercial" TO founder_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION "commercial".outbox_dead_letters(INTEGER) TO founder_runtime';
  END IF;
END $$;

-- Founder scrie evenimentul în aceeași tranzacție cu mutarea (anunțul, D-COM-9); citirea și
-- dispecerul rămân pe commercial_rw.
GRANT INSERT ON "commercial"."outbox_events" TO commercial_founder;
CREATE POLICY commercial_founder_outbox_events ON "commercial"."outbox_events"
  FOR INSERT TO commercial_founder
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);