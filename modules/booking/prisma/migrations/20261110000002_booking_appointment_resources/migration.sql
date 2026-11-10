-- Lot B.3b (BOOKING.md §3 B.3; plan reports/2026-11-08_2007_plan-booking-b2-b3.md §2.3, approved
-- 08.11.2026, with D-B4-2 = a from the B.4 plan: no btree_gist): the resources an appointment uses.
-- No new role, no extension, no DELETE.
--
--   appointment_resource → a resource used by an appointment, written with the appointment (one per
--                          resource the service needs, B.3a); insert only
--
-- „Două programări nu folosesc aceeași resursă în același timp, nici la cereri paralele” is a rule
-- of the database, as „fără suprapuneri” for the member (B.4a): the resource's row is locked (every
-- write that uses it waits for the previous one, whoever writes, whichever member) and the
-- occupying appointments that use it at the same time are counted against `units`. A refusal is
-- 23P01 with the hint 'resource' (the contract answers Conflict('resource_unavailable')).

-- CreateTable
CREATE TABLE "booking"."appointment_resource" (
  "id"              UUID        NOT NULL,
  "organization_id" UUID        NOT NULL,
  "appointment_id"  UUID        NOT NULL,
  "resource_id"     UUID        NOT NULL,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "appointment_resource_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "appointment_resource_appointment_id_fkey" FOREIGN KEY ("appointment_id")
    REFERENCES "booking"."appointment" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "appointment_resource_resource_id_fkey" FOREIGN KEY ("resource_id")
    REFERENCES "booking"."resource" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "appointment_resource_appointment_id_resource_id_key"
  ON "booking"."appointment_resource" ("appointment_id", "resource_id");
CREATE INDEX "appointment_resource_resource_id_idx"
  ON "booking"."appointment_resource" ("resource_id");

-- The check for one resource and one appointment: the resource's row locked FOR UPDATE, then the
-- other occupying appointments that use it and overlap counted against its units. As booking_rw it
-- runs under RLS: a resource or an appointment of another business is not found.
CREATE OR REPLACE FUNCTION booking.check_resource_free(p_resource UUID, p_appointment UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  occupying CONSTANT TEXT[] := ARRAY['awaiting_payment', 'unconfirmed', 'confirmed', 'in_progress'];
  v_units SMALLINT;
  v_archived TIMESTAMPTZ;
  v_starts TIMESTAMPTZ;
  v_ends TIMESTAMPTZ;
  v_status TEXT;
  taken INTEGER;
BEGIN
  SELECT r.units, r.archived_at INTO v_units, v_archived
    FROM booking.resource r WHERE r.id = p_resource FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'resource % is not a resource of the business', p_resource
      USING ERRCODE = '23514';
  END IF;
  -- an archived resource is not required while archived (S124): nothing to hold
  IF v_archived IS NOT NULL THEN
    RETURN;
  END IF;
  SELECT a.starts_at, a.ends_at, a.status INTO v_starts, v_ends, v_status
    FROM booking.appointment a WHERE a.id = p_appointment;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'appointment % is not an appointment of the business', p_appointment
      USING ERRCODE = '23514';
  END IF;
  IF NOT (v_status = ANY (occupying)) THEN
    RETURN;
  END IF;
  SELECT count(*) INTO taken
    FROM booking.appointment_resource ar
    JOIN booking.appointment a ON a.id = ar.appointment_id
   WHERE ar.resource_id = p_resource
     AND a.id <> p_appointment
     AND a.status = ANY (occupying)
     AND tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(v_starts, v_ends, '[)');
  IF taken >= v_units THEN
    RAISE EXCEPTION 'the resource % has no free unit at that time', p_resource
      USING ERRCODE = '23P01', HINT = 'resource';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION booking.check_resource_free(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION booking.check_resource_free(UUID, UUID) TO booking_rw;

-- A new use: the appointment and the resource of the same business, and a free unit.
CREATE OR REPLACE FUNCTION booking.appointment_resource_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM 1 FROM booking.appointment a
   WHERE a.id = NEW.appointment_id AND a.organization_id = NEW.organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'appointment % is not an appointment of the business', NEW.appointment_id
      USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM booking.resource r
   WHERE r.id = NEW.resource_id AND r.organization_id = NEW.organization_id
     AND r.archived_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'resource % is not an active resource of the business', NEW.resource_id
      USING ERRCODE = '23514';
  END IF;
  PERFORM booking.check_resource_free(NEW.resource_id, NEW.appointment_id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION booking.appointment_resource_guard() FROM PUBLIC;

CREATE TRIGGER appointment_resource_guard
  BEFORE INSERT ON "booking"."appointment_resource"
  FOR EACH ROW EXECUTE FUNCTION booking.appointment_resource_guard();

-- A moved appointment (another start or end) checks again every resource it uses. AFTER: the
-- appointment_guard of B.4a has already locked the member, so the order of the locks is always
-- member, then resource (no deadlock between two writes).
CREATE OR REPLACE FUNCTION booking.appointment_resource_recheck()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  r UUID;
BEGIN
  FOR r IN
    SELECT ar.resource_id FROM booking.appointment_resource ar
     WHERE ar.appointment_id = NEW.id ORDER BY ar.resource_id
  LOOP
    PERFORM booking.check_resource_free(r, NEW.id);
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION booking.appointment_resource_recheck() FROM PUBLIC;

CREATE TRIGGER appointment_resource_recheck
  AFTER UPDATE OF "starts_at", "ends_at" ON "booking"."appointment"
  FOR EACH ROW
  WHEN (NEW."starts_at" IS DISTINCT FROM OLD."starts_at" OR NEW."ends_at" IS DISTINCT FROM OLD."ends_at")
  EXECUTE FUNCTION booking.appointment_resource_recheck();

-- RLS (D-SEC-1): USING + WITH CHECK on the organization of the transaction
ALTER TABLE "booking"."appointment_resource" ENABLE ROW LEVEL SECURITY;

CREATE POLICY booking_rw_appointment_resource ON "booking"."appointment_resource"
  TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Grants: insert only (a use of a resource is never changed or deleted; an appointment that is
-- cancelled or ends stops counting by its state)
REVOKE ALL ON "booking"."appointment_resource" FROM PUBLIC;
GRANT SELECT, INSERT ON "booking"."appointment_resource" TO booking_rw;
