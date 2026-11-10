-- Lot B.3a (BOOKING.md §3 B.3; plan reports/2026-11-08_2007_plan-booking-b2-b3.md §2, approved
-- 08.11.2026; design S124 BookingResources): the bookable resources (rooms, spaces, equipment) and
-- the services that need them. No new role (booking_rw from booking_init), no extension, no DELETE.
-- The use of a resource by an appointment is B.3b.
--
--   resource          → a room, a space or a piece of equipment; `units` = „Câte programări
--                       simultan” (3 for a hair salon with 3 chairs)
--   service_resource  → „Servicii care o cer”: an appointment for this service needs a free unit of
--                       the resource (B.3b). A link is removed by archiving it, never deleted.
--
-- Archiving a resource (S124, the design's recommendation): it leaves the calendar and cannot be
-- chosen for services; the services that need it can be booked without it while it is archived
-- (the links stay) and need it again when it is restored.

-- CreateTable
CREATE TABLE "booking"."resource" (
  "id"                  UUID         NOT NULL,
  "organization_id"     UUID         NOT NULL,
  "name"                VARCHAR(80)  NOT NULL,
  -- „Cameră”, „Spațiu”, „Echipament” (S124: three fixed types)
  "kind"                VARCHAR(9)   NOT NULL,
  "units"               SMALLINT     NOT NULL DEFAULT 1,
  "sort_order"          INTEGER      NOT NULL DEFAULT 0,
  "archived_at"         TIMESTAMPTZ,
  "archived_by_user_id" UUID,
  "created_by_user_id"  UUID         NOT NULL,
  "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "resource_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "resource_name_check"
    CHECK ("name" = btrim("name") AND char_length("name") BETWEEN 1 AND 80),
  CONSTRAINT "resource_kind_check" CHECK ("kind" IN ('room', 'space', 'equipment')),
  CONSTRAINT "resource_units_check" CHECK ("units" BETWEEN 1 AND 50),
  CONSTRAINT "resource_sort_order_check" CHECK ("sort_order" BETWEEN 0 AND 1000000),
  CONSTRAINT "resource_archived_check"
    CHECK (("archived_at" IS NULL) = ("archived_by_user_id" IS NULL))
);

CREATE INDEX "resource_organization_id_sort_idx"
  ON "booking"."resource" ("organization_id", "sort_order");
-- one active resource per name in a business (an archived one frees the name)
CREATE UNIQUE INDEX "resource_active_name_key"
  ON "booking"."resource" ("organization_id", lower("name"))
  WHERE "archived_at" IS NULL;

-- CreateTable
CREATE TABLE "booking"."service_resource" (
  "id"                  UUID         NOT NULL,
  "organization_id"     UUID         NOT NULL,
  "service_id"          UUID         NOT NULL,
  "resource_id"         UUID         NOT NULL,
  "archived_at"         TIMESTAMPTZ,
  "archived_by_user_id" UUID,
  "created_by_user_id"  UUID         NOT NULL,
  "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "service_resource_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_resource_service_id_fkey" FOREIGN KEY ("service_id")
    REFERENCES "booking"."service" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "service_resource_resource_id_fkey" FOREIGN KEY ("resource_id")
    REFERENCES "booking"."resource" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "service_resource_archived_check"
    CHECK (("archived_at" IS NULL) = ("archived_by_user_id" IS NULL))
);

CREATE INDEX "service_resource_service_id_idx" ON "booking"."service_resource" ("service_id");
CREATE INDEX "service_resource_resource_id_idx" ON "booking"."service_resource" ("resource_id");
-- one active link per service and resource (the resource as text: an expression, which keeps the
-- partial index out of the Prisma schema, as in booking_staff)
CREATE UNIQUE INDEX "service_resource_active_key"
  ON "booking"."service_resource" ("service_id", ("resource_id"::text))
  WHERE "archived_at" IS NULL;

-- A new or restored link joins an active service and an active resource of the same business,
-- whoever writes. SECURITY INVOKER: as booking_rw the lookups run under RLS, so a row of another
-- business is not found. FOR SHARE waits for an archiving of the resource or the service in
-- progress and then sees its result.
CREATE OR REPLACE FUNCTION booking.service_resource_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.archived_at IS NULL AND (TG_OP = 'INSERT' OR OLD.archived_at IS NOT NULL) THEN
    PERFORM 1 FROM booking.resource r
     WHERE r.id = NEW.resource_id
       AND r.organization_id = NEW.organization_id
       AND r.archived_at IS NULL
       FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'resource % is not an active resource of the business', NEW.resource_id
        USING ERRCODE = '23514';
    END IF;
    PERFORM 1 FROM booking.service s
     WHERE s.id = NEW.service_id
       AND s.organization_id = NEW.organization_id
       AND s.archived_at IS NULL
       FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'service % is not an active service of the business', NEW.service_id
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION booking.service_resource_guard() FROM PUBLIC;

CREATE TRIGGER service_resource_guard
  BEFORE INSERT OR UPDATE ON "booking"."service_resource"
  FOR EACH ROW EXECUTE FUNCTION booking.service_resource_guard();

-- updated_at (booking.touch_updated_at from booking_init)
CREATE TRIGGER resource_touch
  BEFORE UPDATE ON "booking"."resource"
  FOR EACH ROW EXECUTE FUNCTION booking.touch_updated_at();

-- RLS (D-SEC-1): USING + WITH CHECK on the organization of the transaction
ALTER TABLE "booking"."resource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "booking"."service_resource" ENABLE ROW LEVEL SECURITY;

CREATE POLICY booking_rw_resource ON "booking"."resource"
  TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY booking_rw_service_resource ON "booking"."service_resource"
  TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Grants (plan §2.2): explicit per table and per column; no DELETE, no TRUNCATE; never an UPDATE of
-- id / organization_id / service_id / resource_id / created_*.
REVOKE ALL ON "booking"."resource", "booking"."service_resource" FROM PUBLIC;
GRANT SELECT, INSERT ON "booking"."resource", "booking"."service_resource" TO booking_rw;
GRANT UPDATE ("name", "kind", "units", "sort_order", "archived_at", "archived_by_user_id",
              "updated_at")
  ON "booking"."resource" TO booking_rw;
GRANT UPDATE ("archived_at", "archived_by_user_id", "updated_at")
  ON "booking"."service_resource" TO booking_rw;
