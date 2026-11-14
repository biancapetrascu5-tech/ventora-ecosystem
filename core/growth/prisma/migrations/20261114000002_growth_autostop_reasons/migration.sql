-- Lot 5.9f (P22, S136 FounderNotifications; deciziile fondatoarei din 14.11.2026): oprirea automată
-- și la plângeri, la bugetul atins și la eroare, plus blocarea repornirii timp de 24 de ore după a
-- doua oprire automată în 7 zile. Până acum Growth oprea doar la deranj (Lot 5.8).
--
--   1. interaction.kind primește `complaint`: plângerea unui proprietar față de o recomandare
--      (doar de la proprietar: verifică core/growth, baza nu vede rolurile). Butonul din
--      RecommendationCard: NECESITĂ DESIGN;
--   2. offer.budget_conversions: bugetul ofertei (perioade de probă sau reduceri), comun tuturor
--      campaniilor ei; gol = fără buget. Câmpul din GrowthOfferEditor: NECESITĂ DESIGN;
--   3. campaign.stop_reason primește `auto_complaints`, `auto_budget`, `auto_error`;
--   4. growth.campaign_auto_stop: istoricul opririlor automate (scris doar de funcțiile de mai jos),
--      pentru blocarea de 24 de ore;
--   5. funcțiile de oprire, câte una pe motiv; deranjul, plângerile și bugetul se recalculează în
--      bază și opresc doar peste prag; eroarea vine din job (verificarea citește core/commercial
--      prin contractul lui; baza growth nu are drepturi pe schema commercial). Oprirea e direcția
--      sigură: o eroare raportată greșit oprește o campanie, nu pornește nimic;
--   6. garda campaniei: repornirea e refuzată cât timp bugetul ofertei e atins și în cele 24 de ore
--      de după a doua oprire automată în 7 zile.
--
-- Fără rol nou. growth_rw: EXECUTE pe cele 3 funcții noi de oprire și pe cele 2 numărători citite
-- de job (doar numere). growth_founder: UPDATE pe offer.budget_conversions și EXECUTE pe cele 2
-- funcții citite de gardă la repornire.

-- ── 1. Plângerea ───────────────────────────────────────────────────────────────────────────────
ALTER TABLE "growth"."interaction"
  DROP CONSTRAINT "interaction_kind_check",
  ADD CONSTRAINT "interaction_kind_check"
    CHECK ("kind" IN ('click', 'dismiss', 'snooze', 'recommend', 'undo', 'opt_out', 'complaint'));
-- the job counts the complaints of the last 24 h at every run: only those rows
CREATE INDEX "interaction_complaint_created_at_idx"
  ON "growth"."interaction" ("created_at") WHERE "kind" = 'complaint';

-- ── 2. Bugetul ofertei ─────────────────────────────────────────────────────────────────────────
ALTER TABLE "growth"."offer" ADD COLUMN "budget_conversions" INTEGER;
ALTER TABLE "growth"."offer"
  ADD CONSTRAINT "offer_budget_check"
    CHECK ("budget_conversions" IS NULL OR "budget_conversions" BETWEEN 1 AND 1000000);
GRANT UPDATE ("budget_conversions") ON "growth"."offer" TO growth_founder;
-- the budget counts the offer's conversions (all its campaigns)
CREATE INDEX "conversion_offer_id_idx" ON "growth"."conversion" ("offer_id");

-- ── 3. Motivele de oprire ──────────────────────────────────────────────────────────────────────
ALTER TABLE "growth"."campaign"
  DROP CONSTRAINT "campaign_stop_check",
  ADD CONSTRAINT "campaign_stop_check" CHECK (
    ("status" = 'stopped') = ("stopped_at" IS NOT NULL)
    AND ("status" = 'stopped') = ("stop_reason" IS NOT NULL)
    AND ("stop_reason" IS NULL OR "stop_reason" IN ('manual', 'auto_disturbance',
         'auto_complaints', 'auto_budget', 'auto_error'))
    AND (("stop_reason" = 'manual') = ("stopped_by_founder_id" IS NOT NULL))
  );

-- ── 4. Istoricul opririlor automate ────────────────────────────────────────────────────────────
CREATE TABLE "growth"."campaign_auto_stop" (
  "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
  "campaign_id" UUID         NOT NULL,
  "reason"      VARCHAR(32)  NOT NULL,
  "stopped_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "campaign_auto_stop_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "campaign_auto_stop_campaign_id_fkey" FOREIGN KEY ("campaign_id")
    REFERENCES "growth"."campaign" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "campaign_auto_stop_reason_check"
    CHECK ("reason" IN ('auto_disturbance', 'auto_complaints', 'auto_budget', 'auto_error'))
);
CREATE INDEX "campaign_auto_stop_campaign_id_stopped_at_idx"
  ON "growth"."campaign_auto_stop" ("campaign_id", "stopped_at");

-- nimeni nu citește sau scrie direct: doar funcțiile SECURITY DEFINER de mai jos
ALTER TABLE "growth"."campaign_auto_stop" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "growth"."campaign_auto_stop" FROM PUBLIC;

