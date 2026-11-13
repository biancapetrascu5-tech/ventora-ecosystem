-- Lot 5.9e — commercial_team_recommendation: „Recomandă aplicația” păstrat cu starea lui
-- (HubMyRecommendations, HubRecommendation, S136; deciziile fondatoarei din 13.11.2026).
--
--   team_recommendation → un membru (sau un admin) recomandă proprietarului o aplicație pe care
--                         afacerea n-o are: cine, ce aplicație, nota opțională (max 300), starea
--                         (în așteptare → activată / „Nu acum”, o singură dată), când și cine a
--                         hotărât, răspunsul opțional al proprietarului (max 300; gol până există
--                         design pentru câmpul lui)
--   „Activată”  → aplicația a intrat în abonament (consumatorul evenimentelor commercial; sistemul)
--   „Nu acum”   → owner-ul sau un admin a respins-o din clopoțel; se poate trimite din nou după
--                 30 de zile (regula e în core/commercial)
--
-- RLS pe app.organization_id (D-SEC-1), doar commercial_rw (app_runtime). Nicio ștergere: o
-- recomandare rămâne în istoricul membrului.

-- CreateTable
CREATE TABLE "commercial"."team_recommendation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "application_id" VARCHAR(64) NOT NULL,
    "recommended_by_user_id" UUID NOT NULL,
    "recommended_by_role" VARCHAR(16) NOT NULL,
    "note" TEXT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "recommended_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ,
    "decided_by_user_id" UUID,
    "answer" TEXT,

    CONSTRAINT "team_recommendation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "team_recommendation_application_fkey" FOREIGN KEY ("application_id")
      REFERENCES "commercial"."application"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "team_recommendation_status" CHECK ("status" IN ('pending', 'active', 'not_now')),
    CONSTRAINT "team_recommendation_decided" CHECK (
      ("status" = 'pending' AND "decided_at" IS NULL AND "decided_by_user_id" IS NULL)
      OR ("status" = 'active' AND "decided_at" IS NOT NULL)
      OR ("status" = 'not_now' AND "decided_at" IS NOT NULL AND "decided_by_user_id" IS NOT NULL)
    ),
    CONSTRAINT "team_recommendation_note" CHECK (
      "note" IS NULL OR char_length(btrim("note")) BETWEEN 1 AND 300
    ),
    CONSTRAINT "team_recommendation_answer" CHECK (
      "answer" IS NULL OR char_length(btrim("answer")) BETWEEN 1 AND 300
    )
);

-- CreateIndex
CREATE INDEX "team_recommendation_organization_id_status_idx"
  ON "commercial"."team_recommendation"("organization_id", "status");

-- CreateIndex
CREATE INDEX "team_recommendation_recommended_by_idx"
  ON "commercial"."team_recommendation"("organization_id", "recommended_by_user_id", "recommended_at");

-- O singură recomandare în așteptare a aceleiași persoane pentru aceeași aplicație
CREATE UNIQUE INDEX "team_recommendation_one_pending"
  ON "commercial"."team_recommendation"("organization_id", "recommended_by_user_id", "application_id")
  WHERE "status" = 'pending';

-- Pe server, indiferent de interfață: se creează acum, în așteptare; apoi se hotărăște o singură
-- dată (activată sau „Nu acum”), cu momentul pus aici. Ce s-a recomandat și de cine nu se schimbă.
CREATE OR REPLACE FUNCTION commercial.team_recommendation_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = commercial, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.recommended_at := now();
    NEW.status := 'pending';
    NEW.decided_at := NULL;
    NEW.decided_by_user_id := NULL;
    NEW.answer := NULL;
    RETURN NEW;
  END IF;
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'team_recommendation % is already decided', OLD.id USING ERRCODE = 'P0001';
  END IF;
  IF (NEW.organization_id, NEW.application_id, NEW.recommended_by_user_id,
      NEW.recommended_by_role, NEW.note, NEW.recommended_at)
     IS DISTINCT FROM
     (OLD.organization_id, OLD.application_id, OLD.recommended_by_user_id,
      OLD.recommended_by_role, OLD.note, OLD.recommended_at) THEN
    RAISE EXCEPTION 'team_recommendation % can only be decided', OLD.id USING ERRCODE = 'P0001';
  END IF;
  IF NEW.status <> 'pending' THEN
    NEW.decided_at := now();
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER team_recommendation_guard
  BEFORE INSERT OR UPDATE ON "commercial"."team_recommendation"
  FOR EACH ROW EXECUTE FUNCTION commercial.team_recommendation_guard();

