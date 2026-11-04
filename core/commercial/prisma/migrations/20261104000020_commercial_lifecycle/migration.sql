-- Lot 3.8 — commercial_lifecycle: restul ciclului de viață comercial (FAZA-3 „Lot 3.8”, deciziile
-- fondatoarei din 04.11.2026).
--
--   1. trial (D3-5): perioada de probă de 14 zile, fără card, pornită de owner din Hub pentru o
--      aplicație; oprirea la termen (datele rămân), reminderul cu 3 zile înainte, o singură probă
--      de owner pe aplicație.
--   2. dunning (D3-12): neplata abonamentului — după reîncercările Stripe (card) sau după scadență
--      (transfer, D3-11), 14 zile de grație, apoi doar citire și export, până la plată sau până
--      când Founder închide cazul.
--   3. setup_request (D3-23 / D3-24, stările din FounderSetupRequests, S121): cererea cu
--      implementare — cerută → acceptată de client → confirmată de echipă → plătită → în lucru →
--      pornită, plus anulată (înainte de plată) / rambursată (după plată, până la pornire).
--
-- Fără roluri noi. Regulile stau în baza de date (trigger-e), deci valabile indiferent de
-- interfață: momentele le pune serverul, trecerile permise depind de rol (current_user după
-- SET LOCAL ROLE: commercial_rw = Hub / job-uri / billing, commercial_founder = echipa).
-- Nicio ștergere.

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Perioada de probă (D3-5)
-- ════════════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE "commercial"."trial" ADD COLUMN "end_reason" VARCHAR(16);
ALTER TABLE "commercial"."trial" ADD COLUMN "reminder_sent_at" TIMESTAMPTZ;

-- expired: s-a oprit singură la termen; converted: aplicația a fost cumpărată / adăugată în probă;
-- canceled: oprită înainte (owner-ul sau echipa). Rândurile încheiate înainte de 3.8 rămân fără motiv.
ALTER TABLE "commercial"."trial" ADD CONSTRAINT "trial_end_reason" CHECK (
  "end_reason" IS NULL OR ("ended_at" IS NOT NULL AND "end_reason" IN ('expired', 'converted', 'canceled'))
);
-- Din Hub: doar pe o aplicație (pe o funcționalitate și pe tot abonamentul rămân la Founder)
ALTER TABLE "commercial"."trial" ADD CONSTRAINT "trial_owner_application" CHECK (
  "source" <> 'owner' OR "kind" = 'application'
);

-- O singură probă pornită de owner pe aceeași aplicație, oricând (încheiată sau nu)
CREATE UNIQUE INDEX "trial_owner_once_per_application"
  ON "commercial"."trial"("organization_id", "application_id")
  WHERE "source" = 'owner';

-- Pe server: proba de owner începe acum și ține 14 zile; după creare se poate doar trimite
-- reminderul (o dată) și încheia (o dată, cu motiv). Momentele le pune trigger-ul.
CREATE OR REPLACE FUNCTION commercial.trial_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = commercial, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.ended_at := NULL;
    NEW.end_reason := NULL;
    NEW.reminder_sent_at := NULL;
    IF NEW.source = 'owner' THEN
      NEW.starts_at := now();
      NEW.ends_at := now() + INTERVAL '14 days';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'trial % has ended', OLD.id USING ERRCODE = 'P0001', HINT = 'trial_ended';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['ended_at', 'end_reason', 'reminder_sent_at'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['ended_at', 'end_reason', 'reminder_sent_at']) THEN
    RAISE EXCEPTION 'trial % can only be reminded or ended', OLD.id
      USING ERRCODE = 'P0001', HINT = 'trial_immutable';
  END IF;
  IF OLD.reminder_sent_at IS NOT NULL THEN
    NEW.reminder_sent_at := OLD.reminder_sent_at;
  ELSIF NEW.reminder_sent_at IS NOT NULL THEN
    NEW.reminder_sent_at := now();
  END IF;
  IF NEW.ended_at IS NOT NULL THEN
    IF NEW.end_reason IS NULL THEN
      RAISE EXCEPTION 'trial % needs a reason to end', OLD.id
        USING ERRCODE = 'P0001', HINT = 'trial_end_reason';
    END IF;
    -- „expired” doar după termen
    IF NEW.end_reason = 'expired' AND OLD.ends_at > now() THEN
      RAISE EXCEPTION 'trial % has not reached its end', OLD.id
        USING ERRCODE = 'P0001', HINT = 'trial_not_due';
    END IF;
    NEW.ended_at := now();
  ELSIF NEW.end_reason IS NOT NULL THEN
    RAISE EXCEPTION 'trial % has a reason but no end', OLD.id USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trial_guard
  BEFORE INSERT OR UPDATE ON "commercial"."trial"
  FOR EACH ROW EXECUTE FUNCTION commercial.trial_guard();

