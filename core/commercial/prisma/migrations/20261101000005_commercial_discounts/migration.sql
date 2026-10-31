-- Lot 3.2 — commercial_discounts (decizia fondatoarei pe raportul 3.2, 31.10.2026, D3-21):
--   application_price         → prețul unei aplicații adăugate la abonament, pe monedă și periodicitate
--   subscription_application  → aplicația adăugată la abonament (D3-9): linie recurentă, ca pachetele
--                               lunare, cu prețul copiat la adăugare
--   discount                  → reducerea pe o afacere: pe tot abonamentul sau pe o linie (o aplicație
--                               adăugată, un pachet lunar); procent 1–100 sau sumă fixă în moneda
--                               afacerii (100% = gratuit); o singură dată / N luni / permanent;
--                               motiv 10–1.000 de caractere; se încheie, nu se șterge
-- Maparea pe Stripe (Lotul 3.5): percent_off / amount_off + currency; duration once / repeating
-- (duration_in_months) / forever; pe abonament → discounts ale abonamentului, pe linie → ale
-- subscription item-ului.

-- CreateTable
CREATE TABLE "commercial"."application_price" (
    "application_id" VARCHAR(64) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "amount_minor" BIGINT NOT NULL,

    CONSTRAINT "application_price_pkey" PRIMARY KEY ("application_id","currency","kind"),
    CONSTRAINT "application_price_currency" CHECK ("currency" IN ('RON', 'EUR')),
    CONSTRAINT "application_price_kind" CHECK ("kind" IN ('month', 'year')),
    CONSTRAINT "application_price_amount" CHECK ("amount_minor" >= 0)
);

-- CreateTable
CREATE TABLE "commercial"."subscription_application" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "application_id" VARCHAR(64) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "interval" VARCHAR(8) NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "source" VARCHAR(16) NOT NULL,
    "starts_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ,
    "created_by_founder_id" UUID NOT NULL,
    "ended_by_founder_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_application_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subscription_application_currency" CHECK ("currency" IN ('RON', 'EUR')),
    CONSTRAINT "subscription_application_interval" CHECK ("interval" IN ('month', 'year')),
    CONSTRAINT "subscription_application_amount" CHECK ("amount_minor" >= 0),
    CONSTRAINT "subscription_application_source" CHECK ("source" IN ('founder', 'request')),
    CONSTRAINT "subscription_application_ended_by" CHECK (("ended_at" IS NULL) = ("ended_by_founder_id" IS NULL))
);

-- CreateTable
CREATE TABLE "commercial"."discount" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "scope" VARCHAR(16) NOT NULL,
    "subscription_application_id" UUID,
    "addon_grant_id" UUID,
    "kind" VARCHAR(8) NOT NULL,
    "percent_off" SMALLINT,
    "amount_off_minor" BIGINT,
    "currency" VARCHAR(3) NOT NULL,
    "duration" VARCHAR(16) NOT NULL,
    "duration_months" SMALLINT,
    "reason" TEXT NOT NULL,
    "created_by_founder_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ,
    "updated_by_founder_id" UUID,
    "ended_at" TIMESTAMPTZ,
    "ended_by_founder_id" UUID,

    CONSTRAINT "discount_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "discount_scope" CHECK (
      ("scope" = 'subscription' AND "subscription_application_id" IS NULL AND "addon_grant_id" IS NULL)
      OR ("scope" = 'application' AND "subscription_application_id" IS NOT NULL AND "addon_grant_id" IS NULL)
      OR ("scope" = 'addon' AND "addon_grant_id" IS NOT NULL AND "subscription_application_id" IS NULL)
    ),
    CONSTRAINT "discount_kind" CHECK (
      ("kind" = 'percent' AND "percent_off" BETWEEN 1 AND 100 AND "amount_off_minor" IS NULL)
      OR ("kind" = 'amount' AND "amount_off_minor" > 0 AND "percent_off" IS NULL)
    ),
    CONSTRAINT "discount_currency" CHECK ("currency" IN ('RON', 'EUR')),
    CONSTRAINT "discount_duration" CHECK (
      ("duration" = 'repeating' AND "duration_months" BETWEEN 1 AND 120)
      OR ("duration" IN ('once', 'forever') AND "duration_months" IS NULL)
    ),
    CONSTRAINT "discount_reason" CHECK (char_length(btrim("reason")) BETWEEN 10 AND 1000),
    CONSTRAINT "discount_updated_by" CHECK (("updated_at" IS NULL) = ("updated_by_founder_id" IS NULL)),
    CONSTRAINT "discount_ended_by" CHECK (("ended_at" IS NULL) = ("ended_by_founder_id" IS NULL))
);

