-- Lot 3.4 — commercial_requests: cererile din Hub (FounderRequests, S111): „Cere activare” (un
-- pachet „la cerere”, orice pachet fără card salvat, o aplicație) și „Cere alt abonament” (D3-9:
-- schimbarea abonamentului e mereu o cerere).
--
--   commercial_request → cererea afacerii: ce s-a cerut (pachet / aplicație / plan), cine a cerut,
--                        starea (nouă → rezolvată / refuzată, o singură dată), motivul refuzului
--                        (îl vede cine a cerut, în notificarea din Hub) și cine din echipa Ventora
--                        a hotărât
--
-- RLS pe app.organization_id (D-SEC-1):
--   commercial_rw      (app_runtime)     → citește și creează cererile afacerii (Hub, owner-ul)
--   commercial_founder (founder_runtime) → citește și hotărăște cererile unei afaceri pe tranzacție
-- Lista din Founder (toate afacerile) trece prin commercial.founder_list_requests (SECURITY
-- DEFINER), doar pentru founder_runtime. Nicio ștergere: o cerere rămâne în istoric.

-- CreateTable
CREATE TABLE "commercial"."commercial_request" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "target_type" VARCHAR(16) NOT NULL,
    "target_id" VARCHAR(128) NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "requested_by_role" VARCHAR(16) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'new',
    "refusal_reason" TEXT,
    "decided_at" TIMESTAMPTZ,
    "decided_by_founder_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commercial_request_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "commercial_request_kind" CHECK (
      ("kind" = 'activation' AND "target_type" IN ('addon', 'application'))
      OR ("kind" = 'plan_change' AND "target_type" = 'plan')
    ),
    CONSTRAINT "commercial_request_status" CHECK ("status" IN ('new', 'resolved', 'refused')),
    CONSTRAINT "commercial_request_decided" CHECK (
      ("status" = 'new' AND "decided_at" IS NULL AND "decided_by_founder_id" IS NULL)
      OR ("status" <> 'new' AND "decided_at" IS NOT NULL AND "decided_by_founder_id" IS NOT NULL)
    ),
    CONSTRAINT "commercial_request_refusal" CHECK (
      ("status" = 'refused' AND char_length(btrim("refusal_reason")) BETWEEN 1 AND 1000)
      OR ("status" <> 'refused' AND "refusal_reason" IS NULL)
    )
);

-- CreateIndex
CREATE INDEX "commercial_request_organization_id_idx" ON "commercial"."commercial_request"("organization_id");

-- CreateIndex
CREATE INDEX "commercial_request_status_created_at_idx" ON "commercial"."commercial_request"("status", "created_at");

-- O singură cerere nouă pentru același lucru în aceeași afacere
CREATE UNIQUE INDEX "commercial_request_one_open"
  ON "commercial"."commercial_request"("organization_id", "kind", "target_type", "target_id")
  WHERE "status" = 'new';

-- Pe server, indiferent de interfață: cererea se creează acum, nouă; după aceea se poate doar
-- hotărî o singură dată (rezolvată sau refuzată), cu momentul pus aici.
CREATE OR REPLACE FUNCTION commercial.commercial_request_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = commercial, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.status := 'new';
    NEW.refusal_reason := NULL;
    NEW.decided_at := NULL;
    NEW.decided_by_founder_id := NULL;
    RETURN NEW;
  END IF;
  IF OLD.status <> 'new' THEN
    RAISE EXCEPTION 'commercial_request % is already decided', OLD.id USING ERRCODE = 'P0001';
  END IF;
  IF (NEW.organization_id, NEW.kind, NEW.target_type, NEW.target_id, NEW.requested_by_user_id,
      NEW.requested_by_role, NEW.created_at)
     IS DISTINCT FROM
     (OLD.organization_id, OLD.kind, OLD.target_type, OLD.target_id, OLD.requested_by_user_id,
      OLD.requested_by_role, OLD.created_at) THEN
    RAISE EXCEPTION 'commercial_request % can only be decided', OLD.id USING ERRCODE = 'P0001';
  END IF;
  IF NEW.status <> 'new' THEN
    NEW.decided_at := now();
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER commercial_request_guard
  BEFORE INSERT OR UPDATE ON "commercial"."commercial_request"
  FOR EACH ROW EXECUTE FUNCTION commercial.commercial_request_guard();

-- RLS
ALTER TABLE "commercial"."commercial_request" ENABLE ROW LEVEL SECURITY;

CREATE POLICY commercial_rw_commercial_request_select ON "commercial"."commercial_request"
  FOR SELECT TO commercial_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY commercial_rw_commercial_request_insert ON "commercial"."commercial_request"
  FOR INSERT TO commercial_rw
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY commercial_founder_commercial_request ON "commercial"."commercial_request"
  TO commercial_founder
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Grants: Hub-ul creează, Founder hotărăște; nimeni nu șterge
REVOKE ALL ON "commercial"."commercial_request" FROM PUBLIC;
GRANT SELECT, INSERT ON "commercial"."commercial_request" TO commercial_rw;
GRANT SELECT, UPDATE ON "commercial"."commercial_request" TO commercial_founder;

-- Founder: lista cererilor din toate afacerile (RLS-ul lui commercial_founder vede o singură afacere
-- pe tranzacție). Fără date personale: doar id-ul celui care a cerut, numele vin din identity.
CREATE OR REPLACE FUNCTION commercial.founder_list_requests(p_only_new BOOLEAN)
RETURNS TABLE (
  id                    UUID,
  organization_id       UUID,
  kind                  VARCHAR(16),
  target_type           VARCHAR(16),
  target_id             VARCHAR(128),
  requested_by_user_id  UUID,
  requested_by_role     VARCHAR(16),
  status                VARCHAR(16),
  refusal_reason        TEXT,
  decided_at            TIMESTAMPTZ,
  decided_by_founder_id UUID,
  created_at            TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT r.id, r.organization_id, r.kind, r.target_type, r.target_id, r.requested_by_user_id,
         r.requested_by_role, r.status, r.refusal_reason, r.decided_at, r.decided_by_founder_id,
         r.created_at
    FROM commercial.commercial_request r
   WHERE NOT COALESCE(p_only_new, false) OR r.status = 'new'
   ORDER BY r.created_at DESC, r.id
   LIMIT 500;
$$;

REVOKE ALL ON FUNCTION commercial.founder_list_requests(BOOLEAN) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION commercial.founder_list_requests(BOOLEAN) TO founder_runtime';
  END IF;
END $$;

-- Founder scrie evenimentul pentru notificarea din Hub („rezolvată” / „refuzată”) în aceeași
-- tranzacție cu hotărârea; Hub-ul scrie evenimentul cererii noi (commercial_rw are deja INSERT).
