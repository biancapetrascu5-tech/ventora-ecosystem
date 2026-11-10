-- Lot B.2b (BOOKING.md §3 B.2b, D-B5-6 = a; design S129 BookingServices „Cine îl face” and
-- BookingTeamSchedule „Servicii”): who does each service. No new role, no extension, no DELETE.
--
-- A member M does a service S when:
--   S.all_staff     („Toată echipa”: every member in the calendar, including those who join later), or
--   M.all_services  („Toate serviciile”: every service, including those added later), or
--   an active staff_service row (M, S) — the members ticked one by one.
--
-- Both flags start true: until a business chooses, everyone does everything (as before B.2b), and a
-- new member gets every service (S129, with the Notice). A service nobody does stays in the list
-- with a warning; the calendar does not book it and the public page hides it (the contract).

ALTER TABLE "booking"."staff_member" ADD COLUMN "all_services" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "booking"."service" ADD COLUMN "all_staff" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "booking"."staff_service" (
  "id"                  UUID        NOT NULL,
  "organization_id"     UUID        NOT NULL,
  "staff_member_id"     UUID        NOT NULL,
  "service_id"          UUID        NOT NULL,
  "archived_at"         TIMESTAMPTZ,
  "archived_by_user_id" UUID,
  "created_by_user_id"  UUID        NOT NULL,
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "staff_service_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "staff_service_staff_member_id_fkey" FOREIGN KEY ("staff_member_id")
    REFERENCES "booking"."staff_member" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "staff_service_service_id_fkey" FOREIGN KEY ("service_id")
    REFERENCES "booking"."service" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "staff_service_archived_check"
    CHECK (("archived_at" IS NULL) = ("archived_by_user_id" IS NULL))
);

CREATE INDEX "staff_service_staff_member_id_idx" ON "booking"."staff_service" ("staff_member_id");
CREATE INDEX "staff_service_service_id_idx" ON "booking"."staff_service" ("service_id");
-- one active row per member and service (the service as text: an expression, which keeps the
-- partial index out of the Prisma schema, as in booking_staff)
CREATE UNIQUE INDEX "staff_service_active_key"
  ON "booking"."staff_service" ("staff_member_id", ("service_id"::text))
  WHERE "archived_at" IS NULL;

-- A new or restored row joins an active member and an active service of the same business,
-- whoever writes (as service_resource_guard, B.3a). SECURITY INVOKER: under RLS as booking_rw.
CREATE OR REPLACE FUNCTION booking.staff_service_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.archived_at IS NULL AND (TG_OP = 'INSERT' OR OLD.archived_at IS NOT NULL) THEN
    PERFORM 1 FROM booking.staff_member m
     WHERE m.id = NEW.staff_member_id
       AND m.organization_id = NEW.organization_id
       AND m.archived_at IS NULL
       FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'staff member % is not an active member of the calendar', NEW.staff_member_id
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

REVOKE ALL ON FUNCTION booking.staff_service_guard() FROM PUBLIC;

CREATE TRIGGER staff_service_guard
  BEFORE INSERT OR UPDATE ON "booking"."staff_service"
  FOR EACH ROW EXECUTE FUNCTION booking.staff_service_guard();

-- RLS (D-SEC-1): USING + WITH CHECK on the organization of the transaction
ALTER TABLE "booking"."staff_service" ENABLE ROW LEVEL SECURITY;

CREATE POLICY booking_rw_staff_service ON "booking"."staff_service"
  TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Grants, as for the other booking tables: explicit per table and per column; no DELETE, no
-- TRUNCATE; never an UPDATE of id / organization_id / staff_member_id / service_id / created_*.
REVOKE ALL ON "booking"."staff_service" FROM PUBLIC;
GRANT SELECT, INSERT ON "booking"."staff_service" TO booking_rw;
GRANT UPDATE ("archived_at", "archived_by_user_id", "updated_at")
  ON "booking"."staff_service" TO booking_rw;
-- the two new flags join the columns booking_rw may already update on their tables
GRANT UPDATE ("all_services") ON "booking"."staff_member" TO booking_rw;
GRANT UPDATE ("all_staff") ON "booking"."service" TO booking_rw;
