-- Lot 3.4 — commercial_founder_screens: ce le trebuie ecranelor Founder (FounderApps, FounderPacks,
-- FounderPlans, FounderUsage, FounderDiscounts, FounderBusinesses, „Prezentare”).
--
-- 1. Costul de implementare al unei aplicații (FounderApps, S113): `setup` în application_price,
--    pe monedă, ca la versiunile de plan.
-- 2. D3-23, pe server, indiferent de interfață: o aplicație sau un pachet cu cost de implementare
--    rămâne „la cerere” — comutatorul „direct” e refuzat cât timp există un cost de implementare.
-- 3. Citirile Founder peste toate afacerile (RLS-ul lui commercial_founder vede o singură afacere
--    pe tranzacție), ca SECURITY DEFINER doar pentru founder_runtime, fără date personale:
--      founder_list_subscriptions      → abonamentele vii, pe versiunea în vigoare acum
--      founder_expiring_overrides      → excepțiile active care expiră până la un moment dat
--      founder_list_active_discounts   → toate reducerile active (și cele temporare)
--      founder_usage_daily             → consumul pe zi al unei cote, adunat pe toate afacerile
--      founder_usage_totals            → consumul pe cotă într-un interval, adunat
--      founder_addon_grants_count      → câte pachete s-au cumpărat într-un interval

-- 1. AlterTable: application_price.kind primește `setup`
ALTER TABLE "commercial"."application_price" DROP CONSTRAINT "application_price_kind";
ALTER TABLE "commercial"."application_price"
  ADD CONSTRAINT "application_price_kind" CHECK ("kind" IN ('month', 'year', 'setup'));

-- 2. D3-23: cost de implementare → „la cerere”
CREATE OR REPLACE FUNCTION commercial.application_setup_on_request()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = commercial, pg_catalog
AS $$
BEGIN
  IF TG_TABLE_NAME = 'application' THEN
    IF NEW.activation_mode = 'direct' AND EXISTS (
         SELECT 1 FROM commercial.application_price p
          WHERE p.application_id = NEW.id AND p.kind = 'setup' AND p.amount_minor > 0) THEN
      RAISE EXCEPTION 'application % has a setup cost and stays on request', NEW.id
        USING ERRCODE = 'P0001', HINT = 'setup_cost_on_request';
    END IF;
  ELSIF NEW.kind = 'setup' AND NEW.amount_minor > 0 AND EXISTS (
         SELECT 1 FROM commercial.application a
          WHERE a.id = NEW.application_id AND a.activation_mode = 'direct') THEN
    RAISE EXCEPTION 'application % has a setup cost and stays on request', NEW.application_id
      USING ERRCODE = 'P0001', HINT = 'setup_cost_on_request';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER application_setup_on_request
  BEFORE UPDATE OF "activation_mode" ON "commercial"."application"
  FOR EACH ROW EXECUTE FUNCTION commercial.application_setup_on_request();
CREATE TRIGGER application_price_setup_on_request
  BEFORE INSERT OR UPDATE ON "commercial"."application_price"
  FOR EACH ROW EXECUTE FUNCTION commercial.application_setup_on_request();

CREATE OR REPLACE FUNCTION commercial.addon_setup_on_request()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = commercial, pg_catalog
AS $$
BEGIN
  IF TG_TABLE_NAME = 'addon' THEN
    IF NEW.purchase_mode = 'direct' AND EXISTS (
         SELECT 1 FROM commercial.addon_price p WHERE p.addon_id = NEW.id AND p.setup_minor > 0) THEN
      RAISE EXCEPTION 'add-on % has a setup cost and stays on request', NEW.id
        USING ERRCODE = 'P0001', HINT = 'setup_cost_on_request';
    END IF;
  ELSIF NEW.setup_minor > 0 AND EXISTS (
         SELECT 1 FROM commercial.addon a WHERE a.id = NEW.addon_id AND a.purchase_mode = 'direct') THEN
    RAISE EXCEPTION 'add-on % has a setup cost and stays on request', NEW.addon_id
      USING ERRCODE = 'P0001', HINT = 'setup_cost_on_request';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER addon_setup_on_request
  BEFORE UPDATE OF "purchase_mode" ON "commercial"."addon"
  FOR EACH ROW EXECUTE FUNCTION commercial.addon_setup_on_request();
CREATE TRIGGER addon_price_setup_on_request
  BEFORE INSERT OR UPDATE ON "commercial"."addon_price"
  FOR EACH ROW EXECUTE FUNCTION commercial.addon_setup_on_request();

-- FounderPacks: „Se plătește” (o dată / lunar) se poate schimba din dialogul de editare; pachetele
-- deja acordate își păstrează valabilitatea lor (addon_grant.recurring).
GRANT UPDATE ("validity") ON "commercial"."addon" TO commercial_founder;

-- 3. Citirile Founder peste toate afacerile

