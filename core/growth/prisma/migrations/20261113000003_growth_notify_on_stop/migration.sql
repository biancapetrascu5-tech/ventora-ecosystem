-- Lotul FounderNotifications (S136): „Anunță-mă dacă se oprește din nou” din „Repornește”.
-- Implicit da (bifat în design). Oprirea automată trimite notificarea în clopoțelul Founder și
-- e-mailul echipei doar dacă e bifat; oprirea și repornirea intră oricum în jurnalul Growth.
-- Plus growth.campaign_reach(campaign): câte afaceri au văzut campania în rularea curentă (doar
-- numărul), pentru „Afaceri care o vedeau” din notificarea de oprire automată.
-- Fără rol nou; growth_founder primește UPDATE doar pe coloana nouă, growth_rw EXECUTE pe funcție.

ALTER TABLE "growth"."campaign"
  ADD COLUMN "notify_on_auto_stop" BOOLEAN NOT NULL DEFAULT true;

GRANT UPDATE ("notify_on_auto_stop") ON "growth"."campaign" TO growth_founder;

CREATE OR REPLACE FUNCTION growth.campaign_reach(p_campaign_id UUID)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT count(DISTINCT i.organization_id)
    FROM growth.impression i
    JOIN growth.campaign c ON c.id = i.campaign_id
   WHERE i.campaign_id = p_campaign_id
     AND i.shown_at >= greatest(c.activated_at, now() - INTERVAL '30 days');
$$;

REVOKE ALL ON FUNCTION growth.campaign_reach(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION growth.campaign_reach(UUID) TO growth_rw;