-- commercial_rw (Hub, owner-ul): pornește o probă de owner pe o aplicație; job-ul încheie probele
-- ajunse la termen și trimite reminderul, tot în contextul fiecărei afaceri.
CREATE POLICY commercial_rw_trial_insert ON "commercial"."trial"
  FOR INSERT TO commercial_rw
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid
    AND "source" = 'owner' AND "kind" = 'application' AND "ended_at" IS NULL
  );
CREATE POLICY commercial_rw_trial_update ON "commercial"."trial"
  FOR UPDATE TO commercial_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
GRANT INSERT, UPDATE ON "commercial"."trial" TO commercial_rw;

-- Job-ul: probele de încheiat acum (termenul a trecut) — doar id-ul și afacerea
CREATE OR REPLACE FUNCTION commercial.trials_due(p_limit INTEGER)
RETURNS TABLE (id UUID, organization_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT t.id, t.organization_id
    FROM commercial.trial t
   WHERE t.ended_at IS NULL AND t.ends_at <= now()
   ORDER BY t.ends_at, t.id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 500);
$$;

-- Job-ul: reminderul `commercial.trial.ending`, cu 3 zile înainte, o singură dată
CREATE OR REPLACE FUNCTION commercial.trials_to_remind(p_limit INTEGER)
RETURNS TABLE (id UUID, organization_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT t.id, t.organization_id
    FROM commercial.trial t
   WHERE t.ended_at IS NULL
     AND t.reminder_sent_at IS NULL
     AND t.ends_at > now()
     AND t.ends_at <= now() + INTERVAL '3 days'
   ORDER BY t.ends_at, t.id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 500);
$$;

