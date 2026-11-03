-- Lot 3.5 (FAZA-3, ARCHITECTURE §8.6, D3-4 a): core/billing — plățile cu cardul prin Stripe.
-- Schema `billing`, rolul `billing_rw` (NOLOGIN NOINHERIT, membru al app_runtime), RLS pe
-- `app.organization_id` din ziua 0 (D-SEC-1). Datele cardului nu trec prin Ventora: se păstrează
-- doar marca, ultimele 4 cifre, expirarea și id-ul Stripe (§8.6, patterns.md).
--
--   billing_customer      → organizația ↔ clientul Stripe
--   payment_method_ref    → cardul salvat (SetupIntent), fără date de card
--   purchase              → o cumpărare din Hub: un pachet sau o aplicație pe „Direct” (D3-24),
--                           prețul citit pe server, starea plății și a activării
--   payment               → rezultatul fiecărei încercări de plată (cumpărare sau abonament)
--   stripe_event          → event.id procesat o singură dată (webhook idempotent)
--   billing_subscription  → legătura cu abonamentul Stripe (D3-4) sau marcajul de plată manuală
--   dispute               → disputele (chargeback): decizia rămâne manuală, la Founder
--
-- Fără DELETE pentru billing_rw: istoricul plăților rămâne.

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'billing_rw') THEN
    CREATE ROLE billing_rw NOLOGIN NOINHERIT;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT billing_rw TO app_runtime;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS "billing";
GRANT USAGE ON SCHEMA "billing" TO billing_rw;

CREATE TABLE "billing"."billing_customer" (
  "organization_id"    UUID         NOT NULL,
  "stripe_customer_id" VARCHAR(255) NOT NULL,
  "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "billing_customer_pkey" PRIMARY KEY ("organization_id")
);
CREATE UNIQUE INDEX "billing_customer_stripe_customer_id_key"
  ON "billing"."billing_customer" ("stripe_customer_id");

CREATE TABLE "billing"."payment_method_ref" (
  "id"                       UUID         NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"          UUID         NOT NULL,
  "stripe_payment_method_id" VARCHAR(255) NOT NULL,
  "brand"                    VARCHAR(32)  NOT NULL,
  "last4"                    VARCHAR(4)   NOT NULL,
  "exp_month"                SMALLINT     NOT NULL,
  "exp_year"                 SMALLINT     NOT NULL,
  "is_default"               BOOLEAN      NOT NULL DEFAULT false,
  "detached_at"              TIMESTAMPTZ,
  "created_at"               TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "payment_method_ref_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_method_ref_last4" CHECK ("last4" ~ '^[0-9]{4}$'),
  CONSTRAINT "payment_method_ref_exp_month" CHECK ("exp_month" BETWEEN 1 AND 12),
  CONSTRAINT "payment_method_ref_exp_year" CHECK ("exp_year" BETWEEN 2000 AND 2200)
);
CREATE UNIQUE INDEX "payment_method_ref_stripe_payment_method_id_key"
  ON "billing"."payment_method_ref" ("stripe_payment_method_id");
CREATE INDEX "payment_method_ref_organization_id_idx"
  ON "billing"."payment_method_ref" ("organization_id");
-- Un singur card implicit pe afacere
CREATE UNIQUE INDEX "payment_method_ref_one_default"
  ON "billing"."payment_method_ref" ("organization_id")
  WHERE "is_default" AND "detached_at" IS NULL;

