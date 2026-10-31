-- Lot 3.3 — commercial_usage: cotele reale (T5, ARCHITECTURE §8.2–8.3), în schema commercial.
--   usage_counter     → consumul pe organizație × cheie × perioadă: used + reserved; period_start =
--                       începutul perioadei lunare în ziua de ancorare (cote de flux, D3-3), NULL
--                       pentru o cotă de stoc (un singur contor pe cheie)
--   quota_reservation → rezervarea în doi pași, idempotentă pe (organizație, operation_id);
--                       over_limit = ce era deja programat și trece peste limită (D3-6)
--   usage_event       → istoricul consumului, doar inserări
-- RLS pe app.organization_id pentru commercial_rw (app_runtime): consumul se scrie din contextul
-- afacerii. Reconcilierea (fără context, la job-urile din 4.2) vede doar rezervările expirate,
-- prin commercial.expired_quota_reservations (SECURITY DEFINER), apoi lucrează pe fiecare afacere.

-- CreateTable
CREATE TABLE "commercial"."usage_counter" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "quota_key" VARCHAR(128) NOT NULL,
    "period_start" DATE,
    "used" BIGINT NOT NULL DEFAULT 0,
    "reserved" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_counter_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "usage_counter_non_negative" CHECK ("used" >= 0 AND "reserved" >= 0)
);

-- CreateTable
CREATE TABLE "commercial"."quota_reservation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "quota_key" VARCHAR(128) NOT NULL,
    "period_start" DATE,
    "operation_id" VARCHAR(128) NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "over_limit" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committed_at" TIMESTAMPTZ,
    "released_at" TIMESTAMPTZ,
    "refunded_at" TIMESTAMPTZ,

    CONSTRAINT "quota_reservation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "quota_reservation_amount" CHECK ("amount" > 0),
    CONSTRAINT "quota_reservation_status" CHECK ("status" IN ('reserved', 'committed', 'released', 'refunded')),
    CONSTRAINT "quota_reservation_operation_id" CHECK (length("operation_id") > 0)
);

-- CreateTable
CREATE TABLE "commercial"."usage_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "quota_key" VARCHAR(128) NOT NULL,
    "period_start" DATE,
    "operation_id" VARCHAR(128),
    "kind" VARCHAR(24) NOT NULL,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_event_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "usage_event_kind" CHECK ("kind" IN (
      'reserve', 'reserve_over_limit', 'commit', 'release', 'refund', 'stock_freed',
      'threshold_80', 'threshold_100', 'over_limit_notice'
    ))
);

-- CreateIndex: NULLS NOT DISTINCT — un singur contor de stoc (period_start NULL) pe cheie (PG 15+)
CREATE UNIQUE INDEX "usage_counter_org_key_period_key"
  ON "commercial"."usage_counter"("organization_id", "quota_key", "period_start") NULLS NOT DISTINCT;

-- CreateIndex
CREATE INDEX "quota_reservation_status_expires_at_idx" ON "commercial"."quota_reservation"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "quota_reservation_org_operation_key" ON "commercial"."quota_reservation"("organization_id", "operation_id");

-- CreateIndex
CREATE INDEX "usage_event_org_key_created_at_idx" ON "commercial"."usage_event"("organization_id", "quota_key", "created_at");

-- O notificare de prag / de depășire o singură dată pe cheie și perioadă
CREATE UNIQUE INDEX "usage_event_one_notice_per_period"
  ON "commercial"."usage_event"("organization_id", "quota_key", "period_start", "kind") NULLS NOT DISTINCT
  WHERE "kind" IN ('threshold_80', 'threshold_100', 'over_limit_notice');

-- AddForeignKey
ALTER TABLE "commercial"."usage_counter" ADD CONSTRAINT "usage_counter_quota_key_fkey" FOREIGN KEY ("quota_key") REFERENCES "commercial"."quota_key"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial"."quota_reservation" ADD CONSTRAINT "quota_reservation_quota_key_fkey" FOREIGN KEY ("quota_key") REFERENCES "commercial"."quota_key"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reconcilierea: rezervările încă `reserved` după termen, în toate afacerile — doar id-ul, afacerea,
-- cheia și operation_id; apoi fiecare se rezolvă în contextul afacerii ei (RLS).
CREATE OR REPLACE FUNCTION commercial.expired_quota_reservations(p_now TIMESTAMPTZ, p_limit INTEGER)
RETURNS TABLE (id UUID, organization_id UUID, quota_key VARCHAR(128), operation_id VARCHAR(128))
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT r.id, r.organization_id, r.quota_key, r.operation_id
    FROM commercial.quota_reservation r
   WHERE r.status = 'reserved' AND r.expires_at < p_now
   ORDER BY r.expires_at, r.id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 500);
$$;

REVOKE ALL ON FUNCTION commercial.expired_quota_reservations(TIMESTAMPTZ, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.expired_quota_reservations(TIMESTAMPTZ, INTEGER) TO commercial_rw;

-- RLS
ALTER TABLE "commercial"."usage_counter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commercial"."quota_reservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commercial"."usage_event" ENABLE ROW LEVEL SECURITY;

CREATE POLICY commercial_rw_usage_counter ON "commercial"."usage_counter" TO commercial_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY commercial_rw_quota_reservation ON "commercial"."quota_reservation" TO commercial_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY commercial_rw_usage_event ON "commercial"."usage_event" TO commercial_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Founder vede consumul unei afaceri (FounderUsage, 3.4), fără să-l scrie
CREATE POLICY commercial_founder_usage_counter ON "commercial"."usage_counter" FOR SELECT TO commercial_founder
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Grants: fără DELETE; istoricul doar inserări
REVOKE ALL ON "commercial"."usage_counter", "commercial"."quota_reservation",
  "commercial"."usage_event" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON "commercial"."usage_counter", "commercial"."quota_reservation"
  TO commercial_rw;
GRANT SELECT, INSERT ON "commercial"."usage_event" TO commercial_rw;
GRANT SELECT ON "commercial"."usage_counter" TO commercial_founder;