-- RLS
ALTER TABLE "commercial"."team_recommendation" ENABLE ROW LEVEL SECURITY;

CREATE POLICY commercial_rw_team_recommendation ON "commercial"."team_recommendation"
  TO commercial_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Grants: Hub-ul creează și hotărăște (doar starea, momentul, cine și răspunsul); nimeni nu șterge
REVOKE ALL ON "commercial"."team_recommendation" FROM PUBLIC;
REVOKE ALL ON "commercial"."team_recommendation" FROM commercial_rw;
GRANT SELECT, INSERT ON "commercial"."team_recommendation" TO commercial_rw;
GRANT UPDATE ("status", "decided_at", "decided_by_user_id", "answer")
  ON "commercial"."team_recommendation" TO commercial_rw;

-- ── Schimbarea de bundle care intră în vigoare (decizia fondatoarei din 13.11.2026) ──────────
-- O mutare pe altă versiune (subscription_change) se programează și intră în vigoare la
-- effective_at, fără niciun eveniment în acel moment. Job-ul commercial.subscription-changes
-- anunță fiecare mutare ajunsă la termen, o singură dată, prin `commercial.subscription.changed`
-- (evenimentul din catalog), pe care îl ascultă consumatorul recomandărilor (și Growth).
--   subscription_change_announced → mutările deja anunțate (doar id-ul, afacerea și momentul)

CREATE TABLE "commercial"."subscription_change_announced" (
    "subscription_change_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "announced_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_change_announced_pkey" PRIMARY KEY ("subscription_change_id"),
    CONSTRAINT "subscription_change_announced_change_fkey" FOREIGN KEY ("subscription_change_id")
      REFERENCES "commercial"."subscription_change"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Mutările care au intrat deja în vigoare până acum nu se anunță la prima rulare a job-ului
INSERT INTO "commercial"."subscription_change_announced" (subscription_change_id, organization_id)
SELECT c.id, c.organization_id
  FROM "commercial"."subscription_change" c
 WHERE c.effective_at <= now() OR c.canceled_at IS NOT NULL;

ALTER TABLE "commercial"."subscription_change_announced" ENABLE ROW LEVEL SECURITY;

CREATE POLICY commercial_rw_subscription_change_announced
  ON "commercial"."subscription_change_announced"
  TO commercial_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

REVOKE ALL ON "commercial"."subscription_change_announced" FROM PUBLIC;
REVOKE ALL ON "commercial"."subscription_change_announced" FROM commercial_rw;
GRANT SELECT, INSERT ON "commercial"."subscription_change_announced" TO commercial_rw;

-- Job-ul: mutările ajunse la termen, neanulate și neanunțate — doar id-ul și afacerea
CREATE OR REPLACE FUNCTION commercial.subscription_changes_due(p_limit INTEGER)
RETURNS TABLE (id UUID, organization_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT c.id, c.organization_id
    FROM commercial.subscription_change c
   WHERE c.canceled_at IS NULL
     AND c.effective_at <= now()
     AND NOT EXISTS (
       SELECT 1 FROM commercial.subscription_change_announced a
        WHERE a.subscription_change_id = c.id)
   ORDER BY c.effective_at, c.id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 500);
$$;

REVOKE ALL ON FUNCTION commercial.subscription_changes_due(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.subscription_changes_due(INTEGER) TO commercial_rw;