CREATE TABLE "billing"."purchase" (
  "id"                       UUID         NOT NULL,
  "organization_id"          UUID         NOT NULL,
  "kind"                     VARCHAR(16)  NOT NULL,
  "addon_id"                 UUID,
  "application_id"           VARCHAR(64),
  "item_name"                VARCHAR(128) NOT NULL,
  "packs"                    INTEGER      NOT NULL DEFAULT 1,
  "currency"                 VARCHAR(3)   NOT NULL,
  "price_minor"              BIGINT       NOT NULL,
  "setup_minor"              BIGINT       NOT NULL DEFAULT 0,
  "recurring"                BOOLEAN      NOT NULL,
  "status"                   VARCHAR(16)  NOT NULL DEFAULT 'pending',
  "stripe_payment_intent_id" VARCHAR(255),
  "stripe_invoice_id"        VARCHAR(255),
  "failure_code"             VARCHAR(64),
  "failure_message"          VARCHAR(500),
  "commercial_ref"           UUID,
  "activated_at"             TIMESTAMPTZ,
  "created_by_user_id"       UUID         NOT NULL,
  "created_at"               TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"               TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "purchase_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_kind" CHECK (
    ("kind" = 'addon' AND "addon_id" IS NOT NULL AND "application_id" IS NULL)
    OR ("kind" = 'application' AND "application_id" IS NOT NULL AND "addon_id" IS NULL)
  ),
  CONSTRAINT "purchase_packs" CHECK ("packs" > 0),
  CONSTRAINT "purchase_currency" CHECK ("currency" IN ('RON', 'EUR')),
  CONSTRAINT "purchase_amounts" CHECK ("price_minor" >= 0 AND "setup_minor" >= 0),
  -- paid: plata a trecut, activarea încă nu; succeeded: plătit și activat
  CONSTRAINT "purchase_status" CHECK (
    "status" IN ('pending', 'requires_action', 'processing', 'paid', 'succeeded', 'failed', 'canceled')
  ),
  CONSTRAINT "purchase_activated" CHECK (("status" = 'succeeded') = ("activated_at" IS NOT NULL))
);
CREATE UNIQUE INDEX "purchase_stripe_payment_intent_id_key"
  ON "billing"."purchase" ("stripe_payment_intent_id");
CREATE UNIQUE INDEX "purchase_stripe_invoice_id_key"
  ON "billing"."purchase" ("stripe_invoice_id");
CREATE INDEX "purchase_organization_id_created_at_idx"
  ON "billing"."purchase" ("organization_id", "created_at");

CREATE TABLE "billing"."payment" (
  "id"                       UUID         NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"          UUID         NOT NULL,
  "purchase_id"              UUID,
  "kind"                     VARCHAR(16)  NOT NULL,
  "idempotency_key"          VARCHAR(255) NOT NULL,
  "stripe_payment_intent_id" VARCHAR(255),
  "stripe_invoice_id"        VARCHAR(255),
  "attempt"                  INTEGER      NOT NULL DEFAULT 1,
  "status"                   VARCHAR(16)  NOT NULL,
  "amount_minor"             BIGINT       NOT NULL,
  "currency"                 VARCHAR(3)   NOT NULL,
  "failure_code"             VARCHAR(64),
  "next_attempt_at"          TIMESTAMPTZ,
  "occurred_at"              TIMESTAMPTZ  NOT NULL,
  "created_at"               TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "payment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_kind" CHECK ("kind" IN ('purchase', 'subscription')),
  CONSTRAINT "payment_status" CHECK ("status" IN ('succeeded', 'failed')),
  CONSTRAINT "payment_attempt" CHECK ("attempt" >= 1),
  CONSTRAINT "payment_amount" CHECK ("amount_minor" >= 0),
  CONSTRAINT "payment_currency" CHECK ("currency" IN ('RON', 'EUR'))
);
-- O încercare (charge-ul Stripe) se scrie o singură dată, oricâte surse o raportează
CREATE UNIQUE INDEX "payment_idempotency_key_key" ON "billing"."payment" ("idempotency_key");
CREATE INDEX "payment_organization_id_occurred_at_idx"
  ON "billing"."payment" ("organization_id", "occurred_at");
