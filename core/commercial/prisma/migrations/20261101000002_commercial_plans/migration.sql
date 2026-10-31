-- Lot 3.2 — commercial_plans: planurile, versiunile (imuabile după publicare), pachetele în plus și
-- comutatorul „direct / la cerere” pe aplicație (ARCHITECTURE §8.5, FAZA-3 D3-2, D3-3, D3-7, D3-9).
--
-- Roluri (D-DB-1 varianta C):
--   commercial_rw      (app_runtime)     → SELECT pe catalog (planuri, versiuni, pachete)
--   commercial_founder (founder_runtime) → scrie catalogul din Founder; fără DELETE pe planuri,
--                                          versiuni și pachete (componentele unei ciorne se rescriu)
-- Prețurile: în unități minore (bani / cenți), pe monedă (RON, EUR), fără conversie (D3-2).
-- Prețul anual se introduce direct (D3-3); costul de implementare e `setup`.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'commercial_founder') THEN
    CREATE ROLE commercial_founder NOLOGIN NOINHERIT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    EXECUTE 'GRANT commercial_founder TO founder_runtime';
  END IF;
END $$;

GRANT USAGE ON SCHEMA "commercial" TO commercial_founder;

-- AlterTable: D3-9, „direct / la cerere” pe aplicație (implicit la cerere: cele care cer configurare)
ALTER TABLE "commercial"."application" ADD COLUMN     "activation_mode" VARCHAR(16) NOT NULL DEFAULT 'on_request';
ALTER TABLE "commercial"."application"
  ADD CONSTRAINT "application_activation_mode" CHECK ("activation_mode" IN ('direct', 'on_request'));

-- CreateTable
CREATE TABLE "commercial"."plan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "created_by_founder_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "plan_code_format" CHECK ("code" ~ '^[a-z][a-z0-9-]*$')
);

-- CreateTable
CREATE TABLE "commercial"."plan_version" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "plan_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "published_at" TIMESTAMPTZ,
    "published_by_founder_id" UUID,
    "created_by_founder_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_version_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "plan_version_number" CHECK ("version_number" >= 1),
    CONSTRAINT "plan_version_published_by" CHECK (("published_at" IS NULL) = ("published_by_founder_id" IS NULL))
);

-- CreateTable
CREATE TABLE "commercial"."plan_version_application" (
    "plan_version_id" UUID NOT NULL,
    "application_id" VARCHAR(64) NOT NULL,

    CONSTRAINT "plan_version_application_pkey" PRIMARY KEY ("plan_version_id","application_id")
);

-- CreateTable
CREATE TABLE "commercial"."plan_version_feature" (
    "plan_version_id" UUID NOT NULL,
    "feature_key" VARCHAR(128) NOT NULL,

    CONSTRAINT "plan_version_feature_pkey" PRIMARY KEY ("plan_version_id","feature_key")
);

-- CreateTable: limit_value NULL = nelimitat (D3-14); o cotă fără rând nu e inclusă (limita 0)
CREATE TABLE "commercial"."plan_version_quota" (
    "plan_version_id" UUID NOT NULL,
    "quota_key" VARCHAR(128) NOT NULL,
    "limit_value" BIGINT,

    CONSTRAINT "plan_version_quota_pkey" PRIMARY KEY ("plan_version_id","quota_key"),
    CONSTRAINT "plan_version_quota_limit" CHECK ("limit_value" IS NULL OR "limit_value" >= 0)
);

-- CreateTable
CREATE TABLE "commercial"."plan_version_price" (
    "plan_version_id" UUID NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "amount_minor" BIGINT NOT NULL,

    CONSTRAINT "plan_version_price_pkey" PRIMARY KEY ("plan_version_id","currency","kind"),
    CONSTRAINT "plan_version_price_currency" CHECK ("currency" IN ('RON', 'EUR')),
    CONSTRAINT "plan_version_price_kind" CHECK ("kind" IN ('month', 'year', 'setup')),
    CONSTRAINT "plan_version_price_amount" CHECK ("amount_minor" >= 0)
);

-- CreateTable: validity current_month (până la următoarea resetare) / monthly (linie recurentă, D3-7)
CREATE TABLE "commercial"."addon" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "quota_key" VARCHAR(128) NOT NULL,
    "quantity" BIGINT NOT NULL,
    "validity" VARCHAR(16) NOT NULL,
    "purchase_mode" VARCHAR(16) NOT NULL DEFAULT 'on_request',
    "sales_stopped_at" TIMESTAMPTZ,
    "created_by_founder_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "addon_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "addon_code_format" CHECK ("code" ~ '^[a-z][a-z0-9-]*$'),
    CONSTRAINT "addon_quantity" CHECK ("quantity" > 0),
    CONSTRAINT "addon_validity" CHECK ("validity" IN ('current_month', 'monthly')),
    CONSTRAINT "addon_purchase_mode" CHECK ("purchase_mode" IN ('direct', 'on_request'))
);

-- CreateTable
CREATE TABLE "commercial"."addon_price" (
    "addon_id" UUID NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "setup_minor" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "addon_price_pkey" PRIMARY KEY ("addon_id","currency"),
    CONSTRAINT "addon_price_currency" CHECK ("currency" IN ('RON', 'EUR')),
    CONSTRAINT "addon_price_amount" CHECK ("amount_minor" >= 0 AND "setup_minor" >= 0)
);

