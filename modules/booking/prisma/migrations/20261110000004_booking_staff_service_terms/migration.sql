-- Lot B.2c (BOOKING.md §3 B.2c, proposed 10.11.2026, asked by the founder after B.2b): the duration
-- and the price of a service for one member (a senior stylist charges more, a junior takes longer).
-- Optional: without a row, the member uses the service's duration and price. The currency, the
-- capacity and the resources stay the service's (S123-2). No new role, no extension, no DELETE.
--
--   staff_service_terms → for one pair (member, service): a NULL column keeps the service's value

-- CreateTable
CREATE TABLE "booking"."staff_service_terms" (
  "id"                   UUID        NOT NULL,
  "organization_id"      UUID        NOT NULL,
  "staff_member_id"      UUID        NOT NULL,
  "service_id"           UUID        NOT NULL,
  "duration_minutes"     INTEGER,
  "duration_max_minutes" INTEGER,
  "price_kind"           VARCHAR(8),
  "price_minor"          INTEGER,
  "price_max_minor"      INTEGER,
  "archived_at"          TIMESTAMPTZ,
  "archived_by_user_id"  UUID,
  "created_by_user_id"   UUID        NOT NULL,
  "created_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "staff_service_terms_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "staff_service_terms_staff_member_id_fkey" FOREIGN KEY ("staff_member_id")
    REFERENCES "booking"."staff_member" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "staff_service_terms_service_id_fkey" FOREIGN KEY ("service_id")
    REFERENCES "booking"."service" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  -- the same bounds as the service (B.1, S123-7): 5 minutes to 8 hours, steps of 5
  CONSTRAINT "staff_service_terms_duration_check" CHECK (
    ("duration_minutes" IS NULL
      OR ("duration_minutes" BETWEEN 5 AND 480 AND "duration_minutes" % 5 = 0))
    AND ("duration_max_minutes" IS NULL
      OR ("duration_max_minutes" BETWEEN 5 AND 480 AND "duration_max_minutes" % 5 = 0))
  ),
  CONSTRAINT "staff_service_terms_price_check" CHECK (
    ("price_kind" IS NULL OR "price_kind" IN ('fixed', 'from', 'range'))
    AND ("price_minor" IS NULL OR "price_minor" BETWEEN 0 AND 10000000)
    AND ("price_max_minor" IS NULL OR "price_max_minor" BETWEEN 0 AND 10000000)
    -- a price is set whole: its kind, its amount and, for a range, its upper amount
    AND (("price_kind" IS NULL) = ("price_minor" IS NULL))
    AND (("price_kind" = 'range') = ("price_max_minor" IS NOT NULL))
    AND ("price_max_minor" IS NULL OR "price_max_minor" > "price_minor")
  ),
  -- a row says something: at least a duration or a price
  CONSTRAINT "staff_service_terms_any_check" CHECK (
    "duration_minutes" IS NOT NULL OR "duration_max_minutes" IS NOT NULL OR "price_kind" IS NOT NULL
  ),
  CONSTRAINT "staff_service_terms_archived_check"
    CHECK (("archived_at" IS NULL) = ("archived_by_user_id" IS NULL))
);

CREATE INDEX "staff_service_terms_service_id_idx" ON "booking"."staff_service_terms" ("service_id");
-- one active row per member and service (the service as text: an expression, which keeps the
-- partial index out of the Prisma schema, as in booking_staff)
CREATE UNIQUE INDEX "staff_service_terms_active_key"
  ON "booking"."staff_service_terms" ("staff_member_id", ("service_id"::text))
  WHERE "archived_at" IS NULL;

-- A new or restored row: an active member and an active service of the same business (the guard
-- of B.2b, staff_service_guard, checks exactly this and sets updated_at)
CREATE TRIGGER staff_service_terms_guard
  BEFORE INSERT OR UPDATE ON "booking"."staff_service_terms"
  FOR EACH ROW EXECUTE FUNCTION booking.staff_service_guard();

-- RLS (D-SEC-1): USING + WITH CHECK on the organization of the transaction
ALTER TABLE "booking"."staff_service_terms" ENABLE ROW LEVEL SECURITY;

CREATE POLICY booking_rw_staff_service_terms ON "booking"."staff_service_terms"
  TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Grants, as for the other booking tables: no DELETE, no TRUNCATE; never an UPDATE of id /
-- organization_id / staff_member_id / service_id / created_*.
REVOKE ALL ON "booking"."staff_service_terms" FROM PUBLIC;
GRANT SELECT, INSERT ON "booking"."staff_service_terms" TO booking_rw;
GRANT UPDATE ("duration_minutes", "duration_max_minutes", "price_kind", "price_minor",
              "price_max_minor", "archived_at", "archived_by_user_id", "updated_at")
  ON "booking"."staff_service_terms" TO booking_rw;