-- ── 5. Oprirea ─────────────────────────────────────────────────────────────────────────────────
-- Comună tuturor motivelor: oprește campania activă și scrie istoricul. Nu e dată nimănui.
CREATE OR REPLACE FUNCTION growth.auto_stop_campaign(
  p_campaign_id UUID, p_reason VARCHAR, p_note TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  UPDATE growth.campaign
     SET status = 'stopped', stop_reason = p_reason, stop_note = p_note
   WHERE id = p_campaign_id AND status = 'active';
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  INSERT INTO growth.campaign_auto_stop (campaign_id, reason) VALUES (p_campaign_id, p_reason);
  RETURN true;
END $$;

-- Deranjul (Lot 5.8), neschimbat ca prag; acum scrie și istoricul.
CREATE OR REPLACE FUNCTION growth.auto_stop_if_disturbing(p_campaign_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_impressions BIGINT;
  v_disturbing  BIGINT;
  v_rate        NUMERIC;
BEGIN
  SELECT d.impressions, d.dismissals + d.opt_outs INTO v_impressions, v_disturbing
    FROM growth.campaign_disturbance() d WHERE d.campaign_id = p_campaign_id;
  IF v_impressions IS NULL OR v_impressions < 100 THEN
    RETURN NULL;
  END IF;
  v_rate := v_disturbing::numeric / v_impressions;
  IF v_rate <= 0.05 THEN
    RETURN NULL;
  END IF;
  IF NOT growth.auto_stop_campaign(p_campaign_id, 'auto_disturbance',
       format('%s / %s (%s %%)', v_disturbing, v_impressions, round(v_rate * 100, 1))) THEN
    RETURN NULL;
  END IF;
  RETURN v_rate;
END $$;

-- Plângerile pe oferta campaniei: afaceri distincte în ultimele 24 de ore, de la pornirea rulării
-- curente a campaniei (o repornire nu moștenește plângerile vechi). Toate campaniile ofertei văd
-- aceleași plângeri, deci se opresc împreună („Growth a oprit oferta …”).
CREATE OR REPLACE FUNCTION growth.offer_complaints(p_campaign_id UUID)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT count(DISTINCT x.organization_id)
    FROM growth.campaign c
    JOIN growth.interaction x
      ON x.kind = 'complaint'
     AND x.created_at >= greatest(c.activated_at, now() - INTERVAL '24 hours')
    JOIN growth.impression i ON i.id = x.impression_id AND i.offer_id = c.offer_id
   WHERE c.id = p_campaign_id AND c.status = 'active';
$$;

-- Returnează numărul de afaceri când a oprit campania, NULL altfel. Pragul: 3 (S136).
CREATE OR REPLACE FUNCTION growth.auto_stop_if_complaints(p_campaign_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_n BIGINT;
BEGIN
  v_n := growth.offer_complaints(p_campaign_id);
  IF v_n IS NULL OR v_n < 3 THEN
    RETURN NULL;
  END IF;
  IF NOT growth.auto_stop_campaign(p_campaign_id, 'auto_complaints',
       format('%s plângeri în 24 h', v_n)) THEN
    RETURN NULL;
  END IF;
  RETURN v_n;
END $$;

-- Bugetul ofertei: conversiile ei (toate campaniile, de la început) față de buget. NULL = fără buget.
CREATE OR REPLACE FUNCTION growth.offer_budget_used(p_offer_id UUID)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE WHEN o.budget_conversions IS NULL THEN NULL
              ELSE (SELECT count(*) FROM growth.conversion v WHERE v.offer_id = o.id) END
    FROM growth.offer o WHERE o.id = p_offer_id;
$$;

CREATE OR REPLACE FUNCTION growth.offer_budget_reached(p_offer_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT coalesce(growth.offer_budget_used(o.id) >= o.budget_conversions, false)
    FROM growth.offer o WHERE o.id = p_offer_id;
$$;

-- Returnează bugetul când a oprit campania, NULL altfel.
CREATE OR REPLACE FUNCTION growth.auto_stop_if_over_budget(p_campaign_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_offer  UUID;
  v_budget INTEGER;
BEGIN
  SELECT c.offer_id, o.budget_conversions INTO v_offer, v_budget
    FROM growth.campaign c JOIN growth.offer o ON o.id = c.offer_id
   WHERE c.id = p_campaign_id AND c.status = 'active';
  IF v_budget IS NULL OR NOT growth.offer_budget_reached(v_offer) THEN
    RETURN NULL;
  END IF;
  IF NOT growth.auto_stop_campaign(p_campaign_id, 'auto_budget',
       format('%s / %s', growth.offer_budget_used(v_offer), v_budget)) THEN
    RETURN NULL;
  END IF;
  RETURN v_budget;
END $$;

-- Eroarea: oferta nu se mai potrivește cu modelul comercial. Verificarea o face job-ul prin
-- contractul core/commercial; baza acceptă motivul (codul lui), doar pentru o campanie activă.
CREATE OR REPLACE FUNCTION growth.auto_stop_for_error(p_campaign_id UUID, p_code VARCHAR)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF p_code IS NULL OR p_code !~ '^[a-z][a-z_]{2,40}$' THEN
    RAISE EXCEPTION 'auto_stop_for_error: invalid code' USING ERRCODE = '22023';
  END IF;
  RETURN growth.auto_stop_campaign(p_campaign_id, 'auto_error', p_code);
END $$;

-- ── 6. Blocarea repornirii ─────────────────────────────────────────────────────────────────────
-- Până când nu se poate reporni: 24 de ore după ultima oprire automată, dacă a mai fost una în
-- cele 7 zile dinaintea ei. NULL = se poate reporni.
CREATE OR REPLACE FUNCTION growth.campaign_restart_blocked_until(p_campaign_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  WITH last AS (
    SELECT s.stopped_at FROM growth.campaign_auto_stop s
     WHERE s.campaign_id = p_campaign_id ORDER BY s.stopped_at DESC LIMIT 1
  )
  SELECT last.stopped_at + INTERVAL '24 hours'
    FROM last
   WHERE last.stopped_at + INTERVAL '24 hours' > now()
     AND EXISTS (SELECT 1 FROM growth.campaign_auto_stop p
                  WHERE p.campaign_id = p_campaign_id
                    AND p.stopped_at < last.stopped_at
                    AND p.stopped_at >= last.stopped_at - INTERVAL '7 days');
$$;

-- Garda din Lotul 5.8, plus: repornirea (stopped → active) e refuzată cât timp bugetul ofertei e
-- atins sau repornirea e blocată. HINT-ul spune ecranului de ce.
CREATE OR REPLACE FUNCTION growth.campaign_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_offer_type   VARCHAR(32);
  v_offer_status VARCHAR(16);
  v_blocked      TIMESTAMPTZ;
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
    NEW.activated_at := NULL;
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
  IF NEW.status = 'active' AND OLD.status = 'stopped' THEN
    IF growth.offer_budget_reached(NEW.offer_id) THEN
      RAISE EXCEPTION 'campaign %: the offer''s budget is reached', OLD.id
        USING ERRCODE = 'P0001', HINT = 'budget_reached';
    END IF;
    v_blocked := growth.campaign_restart_blocked_until(OLD.id);
    IF v_blocked IS NOT NULL THEN
      RAISE EXCEPTION 'campaign %: restart blocked until % (2nd automatic stop in 7 days)',
        OLD.id, v_blocked USING ERRCODE = 'P0001', HINT = 'restart_blocked';
    END IF;
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
    -- a new run: the disturbance is counted from here (P22: the restart is manual)
    NEW.activated_at := now();
    NEW.stopped_at := NULL;
    NEW.stop_reason := NULL;
    NEW.stop_note := NULL;
    NEW.stopped_by_founder_id := NULL;
  ELSIF NEW.status = 'stopped' AND OLD.status = 'active' THEN
    NEW.stopped_at := now();
    NEW.activated_at := OLD.activated_at;
  ELSIF NEW.status = OLD.status THEN
    NEW.published_at := OLD.published_at;
    NEW.activated_at := OLD.activated_at;
    NEW.stopped_at := OLD.stopped_at;
    NEW.stop_reason := OLD.stop_reason;
    NEW.stop_note := OLD.stop_note;
    NEW.stopped_by_founder_id := OLD.stopped_by_founder_id;
  END IF;
  RETURN NEW;
END $$;

-- ── Drepturile pe funcții ──────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION growth.auto_stop_campaign(UUID, VARCHAR, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth.offer_complaints(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth.auto_stop_if_complaints(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth.offer_budget_used(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth.offer_budget_reached(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth.auto_stop_if_over_budget(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth.auto_stop_for_error(UUID, VARCHAR) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth.campaign_restart_blocked_until(UUID) FROM PUBLIC;

-- the job (growth_rw): the three new stops, and the two numbers it reads first (numbers only, no
-- businesses, like campaign_disturbance), so a run with nothing to stop does one cheap query
GRANT EXECUTE ON FUNCTION growth.offer_complaints(UUID) TO growth_rw;
GRANT EXECUTE ON FUNCTION growth.offer_budget_used(UUID) TO growth_rw;
GRANT EXECUTE ON FUNCTION growth.auto_stop_if_complaints(UUID) TO growth_rw;
GRANT EXECUTE ON FUNCTION growth.auto_stop_if_over_budget(UUID) TO growth_rw;
GRANT EXECUTE ON FUNCTION growth.auto_stop_for_error(UUID, VARCHAR) TO growth_rw;
-- Founder (growth_founder): the guard calls these at „Repornește”
GRANT EXECUTE ON FUNCTION growth.offer_budget_reached(UUID) TO growth_founder;
GRANT EXECUTE ON FUNCTION growth.campaign_restart_blocked_until(UUID) TO growth_founder;
