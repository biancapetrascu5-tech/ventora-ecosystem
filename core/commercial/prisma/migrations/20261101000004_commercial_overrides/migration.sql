-- Lot 3.2 — commercial_overrides: excepțiile (D-COM-8, P17) și perioadele de probă (D3-5).
--
-- Excepția: termen obligatoriu, cel mult 12 luni de la creare sau de la ultima prelungire; se
-- încheie, nu se șterge; o cotă (limita înlocuiește limita versiunii, NULL = nelimitat) sau o
-- funcționalitate. Regulile sunt în baza de date, deci valabile indiferent de interfață: momentul
-- creării și al prelungirii le pune trigger-ul, nu cel care scrie.
-- Perioada de probă: pe o aplicație sau o funcționalitate (14 zile, fără card, din UpgradeDialog,
-- Lotul 3.8); pe tot abonamentul e `subscription.trial_ends_at`, doar din Founder.

-- CreateTable
CREATE TABLE "commercial"."override" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "quota_key" VARCHAR(128),
    "feature_key" VARCHAR(128),
    "limit_value" BIGINT,
    "reason" TEXT NOT NULL,
    "created_by_founder_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "extended_at" TIMESTAMPTZ,
    "extended_by_founder_id" UUID,
    "ended_at" TIMESTAMPTZ,
    "ended_by_founder_id" UUID,

    CONSTRAINT "override_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "override_kind" CHECK (
      ("kind" = 'quota' AND "quota_key" IS NOT NULL AND "feature_key" IS NULL)
      OR ("kind" = 'feature' AND "feature_key" IS NOT NULL AND "quota_key" IS NULL AND "limit_value" IS NULL)
    ),
    CONSTRAINT "override_limit" CHECK ("limit_value" IS NULL OR "limit_value" >= 0),
    CONSTRAINT "override_reason" CHECK (length(btrim("reason")) > 0),
    CONSTRAINT "override_expires_after_start" CHECK ("expires_at" > COALESCE("extended_at", "created_at")),
    CONSTRAINT "override_at_most_12_months" CHECK (
      "expires_at" <= COALESCE("extended_at", "created_at") + INTERVAL '12 months'
    ),
    CONSTRAINT "override_extended_by" CHECK (("extended_at" IS NULL) = ("extended_by_founder_id" IS NULL)),
    CONSTRAINT "override_ended_by" CHECK (("ended_at" IS NULL) = ("ended_by_founder_id" IS NULL))
);

-- CreateTable
CREATE TABLE "commercial"."trial" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "application_id" VARCHAR(64),
    "feature_key" VARCHAR(128),
    "source" VARCHAR(8) NOT NULL,
    "started_by" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMPTZ NOT NULL,
    "ended_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trial_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "trial_kind" CHECK (
      ("kind" = 'application' AND "application_id" IS NOT NULL AND "feature_key" IS NULL)
      OR ("kind" = 'feature' AND "feature_key" IS NOT NULL AND "application_id" IS NULL)
    ),
    CONSTRAINT "trial_source" CHECK ("source" IN ('owner', 'founder')),
    CONSTRAINT "trial_period" CHECK ("ends_at" > "starts_at")
);

-- CreateIndex
CREATE INDEX "override_organization_id_idx" ON "commercial"."override"("organization_id");

-- CreateIndex
CREATE INDEX "trial_organization_id_idx" ON "commercial"."trial"("organization_id");

-- O singură perioadă de probă în curs pe aceeași aplicație / funcționalitate
CREATE UNIQUE INDEX "trial_one_open_application"
  ON "commercial"."trial"("organization_id", "application_id")
  WHERE "ended_at" IS NULL AND "kind" = 'application';
CREATE UNIQUE INDEX "trial_one_open_feature"
  ON "commercial"."trial"("organization_id", "feature_key")
  WHERE "ended_at" IS NULL AND "kind" = 'feature';

-- AddForeignKey (din raportul 3.1: valorile Founder doar pentru cheile din registru)
ALTER TABLE "commercial"."override" ADD CONSTRAINT "override_quota_key_fkey" FOREIGN KEY ("quota_key") REFERENCES "commercial"."quota_key"("key") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial"."override" ADD CONSTRAINT "override_feature_key_fkey" FOREIGN KEY ("feature_key") REFERENCES "commercial"."feature_key"("key") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial"."trial" ADD CONSTRAINT "trial_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "commercial"."application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial"."trial" ADD CONSTRAINT "trial_feature_key_fkey" FOREIGN KEY ("feature_key") REFERENCES "commercial"."feature_key"("key") ON DELETE SET NULL ON UPDATE CASCADE;

-- Excepția: creată acum; după creare se poate doar prelungi (expires_at, cu momentul pus aici)
-- sau încheia, o singură dată. Restul câmpurilor rămân cum au fost scrise.
CREATE OR REPLACE FUNCTION commercial.override_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = commercial, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.extended_at := NULL;
    NEW.extended_by_founder_id := NULL;
    NEW.ended_at := NULL;
    NEW.ended_by_founder_id := NULL;
    RETURN NEW;
  END IF;
  IF OLD.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'override % has ended', OLD.id USING ERRCODE = 'P0001';
  END IF;
  IF (NEW.organization_id, NEW.kind, NEW.quota_key, NEW.feature_key, NEW.limit_value, NEW.reason,
      NEW.created_by_founder_id, NEW.created_at)
     IS DISTINCT FROM
     (OLD.organization_id, OLD.kind, OLD.quota_key, OLD.feature_key, OLD.limit_value, OLD.reason,
      OLD.created_by_founder_id, OLD.created_at) THEN
    RAISE EXCEPTION 'override % can only be extended or ended', OLD.id USING ERRCODE = 'P0001';
  END IF;
  IF NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    NEW.extended_at := now();
  ELSE
    NEW.extended_at := OLD.extended_at;
    NEW.extended_by_founder_id := OLD.extended_by_founder_id;
  END IF;
  IF NEW.ended_at IS NOT NULL THEN
    NEW.ended_at := now();
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER override_guard
  BEFORE INSERT OR UPDATE ON "commercial"."override"
  FOR EACH ROW EXECUTE FUNCTION commercial.override_guard();

-- RLS
ALTER TABLE "commercial"."override" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commercial"."trial" ENABLE ROW LEVEL SECURITY;

CREATE POLICY commercial_rw_override ON "commercial"."override" FOR SELECT TO commercial_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY commercial_rw_trial ON "commercial"."trial" FOR SELECT TO commercial_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY commercial_founder_override ON "commercial"."override" TO commercial_founder
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY commercial_founder_trial ON "commercial"."trial" TO commercial_founder
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

GRANT SELECT ON "commercial"."override", "commercial"."trial" TO commercial_rw;
GRANT SELECT, INSERT, UPDATE ON "commercial"."override", "commercial"."trial" TO commercial_founder;
