-- Lot 3.4 — commercial_bundles: modelul comercial D3-24 (decizia fondatoarei, 31.10.2026).
--
-- 1. Aplicațiile la bucată: pe lângă implementare (`setup`) și mentenanță (lunar / anual, în
--    application_price), fiecare aplicație are LIMITELE EI INCLUSE (application_quota), de ex.
--    EasyBook aduce 1.000 booking.appointments pe lună. NULL = nelimitat. Comutatorul „direct /
--    la cerere” rămâne (cu implementare → la cerere, D3-23).
-- 2. Planul devine „Bundle” (doar în texte; tabelele rămân plan / plan_version): mai multe
--    aplicații la preț mai bun, cu limite incluse. Bundle-ul are o perioadă de vânzare
--    (available_from / available_until) și „Oprește vânzarea” (sales_stopped_at). Cine l-a
--    cumpărat îl păstrează la versiunea și prețul lui (versiunile rămân imuabile; regula de 30
--    de zile rămâne).
-- 3. Abonamentul afacerii nu mai cere un bundle: plan_version_id devine opțional — o afacere poate
--    avea un bundle, aplicații la bucată (subscription_application), sau ambele.
-- 4. Locurile în echipă incluse în orice cont: setarea globală `included_members` (implicit 3),
--    setabilă din Founder; se adună cu cele din bundle și cu pachetele.
-- 5. Dreptul efectiv (getEffectiveEntitlements, în cod): locurile incluse + versiunea bundle-ului +
--    limitele aplicațiilor la bucată + pachete + excepții (excepția înlocuiește, pachetele se adaugă).

-- 1. CreateTable: limitele incluse ale unei aplicații la bucată
CREATE TABLE "commercial"."application_quota" (
    "application_id" VARCHAR(64) NOT NULL,
    "quota_key" VARCHAR(128) NOT NULL,
    "limit_value" BIGINT,

    CONSTRAINT "application_quota_pkey" PRIMARY KEY ("application_id","quota_key"),
    CONSTRAINT "application_quota_limit" CHECK ("limit_value" IS NULL OR "limit_value" >= 0)
);

ALTER TABLE "commercial"."application_quota" ADD CONSTRAINT "application_quota_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "commercial"."application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commercial"."application_quota" ADD CONSTRAINT "application_quota_quota_key_fkey" FOREIGN KEY ("quota_key") REFERENCES "commercial"."quota_key"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

REVOKE ALL ON "commercial"."application_quota" FROM PUBLIC;
GRANT SELECT ON "commercial"."application_quota" TO commercial_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON "commercial"."application_quota" TO commercial_founder;

-- 2. AlterTable: perioada de vânzare a unui bundle
ALTER TABLE "commercial"."plan" ADD COLUMN "available_from" DATE;
ALTER TABLE "commercial"."plan" ADD COLUMN "available_until" DATE;
ALTER TABLE "commercial"."plan" ADD COLUMN "sales_stopped_at" TIMESTAMPTZ;
ALTER TABLE "commercial"."plan"
  ADD CONSTRAINT "plan_sale_period" CHECK (
    "available_from" IS NULL OR "available_until" IS NULL OR "available_until" >= "available_from"
  );

-- 3. AlterTable: abonamentul fără bundle (doar aplicații la bucată)
ALTER TABLE "commercial"."subscription" ALTER COLUMN "plan_version_id" DROP NOT NULL;

CREATE OR REPLACE FUNCTION commercial.subscription_version_published()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = commercial, pg_catalog
AS $$
BEGIN
  IF NEW.plan_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM commercial.plan_version WHERE id = NEW.plan_version_id AND published_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'plan_version % is not published', NEW.plan_version_id USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

