-- Lot 5.8 (FAZA-5; P22 / D-GRW-13; D5-8; D5-11): the automatic stop of a campaign whose
-- disturbance rate goes above 5 %.
--
--   disturbance rate = („Nu mă interesează” + opt-outs from the preferences) / impressions, per
--   campaign, over its current run: since it was (re)started, at most the last 30 days, and only
--   once it has at least 100 impressions (D5-8).
--
-- Changes:
--   1. interaction.kind gets `opt_out`: the person turned off „Recomandări Ventora”; the Hub
--      records it on her latest proactive impression (core/growth recordOptOut), so it counts for
--      the campaign she saw;
--   2. campaign.activated_at: when the current run started (set by the guard at every start and
--      manual restart), so a restart does not inherit the old run's disturbance;
--   3. growth.campaign_disturbance(): the numbers per active campaign, for the job and Founder ·
--      Rezultate (numbers only, no businesses, no people);
--   4. growth.auto_stop_if_disturbing(campaign): the only way the Hub role (growth_rw, the job)
--      can stop a campaign. It recomputes the rate itself and stops only above the threshold, with
--      `auto_disturbance`; a restart stays manual (Founder, P22).
--
-- No new role and no new table grant: growth_rw gets EXECUTE on the two functions only.

ALTER TABLE "growth"."interaction"
  DROP CONSTRAINT "interaction_kind_check",
  ADD CONSTRAINT "interaction_kind_check"
    CHECK ("kind" IN ('click', 'dismiss', 'snooze', 'recommend', 'undo', 'opt_out'));

ALTER TABLE "growth"."campaign" ADD COLUMN "activated_at" TIMESTAMPTZ;
UPDATE "growth"."campaign" SET "activated_at" = "published_at" WHERE "status" <> 'draft';
ALTER TABLE "growth"."campaign"
  ADD CONSTRAINT "campaign_activated_check" CHECK (("status" = 'draft') = ("activated_at" IS NULL));

-- The guard of Lot 5.5, plus activated_at: set at every start, kept otherwise.
CREATE OR REPLACE FUNCTION growth.campaign_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_offer_type   VARCHAR(32);
  v_offer_status VARCHAR(16);
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

-- The numbers of the current run of every active campaign (P22, D5-8). Numbers only.
CREATE OR REPLACE FUNCTION growth.campaign_disturbance()
RETURNS TABLE (
  campaign_id  UUID,
  run_since    TIMESTAMPTZ,
  impressions  BIGINT,
  dismissals   BIGINT,
  opt_outs     BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT c.id,
         greatest(c.activated_at, now() - INTERVAL '30 days') AS run_since,
         (SELECT count(*) FROM growth.impression i
           WHERE i.campaign_id = c.id
             AND i.shown_at >= greatest(c.activated_at, now() - INTERVAL '30 days')),
         (SELECT count(*) FROM growth.interaction x JOIN growth.impression i ON i.id = x.impression_id
           WHERE i.campaign_id = c.id AND x.kind = 'dismiss'
             AND x.created_at >= greatest(c.activated_at, now() - INTERVAL '30 days')),
         (SELECT count(*) FROM growth.interaction x JOIN growth.impression i ON i.id = x.impression_id
           WHERE i.campaign_id = c.id AND x.kind = 'opt_out'
             AND x.created_at >= greatest(c.activated_at, now() - INTERVAL '30 days'))
    FROM growth.campaign c
   WHERE c.status = 'active';
$$;

-- The automatic stop: recomputes and stops only above the threshold (5 %, at least 100
-- impressions). Returns the rate when it stopped the campaign, NULL otherwise.
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
  UPDATE growth.campaign
     SET status = 'stopped', stop_reason = 'auto_disturbance',
         stop_note = format('%s / %s (%s %%)', v_disturbing, v_impressions, round(v_rate * 100, 1))
   WHERE id = p_campaign_id AND status = 'active';
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN v_rate;
END $$;

REVOKE ALL ON FUNCTION growth.campaign_disturbance() FROM PUBLIC;
REVOKE ALL ON FUNCTION growth.auto_stop_if_disturbing(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION growth.campaign_disturbance() TO growth_rw, growth_founder;
GRANT EXECUTE ON FUNCTION growth.auto_stop_if_disturbing(UUID) TO growth_rw;