-- Abonamentele vii, cu versiunea în vigoare acum (ultima mutare deja aplicată, altfel versiunea
-- abonamentului), planul ei, prețul pe moneda și periodicitatea abonamentului și mutarea programată.
CREATE OR REPLACE FUNCTION commercial.founder_list_subscriptions()
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
    JOIN commercial.plan_version v ON v.id = cur.version_now
    JOIN commercial.plan p ON p.id = v.plan_id
    LEFT JOIN LATERAL (
      SELECT c.effective_at, c.to_version_id FROM commercial.subscription_change c
       WHERE c.subscription_id = cur.id AND c.canceled_at IS NULL AND c.effective_at > now()
       ORDER BY c.effective_at LIMIT 1
    ) pend ON true
   ORDER BY cur.organization_id;
$$;

-- „Prezentare” (ARCHITECTURE §8.5): excepțiile active care expiră până la p_until.
CREATE OR REPLACE FUNCTION commercial.founder_expiring_overrides(p_until TIMESTAMPTZ)
RETURNS TABLE (
  id                    UUID,
  organization_id       UUID,
  kind                  VARCHAR(8),
  quota_key             VARCHAR(128),
  feature_key           VARCHAR(128),
  limit_value           BIGINT,
  expires_at            TIMESTAMPTZ,
  created_by_founder_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT o.id, o.organization_id, o.kind, o.quota_key, o.feature_key, o.limit_value, o.expires_at,
         o.created_by_founder_id
    FROM commercial.override o
   WHERE o.ended_at IS NULL AND o.expires_at > now() AND o.expires_at <= p_until
   ORDER BY o.expires_at, o.id;
$$;

-- „Reduceri” → „Toate active”: și reducerile temporare (founder_list_forever_discounts rămâne
-- pentru cele permanente).
CREATE OR REPLACE FUNCTION commercial.founder_list_active_discounts()
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
  duration                    VARCHAR(16),
  duration_months             SMALLINT,
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
         d.addon_grant_id, d.kind, d.percent_off, d.amount_off_minor, d.currency, d.duration,
         d.duration_months, d.reason, d.created_by_founder_id, d.created_at
    FROM commercial.discount d
   WHERE d.ended_at IS NULL
   ORDER BY d.created_at, d.id;
$$;

-- FounderUsage: consumul pe zi al unei cote (confirmat minus rambursat), în fusul platformei,
-- adunat pe toate afacerile — doar cifre, fără afaceri.
CREATE OR REPLACE FUNCTION commercial.founder_usage_daily(
  p_quota_key VARCHAR(128), p_from TIMESTAMPTZ, p_to TIMESTAMPTZ
)
RETURNS TABLE (day DATE, amount BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT (e.created_at AT TIME ZONE 'Europe/Bucharest')::date AS day,
         sum(CASE WHEN e.kind = 'commit' THEN e.amount ELSE -e.amount END)::bigint
    FROM commercial.usage_event e
   WHERE e.quota_key = p_quota_key AND e.kind IN ('commit', 'refund')
     AND e.created_at >= p_from AND e.created_at < p_to
   GROUP BY 1
   ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION commercial.founder_usage_totals(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (quota_key VARCHAR(128), amount BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT e.quota_key,
         sum(CASE WHEN e.kind = 'commit' THEN e.amount ELSE -e.amount END)::bigint
    FROM commercial.usage_event e
   WHERE e.kind IN ('commit', 'refund') AND e.created_at >= p_from AND e.created_at < p_to
   GROUP BY 1
   ORDER BY 1;
$$;

-- „Pachete în plus vândute”: pachetele cumpărate (nu cele acordate din Founder) într-un interval.
CREATE OR REPLACE FUNCTION commercial.founder_addon_grants_count(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT count(*)::bigint FROM commercial.addon_grant g
   WHERE g.source = 'purchase' AND g.created_at >= p_from AND g.created_at < p_to;
$$;

REVOKE ALL ON FUNCTION commercial.founder_list_subscriptions() FROM PUBLIC;
REVOKE ALL ON FUNCTION commercial.founder_expiring_overrides(TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION commercial.founder_list_active_discounts() FROM PUBLIC;
REVOKE ALL ON FUNCTION commercial.founder_usage_daily(VARCHAR, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION commercial.founder_usage_totals(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION commercial.founder_addon_grants_count(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION commercial.founder_list_subscriptions() TO founder_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION commercial.founder_expiring_overrides(TIMESTAMPTZ) TO founder_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION commercial.founder_list_active_discounts() TO founder_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION commercial.founder_usage_daily(VARCHAR, TIMESTAMPTZ, TIMESTAMPTZ) TO founder_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION commercial.founder_usage_totals(TIMESTAMPTZ, TIMESTAMPTZ) TO founder_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION commercial.founder_addon_grants_count(TIMESTAMPTZ, TIMESTAMPTZ) TO founder_runtime';
  END IF;
END $$;