-- CreateTable
CREATE TABLE "commercial"."addon_eligible_plan" (
    "addon_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,

    CONSTRAINT "addon_eligible_plan_pkey" PRIMARY KEY ("addon_id","plan_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plan_code_key" ON "commercial"."plan"("code");

-- CreateIndex
CREATE UNIQUE INDEX "plan_version_plan_id_version_number_key" ON "commercial"."plan_version"("plan_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "addon_code_key" ON "commercial"."addon"("code");

-- CreateIndex
CREATE INDEX "addon_quota_key_idx" ON "commercial"."addon"("quota_key");

-- AddForeignKey
ALTER TABLE "commercial"."plan_version" ADD CONSTRAINT "plan_version_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "commercial"."plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial"."plan_version_application" ADD CONSTRAINT "plan_version_application_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "commercial"."plan_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial"."plan_version_application" ADD CONSTRAINT "plan_version_application_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "commercial"."application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial"."plan_version_feature" ADD CONSTRAINT "plan_version_feature_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "commercial"."plan_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial"."plan_version_feature" ADD CONSTRAINT "plan_version_feature_feature_key_fkey" FOREIGN KEY ("feature_key") REFERENCES "commercial"."feature_key"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial"."plan_version_quota" ADD CONSTRAINT "plan_version_quota_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "commercial"."plan_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial"."plan_version_quota" ADD CONSTRAINT "plan_version_quota_quota_key_fkey" FOREIGN KEY ("quota_key") REFERENCES "commercial"."quota_key"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial"."plan_version_price" ADD CONSTRAINT "plan_version_price_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "commercial"."plan_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial"."addon" ADD CONSTRAINT "addon_quota_key_fkey" FOREIGN KEY ("quota_key") REFERENCES "commercial"."quota_key"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial"."addon_price" ADD CONSTRAINT "addon_price_addon_id_fkey" FOREIGN KEY ("addon_id") REFERENCES "commercial"."addon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial"."addon_eligible_plan" ADD CONSTRAINT "addon_eligible_plan_addon_id_fkey" FOREIGN KEY ("addon_id") REFERENCES "commercial"."addon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial"."addon_eligible_plan" ADD CONSTRAINT "addon_eligible_plan_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "commercial"."plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Imutabilitate (§8.5): o versiune publicată nu se mai schimbă și nu se șterge, nici componentele
-- ei — inclusiv pentru rolul postgres. Singura schimbare permisă pe o ciornă e publicarea.
CREATE OR REPLACE FUNCTION commercial.refuse_published_version_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = commercial, pg_catalog
AS $$
BEGIN
  IF OLD.published_at IS NOT NULL THEN
    RAISE EXCEPTION 'plan_version % is published and cannot be changed', OLD.id
      USING ERRCODE = 'P0001', HINT = 'published_plan_version_immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER plan_version_immutable
  BEFORE UPDATE OR DELETE ON "commercial"."plan_version"
  FOR EACH ROW EXECUTE FUNCTION commercial.refuse_published_version_change();

CREATE OR REPLACE FUNCTION commercial.refuse_published_component_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = commercial, pg_catalog
AS $$
DECLARE
  v_version UUID;
BEGIN
  v_version := CASE WHEN TG_OP = 'DELETE' THEN OLD.plan_version_id ELSE NEW.plan_version_id END;
  IF EXISTS (SELECT 1 FROM commercial.plan_version WHERE id = v_version AND published_at IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND EXISTS (
       SELECT 1 FROM commercial.plan_version WHERE id = OLD.plan_version_id AND published_at IS NOT NULL))
  THEN
    RAISE EXCEPTION 'plan_version % is published and cannot be changed', v_version
      USING ERRCODE = 'P0001', HINT = 'published_plan_version_immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER plan_version_application_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON "commercial"."plan_version_application"
  FOR EACH ROW EXECUTE FUNCTION commercial.refuse_published_component_change();
CREATE TRIGGER plan_version_feature_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON "commercial"."plan_version_feature"
  FOR EACH ROW EXECUTE FUNCTION commercial.refuse_published_component_change();
CREATE TRIGGER plan_version_quota_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON "commercial"."plan_version_quota"
  FOR EACH ROW EXECUTE FUNCTION commercial.refuse_published_component_change();
CREATE TRIGGER plan_version_price_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON "commercial"."plan_version_price"
  FOR EACH ROW EXECUTE FUNCTION commercial.refuse_published_component_change();

-- Grants
REVOKE ALL ON ALL TABLES IN SCHEMA "commercial" FROM PUBLIC;

GRANT SELECT ON
  "commercial"."plan", "commercial"."plan_version", "commercial"."plan_version_application",
  "commercial"."plan_version_feature", "commercial"."plan_version_quota",
  "commercial"."plan_version_price", "commercial"."addon", "commercial"."addon_price",
  "commercial"."addon_eligible_plan"
  TO commercial_rw;

-- Founder: registrul doar citit, plus comutatorul aplicației (sincronizarea nu îl atinge)
GRANT SELECT ON "commercial"."application", "commercial"."feature_key", "commercial"."quota_key"
  TO commercial_founder;
GRANT UPDATE ("activation_mode") ON "commercial"."application" TO commercial_founder;

GRANT SELECT, INSERT, UPDATE ON
  "commercial"."plan", "commercial"."plan_version", "commercial"."addon"
  TO commercial_founder;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "commercial"."plan_version_application", "commercial"."plan_version_feature",
  "commercial"."plan_version_quota", "commercial"."plan_version_price",
  "commercial"."addon_price", "commercial"."addon_eligible_plan"
  TO commercial_founder;
