-- Lot 3.5 — commercial_purchases: ce cumpără owner-ul din Hub, plătit cu cardul (core/billing),
-- se activează în modelul comercial (ARCHITECTURE §8.6, D-COM-6):
--   - un pachet (addon_grant, source = 'purchase');
--   - o aplicație la bucată pe „Direct” (subscription_application, source = 'purchase', D3-24).
-- Fiecare rând cumpărat poartă id-ul cumpărării din billing (purchase_id, unic): activarea vine o
-- singură dată, chiar dacă reușita plății sosește și din dialog, și din webhook.
--
-- commercial_rw (app_runtime) primește INSERT doar pe aceste rânduri, în contextul organizației
-- (RLS WITH CHECK): fără Founder, cu purchase_id. Celelalte scrieri rămân la commercial_founder.

-- 1. addon_grant: cumpărarea
ALTER TABLE "commercial"."addon_grant" ADD COLUMN "purchase_id" UUID;
CREATE UNIQUE INDEX "addon_grant_purchase_id_key" ON "commercial"."addon_grant"("purchase_id");
ALTER TABLE "commercial"."addon_grant"
  ADD CONSTRAINT "addon_grant_purchase" CHECK (("source" = 'purchase') = ("purchase_id" IS NOT NULL));

CREATE POLICY commercial_rw_addon_grant_purchase ON "commercial"."addon_grant"
  FOR INSERT TO commercial_rw
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid
    AND "source" = 'purchase' AND "purchase_id" IS NOT NULL AND "created_by_founder_id" IS NULL
    AND "ended_at" IS NULL
  );
GRANT INSERT ON "commercial"."addon_grant" TO commercial_rw;

-- 2. subscription_application: aplicația cumpărată (fără Founder)
ALTER TABLE "commercial"."subscription_application" ALTER COLUMN "created_by_founder_id" DROP NOT NULL;
ALTER TABLE "commercial"."subscription_application" DROP CONSTRAINT "subscription_application_source";
ALTER TABLE "commercial"."subscription_application"
  ADD CONSTRAINT "subscription_application_source" CHECK ("source" IN ('founder', 'request', 'purchase'));
ALTER TABLE "commercial"."subscription_application" ADD COLUMN "purchase_id" UUID;
CREATE UNIQUE INDEX "subscription_application_purchase_id_key"
  ON "commercial"."subscription_application"("purchase_id");
ALTER TABLE "commercial"."subscription_application"
  ADD CONSTRAINT "subscription_application_purchase" CHECK (
    (("source" = 'purchase') = ("purchase_id" IS NOT NULL))
    AND (("source" = 'purchase') = ("created_by_founder_id" IS NULL))
  );

CREATE POLICY commercial_rw_subscription_application_purchase ON "commercial"."subscription_application"
  FOR INSERT TO commercial_rw
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid
    AND "source" = 'purchase' AND "purchase_id" IS NOT NULL AND "created_by_founder_id" IS NULL
    AND "ended_at" IS NULL
  );
GRANT INSERT ON "commercial"."subscription_application" TO commercial_rw;