-- Un bundle nou se vinde doar în perioada lui și cât nu e oprit; cine îl are deja îl păstrează
-- (verificarea e doar la crearea abonamentului).
CREATE OR REPLACE FUNCTION commercial.subscription_bundle_on_sale()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = commercial, pg_catalog
AS $$
BEGIN
  IF NEW.plan_version_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM commercial.plan_version v JOIN commercial.plan p ON p.id = v.plan_id
     WHERE v.id = NEW.plan_version_id
       AND (p.sales_stopped_at IS NOT NULL
            OR (p.available_from IS NOT NULL AND p.available_from > NEW.started_on)
            OR (p.available_until IS NOT NULL AND p.available_until < NEW.started_on))
  ) THEN
    RAISE EXCEPTION 'bundle of plan_version % is not on sale', NEW.plan_version_id
      USING ERRCODE = 'P0001', HINT = 'bundle_not_on_sale';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER subscription_bundle_on_sale
  BEFORE INSERT ON "commercial"."subscription"
  FOR EACH ROW EXECUTE FUNCTION commercial.subscription_bundle_on_sale();

-- 4. CreateTable: setările globale ale modelului comercial
CREATE TABLE "commercial"."setting" (
    "key" VARCHAR(64) NOT NULL,
    "int_value" BIGINT NOT NULL,
    "updated_by_founder_id" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "setting_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "setting_key" CHECK ("key" IN ('included_members')),
    CONSTRAINT "setting_value" CHECK ("int_value" >= 0)
);

INSERT INTO "commercial"."setting" ("key", "int_value") VALUES ('included_members', 3)
  ON CONFLICT ("key") DO NOTHING;

REVOKE ALL ON "commercial"."setting" FROM PUBLIC;
GRANT SELECT ON "commercial"."setting" TO commercial_rw;
GRANT SELECT, UPDATE ON "commercial"."setting" TO commercial_founder;

-- Lista abonamentelor din Founder: și cele fără bundle (LEFT JOIN)
DROP FUNCTION IF EXISTS commercial.founder_list_subscriptions();
CREATE FUNCTION commercial.founder_list_subscriptions()
RETURNS TABLE (
  organization_id   UUID,
  subscription_id   UUID,
  plan_id           UUID,
  plan_code         VARCHAR(64),
  plan_name         VARCHAR(128),
  plan_version_id   UUID,
  version_number    INTEGER,
  status            VARCHAR(16),
  "interval"        VARCHAR(8),
  currency          VARCHAR(3),
  started_on        DATE,
  trial_ends_at     TIMESTAMPTZ,
  price_minor       BIGINT,
  pending_effective_at TIMESTAMPTZ,
  pending_to_version_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  WITH cur AS (
    SELECT s.*,
           COALESCE((SELECT c.to_version_id FROM commercial.subscription_change c
                      WHERE c.subscription_id = s.id AND c.canceled_at IS NULL AND c.effective_at <= now()
                      ORDER BY c.effective_at DESC, c.created_at DESC LIMIT 1), s.plan_version_id) AS version_now
      FROM commercial.subscription s
     WHERE s.canceled_at IS NULL
  )
  SELECT cur.organization_id, cur.id, p.id, p.code, p.name, v.id, v.version_number, cur.status,
         cur.interval, cur.currency, cur.started_on, cur.trial_ends_at,
         (SELECT pr.amount_minor FROM commercial.plan_version_price pr
           WHERE pr.plan_version_id = v.id AND pr.currency = cur.currency AND pr.kind = cur.interval),
         pend.effective_at, pend.to_version_id
    FROM cur
    LEFT JOIN commercial.plan_version v ON v.id = cur.version_now
    LEFT JOIN commercial.plan p ON p.id = v.plan_id
    LEFT JOIN LATERAL (
      SELECT c.effective_at, c.to_version_id FROM commercial.subscription_change c
       WHERE c.subscription_id = cur.id AND c.canceled_at IS NULL AND c.effective_at > now()
       ORDER BY c.effective_at LIMIT 1
    ) pend ON true
   ORDER BY cur.organization_id;
$$;

REVOKE ALL ON FUNCTION commercial.founder_list_subscriptions() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION commercial.founder_list_subscriptions() TO founder_runtime';
  END IF;
END $$;