REVOKE ALL ON FUNCTION commercial.trials_due(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION commercial.trials_to_remind(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.trials_due(INTEGER) TO commercial_rw;
GRANT EXECUTE ON FUNCTION commercial.trials_to_remind(INTEGER) TO commercial_rw;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 2. Neplata (D3-12)
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- Un caz de neplată pe afacere la un moment dat. overdue_since: când s-au terminat reîncercările
-- Stripe (card) sau când a trecut scadența (transfer); grația de 14 zile se socotește de aici, pe
-- server. read_only_at: când afacerea a trecut pe doar citire și export (job-ul, după grație).
-- Cazul se închide la plată (paid), de echipă (founder, cu motiv) sau la anularea abonamentului
-- (canceled). source_ref: factura Stripe (in_…) sau factura de transfer din billing (id-ul ei).
CREATE TABLE "commercial"."dunning" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "cause" VARCHAR(16) NOT NULL,
    "source_ref" VARCHAR(255) NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "overdue_since" TIMESTAMPTZ NOT NULL,
    "grace_ends_at" TIMESTAMPTZ NOT NULL,
    "read_only_at" TIMESTAMPTZ,
    "resolved_at" TIMESTAMPTZ,
    "resolution" VARCHAR(16),
    "resolved_by_founder_id" UUID,
    "resolve_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunning_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dunning_cause" CHECK ("cause" IN ('card', 'transfer')),
    CONSTRAINT "dunning_amount" CHECK ("amount_minor" >= 0),
    CONSTRAINT "dunning_currency" CHECK ("currency" IN ('RON', 'EUR')),
    CONSTRAINT "dunning_grace" CHECK ("grace_ends_at" >= "overdue_since"),
    CONSTRAINT "dunning_read_only" CHECK ("read_only_at" IS NULL OR "read_only_at" >= "grace_ends_at"),
    CONSTRAINT "dunning_resolved" CHECK (
      ("resolved_at" IS NULL) = ("resolution" IS NULL)
      AND ("resolution" IS NULL OR "resolution" IN ('paid', 'founder', 'canceled'))
    ),
    CONSTRAINT "dunning_resolved_by" CHECK (
      (("resolution" = 'founder') = ("resolved_by_founder_id" IS NOT NULL))
      AND (
        ("resolution" = 'founder' AND char_length(btrim("resolve_reason")) BETWEEN 10 AND 1000)
        OR ("resolution" IS DISTINCT FROM 'founder' AND "resolve_reason" IS NULL)
      )
    )
);

CREATE INDEX "dunning_organization_id_idx" ON "commercial"."dunning"("organization_id");

-- Un singur caz deschis pe afacere
CREATE UNIQUE INDEX "dunning_one_open_per_org"
  ON "commercial"."dunning"("organization_id") WHERE "resolved_at" IS NULL;
-- Aceeași factură deschide cel mult un caz (webhook-ul și job-ul pot veni de mai multe ori)
CREATE UNIQUE INDEX "dunning_source_key"
  ON "commercial"."dunning"("organization_id", "cause", "source_ref");
-- Job-ul de grație
CREATE INDEX "dunning_grace_due_idx"
  ON "commercial"."dunning"("grace_ends_at") WHERE "resolved_at" IS NULL AND "read_only_at" IS NULL;

ALTER TABLE "commercial"."dunning" ADD CONSTRAINT "dunning_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "commercial"."subscription"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION commercial.dunning_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = commercial, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.overdue_since > now() THEN
      RAISE EXCEPTION 'dunning cannot start in the future' USING ERRCODE = 'P0001', HINT = 'dunning_future';
    END IF;
    NEW.created_at := now();
    NEW.grace_ends_at := NEW.overdue_since + INTERVAL '14 days';
    NEW.read_only_at := NULL;
    NEW.resolved_at := NULL;
    NEW.resolution := NULL;
    NEW.resolved_by_founder_id := NULL;
    NEW.resolve_reason := NULL;
    RETURN NEW;
  END IF;
  IF OLD.resolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'dunning % is resolved', OLD.id USING ERRCODE = 'P0001', HINT = 'dunning_resolved';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['read_only_at', 'resolved_at', 'resolution', 'resolved_by_founder_id', 'resolve_reason'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['read_only_at', 'resolved_at', 'resolution', 'resolved_by_founder_id', 'resolve_reason']) THEN
    RAISE EXCEPTION 'dunning % can only go read-only or be resolved', OLD.id
      USING ERRCODE = 'P0001', HINT = 'dunning_immutable';
  END IF;
  -- doar citire: o singură dată, după grație; nu se mai întoarce (doar închiderea cazului)
  IF OLD.read_only_at IS NOT NULL THEN
    NEW.read_only_at := OLD.read_only_at;
  ELSIF NEW.read_only_at IS NOT NULL THEN
    IF now() < OLD.grace_ends_at THEN
      RAISE EXCEPTION 'dunning % is still in grace', OLD.id USING ERRCODE = 'P0001', HINT = 'dunning_in_grace';
    END IF;
    NEW.read_only_at := now();
  END IF;
  IF NEW.resolution IS NOT NULL THEN
    -- echipa închide doar ca „founder”; Hub-ul, job-urile și billing doar ca „paid” / „canceled”
    IF current_user = 'commercial_founder' AND NEW.resolution <> 'founder' THEN
      RAISE EXCEPTION 'Founder resolves dunning % only as founder', OLD.id USING ERRCODE = 'P0001';
    END IF;
    IF current_user = 'commercial_rw' AND NEW.resolution = 'founder' THEN
      RAISE EXCEPTION 'dunning % can be resolved as founder only by Founder', OLD.id USING ERRCODE = 'P0001';
    END IF;
    NEW.resolved_at := now();
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER dunning_guard
  BEFORE INSERT OR UPDATE ON "commercial"."dunning"
  FOR EACH ROW EXECUTE FUNCTION commercial.dunning_guard();

ALTER TABLE "commercial"."dunning" ENABLE ROW LEVEL SECURITY;

CREATE POLICY commercial_rw_dunning ON "commercial"."dunning" TO commercial_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY commercial_founder_dunning ON "commercial"."dunning" TO commercial_founder
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

REVOKE ALL ON "commercial"."dunning" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON "commercial"."dunning" TO commercial_rw;
GRANT SELECT, UPDATE ON "commercial"."dunning" TO commercial_founder;

-- Job-ul: cazurile a căror grație s-a terminat și care nu sunt încă pe doar citire
CREATE OR REPLACE FUNCTION commercial.dunning_due(p_limit INTEGER)
RETURNS TABLE (id UUID, organization_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT d.id, d.organization_id
    FROM commercial.dunning d
   WHERE d.resolved_at IS NULL AND d.read_only_at IS NULL AND d.grace_ends_at <= now()
   ORDER BY d.grace_ends_at, d.id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 500);
$$;

-- Founder · Prezentare: cazurile deschise din toate afacerile (fără date personale)
CREATE OR REPLACE FUNCTION commercial.founder_list_dunning(p_limit INTEGER)
RETURNS TABLE (
  id              UUID,
  organization_id UUID,
  cause           VARCHAR(16),
  amount_minor    BIGINT,
  currency        VARCHAR(3),
  overdue_since   TIMESTAMPTZ,
  grace_ends_at   TIMESTAMPTZ,
  read_only_at    TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT d.id, d.organization_id, d.cause, d.amount_minor, d.currency, d.overdue_since,
         d.grace_ends_at, d.read_only_at
    FROM commercial.dunning d
   WHERE d.resolved_at IS NULL
   ORDER BY d.grace_ends_at, d.id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 500);
$$;

REVOKE ALL ON FUNCTION commercial.dunning_due(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION commercial.founder_list_dunning(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.dunning_due(INTEGER) TO commercial_rw;
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION commercial.founder_list_dunning(INTEGER) TO founder_runtime';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 3. Cererile cu implementare (FounderSetupRequests / HubSetupRequest, S121)
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- Fiecare pas are grupul lui de câmpuri, completat o singură dată, cu momentul pus de server:
--   oferta (echipa)          → setup_minor, maintenance_minor / _interval, estimated_start_on, offer_*
--   acceptarea (owner-ul)    → accepted_at / _by_user_id
--   confirmarea (echipa)     → start_on, confirmed_*
--   plata (billing / echipa) → paid_*, payment_method (card / transfer), payment_ref (cumpărarea
--                              sau factura de transfer din billing), paid_minor = setup_minor
--   începerea lucrului       → work_started_*
--   pornirea (echipa)        → live_*, subscription_application_id (linia recurentă a aplicației,
--                              creată în aceeași tranzacție: abonamentul începe din ziua pornirii)
--   anularea                 → cancelled_* (owner-ul înainte de plată; echipa oricând până la pornire)
--   rambursarea (echipa)     → refunded_at, refund_ref; doar după plată și înainte de pornire
CREATE TABLE "commercial"."setup_request" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "application_id" VARCHAR(64) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'requested',
    "requested_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "setup_minor" BIGINT,
    "maintenance_minor" BIGINT,
    "maintenance_interval" VARCHAR(8),
    "estimated_start_on" DATE,
    "offer_note" TEXT,
    "offer_sent_at" TIMESTAMPTZ,
    "offer_sent_by_founder_id" UUID,
    "accepted_at" TIMESTAMPTZ,
    "accepted_by_user_id" UUID,
    "start_on" DATE,
    "confirmed_at" TIMESTAMPTZ,
    "confirmed_by_founder_id" UUID,
    "paid_at" TIMESTAMPTZ,
    "payment_method" VARCHAR(8),
    "payment_ref" UUID,
    "paid_minor" BIGINT,
    "work_started_at" TIMESTAMPTZ,
    "work_started_by_founder_id" UUID,
    "live_at" TIMESTAMPTZ,
    "live_by_founder_id" UUID,
    "subscription_application_id" UUID,
    "cancelled_at" TIMESTAMPTZ,
    "cancelled_by" VARCHAR(8),
    "cancelled_by_id" UUID,
    "cancel_reason" TEXT,
    "refunded_at" TIMESTAMPTZ,
    "refund_ref" VARCHAR(255),

    CONSTRAINT "setup_request_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "setup_request_currency" CHECK ("currency" IN ('RON', 'EUR')),
    CONSTRAINT "setup_request_status" CHECK (
      "status" IN ('requested', 'accepted', 'confirmed', 'paid', 'in_progress', 'live', 'cancelled', 'refunded')
    ),
    CONSTRAINT "setup_request_offer" CHECK (
      ("offer_sent_at" IS NULL AND "setup_minor" IS NULL AND "maintenance_minor" IS NULL
        AND "maintenance_interval" IS NULL AND "estimated_start_on" IS NULL AND "offer_note" IS NULL
        AND "offer_sent_by_founder_id" IS NULL)
      OR ("offer_sent_at" IS NOT NULL AND "setup_minor" >= 0 AND "maintenance_minor" >= 0
        AND "maintenance_interval" IN ('month', 'year') AND "estimated_start_on" IS NOT NULL
        AND "offer_sent_by_founder_id" IS NOT NULL
        AND ("offer_note" IS NULL OR char_length("offer_note") <= 1000))
    ),
    CONSTRAINT "setup_request_accepted" CHECK (
      ("accepted_at" IS NULL) = ("accepted_by_user_id" IS NULL)
      AND ("accepted_at" IS NULL OR "offer_sent_at" IS NOT NULL)
    ),
    CONSTRAINT "setup_request_confirmed" CHECK (
      ("confirmed_at" IS NULL) = ("confirmed_by_founder_id" IS NULL)
      AND ("confirmed_at" IS NULL) = ("start_on" IS NULL)
      AND ("confirmed_at" IS NULL OR "accepted_at" IS NOT NULL)
    ),
    CONSTRAINT "setup_request_paid" CHECK (
      ("paid_at" IS NULL AND "payment_method" IS NULL AND "payment_ref" IS NULL AND "paid_minor" IS NULL)
      OR ("paid_at" IS NOT NULL AND "payment_method" IN ('card', 'transfer') AND "payment_ref" IS NOT NULL
        AND "paid_minor" = "setup_minor" AND "confirmed_at" IS NOT NULL)
    ),
    CONSTRAINT "setup_request_work" CHECK (
      ("work_started_at" IS NULL) = ("work_started_by_founder_id" IS NULL)
      AND ("work_started_at" IS NULL OR "paid_at" IS NOT NULL)
    ),
    CONSTRAINT "setup_request_live" CHECK (
      ("live_at" IS NULL) = ("live_by_founder_id" IS NULL)
      AND ("live_at" IS NULL) = ("subscription_application_id" IS NULL)
      AND ("live_at" IS NULL OR "work_started_at" IS NOT NULL)
    ),
    CONSTRAINT "setup_request_cancelled" CHECK (
      ("cancelled_at" IS NULL AND "cancelled_by" IS NULL AND "cancelled_by_id" IS NULL AND "cancel_reason" IS NULL)
      OR ("cancelled_at" IS NOT NULL AND "cancelled_by" IN ('owner', 'founder') AND "cancelled_by_id" IS NOT NULL
        AND ("cancel_reason" IS NULL OR char_length(btrim("cancel_reason")) BETWEEN 1 AND 1000)
        AND ("cancelled_by" = 'owner' OR "cancel_reason" IS NOT NULL))
    ),
    CONSTRAINT "setup_request_refunded" CHECK (
      ("refunded_at" IS NULL) = ("refund_ref" IS NULL)
      AND ("refunded_at" IS NULL OR ("paid_at" IS NOT NULL AND "cancelled_by" = 'founder'))
    ),
    -- Starea se potrivește cu pașii completați
    CONSTRAINT "setup_request_status_steps" CHECK (
      CASE "status"
        WHEN 'requested' THEN "accepted_at" IS NULL AND "cancelled_at" IS NULL
        WHEN 'accepted' THEN "accepted_at" IS NOT NULL AND "confirmed_at" IS NULL AND "cancelled_at" IS NULL
        WHEN 'confirmed' THEN "confirmed_at" IS NOT NULL AND "paid_at" IS NULL AND "cancelled_at" IS NULL
        WHEN 'paid' THEN "paid_at" IS NOT NULL AND "work_started_at" IS NULL AND "cancelled_at" IS NULL
        WHEN 'in_progress' THEN "work_started_at" IS NOT NULL AND "live_at" IS NULL AND "cancelled_at" IS NULL
        WHEN 'live' THEN "live_at" IS NOT NULL AND "cancelled_at" IS NULL
        WHEN 'cancelled' THEN "cancelled_at" IS NOT NULL AND "paid_at" IS NULL
        WHEN 'refunded' THEN "refunded_at" IS NOT NULL AND "cancelled_at" IS NOT NULL AND "live_at" IS NULL
        ELSE false
      END
    )
);

CREATE INDEX "setup_request_organization_id_idx" ON "commercial"."setup_request"("organization_id");
CREATE INDEX "setup_request_status_created_at_idx" ON "commercial"."setup_request"("status", "created_at");

-- O singură cerere deschisă pe aceeași aplicație în aceeași afacere
CREATE UNIQUE INDEX "setup_request_one_open"
  ON "commercial"."setup_request"("organization_id", "application_id")
  WHERE "status" NOT IN ('live', 'cancelled', 'refunded');
-- O linie a abonamentului vine dintr-o singură cerere
CREATE UNIQUE INDEX "setup_request_subscription_application_id_key"
  ON "commercial"."setup_request"("subscription_application_id");

ALTER TABLE "commercial"."setup_request" ADD CONSTRAINT "setup_request_application_id_fkey"
  FOREIGN KEY ("application_id") REFERENCES "commercial"."application"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commercial"."setup_request" ADD CONSTRAINT "setup_request_subscription_application_id_fkey"
  FOREIGN KEY ("subscription_application_id") REFERENCES "commercial"."subscription_application"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Trecerile permise, pe rol. Fiecare trecere scrie doar grupul ei de câmpuri (plus starea);
-- momentele le pune serverul. Restul rândului rămâne cum a fost.
CREATE OR REPLACE FUNCTION commercial.setup_request_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = commercial, pg_catalog
AS $$
DECLARE
  is_founder BOOLEAN := current_user = 'commercial_founder';
  is_rw BOOLEAN := current_user = 'commercial_rw';
  writable TEXT[];
  base TEXT[] := ARRAY['status', 'updated_at'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF is_founder THEN
      RAISE EXCEPTION 'a setup request is created from the Hub' USING ERRCODE = 'P0001', HINT = 'setup_transition';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM commercial.subscription s
       WHERE s.organization_id = NEW.organization_id AND s.canceled_at IS NULL AND s.currency = NEW.currency
    ) THEN
      RAISE EXCEPTION 'setup request needs a live subscription in its currency'
        USING ERRCODE = 'P0001', HINT = 'setup_no_subscription';
    END IF;
    NEW.status := 'requested';
    NEW.created_at := now();
    NEW.updated_at := now();
    NEW.setup_minor := NULL; NEW.maintenance_minor := NULL; NEW.maintenance_interval := NULL;
    NEW.estimated_start_on := NULL; NEW.offer_note := NULL; NEW.offer_sent_at := NULL;
    NEW.offer_sent_by_founder_id := NULL;
    NEW.accepted_at := NULL; NEW.accepted_by_user_id := NULL;
    NEW.start_on := NULL; NEW.confirmed_at := NULL; NEW.confirmed_by_founder_id := NULL;
    NEW.paid_at := NULL; NEW.payment_method := NULL; NEW.payment_ref := NULL; NEW.paid_minor := NULL;
    NEW.work_started_at := NULL; NEW.work_started_by_founder_id := NULL;
    NEW.live_at := NULL; NEW.live_by_founder_id := NULL; NEW.subscription_application_id := NULL;
    NEW.cancelled_at := NULL; NEW.cancelled_by := NULL; NEW.cancelled_by_id := NULL; NEW.cancel_reason := NULL;
    NEW.refunded_at := NULL; NEW.refund_ref := NULL;
    RETURN NEW;
  END IF;

  IF OLD.status IN ('live', 'cancelled', 'refunded') THEN
    RAISE EXCEPTION 'setup request % is closed (%)', OLD.id, OLD.status
      USING ERRCODE = 'P0001', HINT = 'setup_closed';
  END IF;

  -- oferta (trimisă sau retrimisă, cât timp clientul n-a acceptat)
  IF OLD.status = 'requested' AND NEW.status = 'requested' AND is_founder THEN
    writable := ARRAY['setup_minor', 'maintenance_minor', 'maintenance_interval', 'estimated_start_on',
                      'offer_note', 'offer_sent_at', 'offer_sent_by_founder_id'];
    NEW.offer_sent_at := now();
  -- acceptarea clientului
  ELSIF OLD.status = 'requested' AND NEW.status = 'accepted' AND is_rw THEN
    IF OLD.offer_sent_at IS NULL THEN
      RAISE EXCEPTION 'setup request % has no offer yet', OLD.id USING ERRCODE = 'P0001', HINT = 'setup_no_offer';
    END IF;
    writable := ARRAY['accepted_at', 'accepted_by_user_id'];
    NEW.accepted_at := now();
  -- confirmarea echipei, cu data de început
  ELSIF OLD.status = 'accepted' AND NEW.status = 'confirmed' AND is_founder THEN
    writable := ARRAY['start_on', 'confirmed_at', 'confirmed_by_founder_id'];
    NEW.confirmed_at := now();
  -- plata implementării (cardul, din billing; transferul, confirmat de echipă)
  ELSIF OLD.status = 'confirmed' AND NEW.status = 'paid' AND (is_rw OR is_founder) THEN
    writable := ARRAY['paid_at', 'payment_method', 'payment_ref', 'paid_minor'];
    NEW.paid_at := now();
  -- începerea lucrului
  ELSIF OLD.status = 'paid' AND NEW.status = 'in_progress' AND is_founder THEN
    writable := ARRAY['work_started_at', 'work_started_by_founder_id'];
    NEW.work_started_at := now();
  -- pornirea: linia recurentă a aplicației, activă, a aceleiași afaceri și aplicații
  ELSIF OLD.status = 'in_progress' AND NEW.status = 'live' AND is_founder THEN
    IF NOT EXISTS (
      SELECT 1 FROM commercial.subscription_application sa
       WHERE sa.id = NEW.subscription_application_id
         AND sa.organization_id = OLD.organization_id
         AND sa.application_id = OLD.application_id
         AND sa.ended_at IS NULL
    ) THEN
      RAISE EXCEPTION 'setup request % goes live only with an active line of its application', OLD.id
        USING ERRCODE = 'P0001', HINT = 'setup_live_line';
    END IF;
    writable := ARRAY['live_at', 'live_by_founder_id', 'subscription_application_id'];
    NEW.live_at := now();
  -- anularea înainte de plată: owner-ul (refuză oferta / renunță) sau echipa
  ELSIF OLD.status IN ('requested', 'accepted', 'confirmed') AND NEW.status = 'cancelled'
        AND ((is_rw AND NEW.cancelled_by = 'owner') OR (is_founder AND NEW.cancelled_by = 'founder')) THEN
    writable := ARRAY['cancelled_at', 'cancelled_by', 'cancelled_by_id', 'cancel_reason'];
    NEW.cancelled_at := now();
  -- rambursarea integrală, cu stornare, după plată și până la pornire; după pornire doar prin Suport
  ELSIF OLD.status IN ('paid', 'in_progress') AND NEW.status = 'refunded' AND is_founder
        AND NEW.cancelled_by = 'founder' THEN
    writable := ARRAY['cancelled_at', 'cancelled_by', 'cancelled_by_id', 'cancel_reason',
                      'refunded_at', 'refund_ref'];
    NEW.cancelled_at := now();
    NEW.refunded_at := now();
  ELSE
    RAISE EXCEPTION 'setup request %: % → % is not allowed for %', OLD.id, OLD.status, NEW.status, current_user
      USING ERRCODE = 'P0001', HINT = 'setup_transition';
  END IF;

  IF (to_jsonb(NEW) - (base || writable)) IS DISTINCT FROM (to_jsonb(OLD) - (base || writable)) THEN
    RAISE EXCEPTION 'setup request %: % → % changes other fields', OLD.id, OLD.status, NEW.status
      USING ERRCODE = 'P0001', HINT = 'setup_fields';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER setup_request_guard
  BEFORE INSERT OR UPDATE ON "commercial"."setup_request"
  FOR EACH ROW EXECUTE FUNCTION commercial.setup_request_guard();

ALTER TABLE "commercial"."setup_request" ENABLE ROW LEVEL SECURITY;

CREATE POLICY commercial_rw_setup_request ON "commercial"."setup_request" TO commercial_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY commercial_founder_setup_request ON "commercial"."setup_request" TO commercial_founder
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

REVOKE ALL ON "commercial"."setup_request" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON "commercial"."setup_request" TO commercial_rw;
GRANT SELECT, UPDATE ON "commercial"."setup_request" TO commercial_founder;

-- Founder · Cereri: cererile cu implementare din toate afacerile (fără date personale: doar id-ul
-- celui care a cerut; numele vin din identity)
CREATE OR REPLACE FUNCTION commercial.founder_list_setup_requests(p_open_only BOOLEAN)
RETURNS TABLE (
  id                   UUID,
  organization_id      UUID,
  application_id       VARCHAR(64),
  currency             VARCHAR(3),
  status               VARCHAR(16),
  requested_by_user_id UUID,
  setup_minor          BIGINT,
  maintenance_minor    BIGINT,
  maintenance_interval VARCHAR(8),
  estimated_start_on   DATE,
  start_on             DATE,
  offer_sent_at        TIMESTAMPTZ,
  paid_at              TIMESTAMPTZ,
  live_at              TIMESTAMPTZ,
  cancelled_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT r.id, r.organization_id, r.application_id, r.currency, r.status, r.requested_by_user_id,
         r.setup_minor, r.maintenance_minor, r.maintenance_interval, r.estimated_start_on,
         r.start_on, r.offer_sent_at, r.paid_at, r.live_at, r.cancelled_at, r.created_at,
         r.updated_at
    FROM commercial.setup_request r
   WHERE NOT COALESCE(p_open_only, false) OR r.status NOT IN ('live', 'cancelled', 'refunded')
   ORDER BY r.updated_at DESC, r.id
   LIMIT 500;
$$;

REVOKE ALL ON FUNCTION commercial.founder_list_setup_requests(BOOLEAN) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION commercial.founder_list_setup_requests(BOOLEAN) TO founder_runtime';
  END IF;
END $$;