ALTER TABLE "billing"."payment"
  ADD CONSTRAINT "payment_purchase_id_fkey" FOREIGN KEY ("purchase_id")
  REFERENCES "billing"."purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "billing"."stripe_event" (
  "event_id"          VARCHAR(255) NOT NULL,
  "type"              VARCHAR(128) NOT NULL,
  "organization_id"   UUID,
  "stripe_created_at" TIMESTAMPTZ  NOT NULL,
  "received_at"       TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "stripe_event_pkey" PRIMARY KEY ("event_id")
);

CREATE TABLE "billing"."billing_subscription" (
  "organization_id"        UUID         NOT NULL,
  "subscription_id"        UUID         NOT NULL,
  "payment_method"         VARCHAR(8)   NOT NULL DEFAULT 'card',
  "stripe_subscription_id" VARCHAR(255),
  "status"                 VARCHAR(32),
  "current_period_end"     TIMESTAMPTZ,
  "cancel_at_period_end"   BOOLEAN      NOT NULL DEFAULT false,
  "last_event_at"          TIMESTAMPTZ,
  "created_at"             TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"             TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "billing_subscription_pkey" PRIMARY KEY ("organization_id"),
  CONSTRAINT "billing_subscription_payment_method" CHECK ("payment_method" IN ('card', 'manual')),
  CONSTRAINT "billing_subscription_manual" CHECK (
    "payment_method" = 'card' OR "stripe_subscription_id" IS NULL
  )
);
CREATE UNIQUE INDEX "billing_subscription_stripe_subscription_id_key"
  ON "billing"."billing_subscription" ("stripe_subscription_id");

CREATE TABLE "billing"."dispute" (
  "stripe_dispute_id" VARCHAR(255) NOT NULL,
  "organization_id"   UUID         NOT NULL,
  "stripe_charge_id"  VARCHAR(255) NOT NULL,
  "amount_minor"      BIGINT       NOT NULL,
  "currency"          VARCHAR(3)   NOT NULL,
  "reason"            VARCHAR(64)  NOT NULL,
  "status"            VARCHAR(32)  NOT NULL,
  "created_at"        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"        TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "dispute_pkey" PRIMARY KEY ("stripe_dispute_id")
);
CREATE INDEX "dispute_organization_id_idx" ON "billing"."dispute" ("organization_id");

-- Drepturile lui billing_rw: citire și scriere, fără DELETE
GRANT SELECT, INSERT, UPDATE ON
  "billing"."billing_customer", "billing"."payment_method_ref", "billing"."purchase",
  "billing"."payment", "billing"."billing_subscription", "billing"."dispute"
  TO billing_rw;
GRANT SELECT, INSERT ON "billing"."stripe_event" TO billing_rw;

-- RLS: o afacere pe tranzacție (app.organization_id)
ALTER TABLE "billing"."billing_customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing"."payment_method_ref" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing"."purchase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing"."payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing"."stripe_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing"."billing_subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing"."dispute" ENABLE ROW LEVEL SECURITY;

CREATE POLICY billing_rw_billing_customer ON "billing"."billing_customer" TO billing_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY billing_rw_payment_method_ref ON "billing"."payment_method_ref" TO billing_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY billing_rw_purchase ON "billing"."purchase" TO billing_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY billing_rw_payment ON "billing"."payment" TO billing_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
-- Un eveniment al cărui client Stripe nu e al nimănui se înregistrează fără organizație (doar
-- id-ul și tipul), ca să nu fie procesat de două ori
CREATE POLICY billing_rw_stripe_event ON "billing"."stripe_event" TO billing_rw
  USING (
    organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid
    OR (organization_id IS NULL AND NULLIF(current_setting('app.organization_id', true), '') IS NULL)
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid
    OR (organization_id IS NULL AND NULLIF(current_setting('app.organization_id', true), '') IS NULL)
  );
CREATE POLICY billing_rw_billing_subscription ON "billing"."billing_subscription" TO billing_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY billing_rw_dispute ON "billing"."dispute" TO billing_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Webhook-ul vine fără sesiune: organizația se află din clientul Stripe (doar id-ul ei), apoi
-- evenimentul se procesează în contextul ei, sub RLS.
CREATE OR REPLACE FUNCTION "billing".organization_of_customer(p_customer VARCHAR)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT c.organization_id FROM "billing".billing_customer c WHERE c.stripe_customer_id = p_customer;
$$;