-- CreateIndex
CREATE INDEX "subscription_application_organization_id_idx" ON "commercial"."subscription_application"("organization_id");

-- CreateIndex
CREATE INDEX "discount_organization_id_idx" ON "commercial"."discount"("organization_id");

-- O aplicație o singură dată pe abonament; o singură reducere activă pe țintă
CREATE UNIQUE INDEX "subscription_application_one_open"
  ON "commercial"."subscription_application"("subscription_id", "application_id") WHERE "ended_at" IS NULL;
CREATE UNIQUE INDEX "discount_one_open_on_subscription"
  ON "commercial"."discount"("subscription_id") WHERE "ended_at" IS NULL AND "scope" = 'subscription';
CREATE UNIQUE INDEX "discount_one_open_on_application_line"
  ON "commercial"."discount"("subscription_application_id") WHERE "ended_at" IS NULL;
CREATE UNIQUE INDEX "discount_one_open_on_addon_line"
  ON "commercial"."discount"("addon_grant_id") WHERE "ended_at" IS NULL;

-- AddForeignKey
ALTER TABLE "commercial"."application_price" ADD CONSTRAINT "application_price_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "commercial"."application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial"."subscription_application" ADD CONSTRAINT "subscription_application_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "commercial"."subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial"."subscription_application" ADD CONSTRAINT "subscription_application_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "commercial"."application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial"."discount" ADD CONSTRAINT "discount_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "commercial"."subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial"."discount" ADD CONSTRAINT "discount_subscription_application_id_fkey" FOREIGN KEY ("subscription_application_id") REFERENCES "commercial"."subscription_application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial"."discount" ADD CONSTRAINT "discount_addon_grant_id_fkey" FOREIGN KEY ("addon_grant_id") REFERENCES "commercial"."addon_grant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reducerea, pe server, indiferent de interfață: creată acum, pe abonamentul ei și în moneda lui;
-- linia e a aceluiași abonament (o aplicație adăugată sau un pachet lunar, încă active). După
-- creare se pot schimba doar valoarea și motivul (cu momentul pus aici) sau se poate încheia, o
-- singură dată.
CREATE OR REPLACE FUNCTION commercial.discount_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = commercial, pg_catalog
AS $$
DECLARE
  v_currency VARCHAR(3);
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.updated_at := NULL;
    NEW.updated_by_founder_id := NULL;
    NEW.ended_at := NULL;
    NEW.ended_by_founder_id := NULL;
    SELECT currency INTO v_currency FROM commercial.subscription
     WHERE id = NEW.subscription_id AND organization_id = NEW.organization_id AND canceled_at IS NULL;
    IF v_currency IS NULL THEN
      RAISE EXCEPTION 'no live subscription % for this organization', NEW.subscription_id USING ERRCODE = 'P0001';
    END IF;
    IF NEW.currency <> v_currency THEN
      RAISE EXCEPTION 'a discount is in the subscription currency (%)', v_currency USING ERRCODE = 'P0001';
    END IF;
    IF NEW.scope = 'application' AND NOT EXISTS (
      SELECT 1 FROM commercial.subscription_application
       WHERE id = NEW.subscription_application_id AND subscription_id = NEW.subscription_id
         AND ended_at IS NULL) THEN
      RAISE EXCEPTION 'the application line is not on this subscription' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.scope = 'addon' AND NOT EXISTS (
      SELECT 1 FROM commercial.addon_grant
       WHERE id = NEW.addon_grant_id AND subscription_id = NEW.subscription_id
         AND recurring AND ended_at IS NULL) THEN
      RAISE EXCEPTION 'the add-on is not a monthly line of this subscription' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'discount % has ended', OLD.id USING ERRCODE = 'P0001';
  END IF;
  IF (NEW.organization_id, NEW.subscription_id, NEW.scope, NEW.subscription_application_id,
      NEW.addon_grant_id, NEW.kind, NEW.currency, NEW.duration, NEW.duration_months,
      NEW.created_by_founder_id, NEW.created_at)
     IS DISTINCT FROM
     (OLD.organization_id, OLD.subscription_id, OLD.scope, OLD.subscription_application_id,
      OLD.addon_grant_id, OLD.kind, OLD.currency, OLD.duration, OLD.duration_months,
      OLD.created_by_founder_id, OLD.created_at) THEN
    RAISE EXCEPTION 'discount % can only change its value and reason, or end', OLD.id
      USING ERRCODE = 'P0001';
  END IF;
  IF (NEW.percent_off, NEW.amount_off_minor, NEW.reason)
     IS DISTINCT FROM (OLD.percent_off, OLD.amount_off_minor, OLD.reason) THEN
    NEW.updated_at := now();
  ELSE
    NEW.updated_at := OLD.updated_at;
    NEW.updated_by_founder_id := OLD.updated_by_founder_id;
  END IF;
  IF NEW.ended_at IS NOT NULL THEN
    NEW.ended_at := now();
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER discount_guard
  BEFORE INSERT OR UPDATE ON "commercial"."discount"
  FOR EACH ROW EXECUTE FUNCTION commercial.discount_guard();