-- Job-ul de reconciliere cu Stripe: doar id-urile afacerilor de verificat — cu un card salvat
-- (abonamentul Stripe) sau cu o cumpărare plătită și încă neactivată; fiecare se procesează apoi
-- în contextul ei.
CREATE OR REPLACE FUNCTION "billing".organizations_to_reconcile(p_limit INTEGER)
RETURNS TABLE (organization_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT o.organization_id FROM (
    SELECT p.organization_id FROM "billing".payment_method_ref p
     WHERE p.is_default AND p.detached_at IS NULL
    UNION
    SELECT u.organization_id FROM "billing".purchase u WHERE u.status = 'paid'
  ) o
   ORDER BY o.organization_id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 1000);
$$;

REVOKE ALL ON FUNCTION "billing".organization_of_customer(VARCHAR) FROM PUBLIC;
REVOKE ALL ON FUNCTION "billing".organizations_to_reconcile(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "billing".organization_of_customer(VARCHAR) TO billing_rw;
GRANT EXECUTE ON FUNCTION "billing".organizations_to_reconcile(INTEGER) TO billing_rw;

-- Outbox (Lot 4.1, ARCHITECTURE §11.2): generat de outboxMigrationSql('billing', 'billing_rw') din @ventora/db-kit.

CREATE TABLE "billing"."outbox_events" (
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
  ON "billing"."outbox_events" ("available_at", "occurred_at")
  WHERE "status" = 'pending';

CREATE INDEX "outbox_events_dead_idx"
  ON "billing"."outbox_events" ("failed_at")
  WHERE "status" = 'dead';

-- Idempotența consumatorilor (D4-1 = a): un rând per (consumator, eveniment), scris în aceeași
-- tranzacție cu efectul consumatorului.
CREATE TABLE "billing"."processed_events" (
  "consumer"        VARCHAR(128) NOT NULL,
  "event_id"        UUID         NOT NULL,
  "organization_id" UUID         NOT NULL,
  "processed_at"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "processed_events_pkey" PRIMARY KEY ("consumer", "event_id")
);

GRANT SELECT, INSERT, UPDATE ON "billing"."outbox_events" TO billing_rw;
GRANT SELECT, INSERT ON "billing"."processed_events" TO billing_rw;
REVOKE DELETE ON "billing"."outbox_events" FROM billing_rw;
REVOKE UPDATE, DELETE ON "billing"."processed_events" FROM billing_rw;

ALTER TABLE "billing"."outbox_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing"."processed_events" ENABLE ROW LEVEL SECURITY;

CREATE POLICY billing_rw_outbox_events ON "billing"."outbox_events"
  TO billing_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY billing_rw_processed_events ON "billing"."processed_events"
  TO billing_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE OR REPLACE FUNCTION "billing".outbox_pending(p_limit INTEGER)
RETURNS TABLE (event_id UUID, organization_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT e.event_id, e.organization_id
    FROM "billing".outbox_events e
   WHERE e.status = 'pending'
     AND e.available_at <= now()
   ORDER BY e.available_at, e.occurred_at, e.event_id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 100);
$$;

CREATE OR REPLACE FUNCTION "billing".outbox_dead_letters(p_limit INTEGER)
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
    FROM "billing".outbox_events e
   WHERE e.status = 'dead'
   ORDER BY e.failed_at DESC, e.event_id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 500);
$$;

REVOKE ALL ON FUNCTION "billing".outbox_pending(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION "billing".outbox_dead_letters(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "billing".outbox_pending(INTEGER) TO billing_rw;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA "billing" TO founder_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION "billing".outbox_dead_letters(INTEGER) TO founder_runtime';
  END IF;
END $$;