-- Founder: lista reducerilor permanente active, în toate afacerile (RLS-ul lui commercial_founder
-- vede o singură afacere pe tranzacție). Doar founder_runtime, fără date personale.
CREATE OR REPLACE FUNCTION commercial.founder_list_forever_discounts()
RETURNS TABLE (
  id                          UUID,
  organization_id             UUID,
  subscription_id             UUID,
  scope                       VARCHAR(16),
  subscription_application_id UUID,
  addon_grant_id              UUID,
  kind                        VARCHAR(8),
  percent_off                 SMALLINT,
  amount_off_minor            BIGINT,
  currency                    VARCHAR(3),
  reason                      TEXT,
  created_by_founder_id       UUID,
  created_at                  TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT d.id, d.organization_id, d.subscription_id, d.scope, d.subscription_application_id,
         d.addon_grant_id, d.kind, d.percent_off, d.amount_off_minor, d.currency, d.reason,
         d.created_by_founder_id, d.created_at
    FROM commercial.discount d
   WHERE d.duration = 'forever' AND d.ended_at IS NULL
   ORDER BY d.created_at, d.id;
$$;

REVOKE ALL ON FUNCTION commercial.founder_list_forever_discounts() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION commercial.founder_list_forever_discounts() TO founder_runtime';
  END IF;
END $$;

-- RLS
ALTER TABLE "commercial"."subscription_application" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commercial"."discount" ENABLE ROW LEVEL SECURITY;

CREATE POLICY commercial_rw_subscription_application ON "commercial"."subscription_application"
  FOR SELECT TO commercial_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY commercial_rw_discount ON "commercial"."discount" FOR SELECT TO commercial_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY commercial_founder_subscription_application ON "commercial"."subscription_application"
  TO commercial_founder
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY commercial_founder_discount ON "commercial"."discount" TO commercial_founder
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Grants
REVOKE ALL ON "commercial"."application_price", "commercial"."subscription_application",
  "commercial"."discount" FROM PUBLIC;
GRANT SELECT ON "commercial"."application_price", "commercial"."subscription_application",
  "commercial"."discount" TO commercial_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON "commercial"."application_price" TO commercial_founder;
GRANT SELECT, INSERT, UPDATE ON "commercial"."subscription_application", "commercial"."discount"
  TO commercial_founder;
