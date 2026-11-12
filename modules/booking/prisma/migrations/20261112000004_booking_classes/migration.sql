-- Lot B.9d1 — classes and groups (design BookingClasses, S126; plan
-- reports/2026-11-12_plan-booking-b9.md). D-9d-1: a class is a service with „Clienți în același
-- timp” > 1; its sessions sit in the calendar (the member, the room, the seats); the participants
-- are ordinary appointments tied to the session (class_session_id), one per client, each with its
-- state, history and quota unit. The waiting list of a class (D-9d-2) and the online booking
-- (D-9d-3) are B.9d2.
--
-- The rules that must hold whoever writes are in the database:
--   - a scheduled session holds its member: no other appointment of the member (except its own
--     participants), no other session, no blocked time at the same time (appointment_guard
--     recreated with its whole body plus the sessions; class_session_guard);
--   - a scheduled session holds one unit of its room (check_resource_free recreated with its whole
--     body plus the sessions; class_session_guard counts the appointments that use the room);
--   - the participants of a session are at most its seats: their capacity is the session's seats,
--     and appointment_guard already counts the overlapping appointments of the same service.
-- No new role, no DELETE; erase_client unchanged (a session holds no personal data).

CREATE TABLE "booking"."class_session" (
  "id"                   UUID         NOT NULL,
  "organization_id"      UUID         NOT NULL,
  "service_id"           UUID         NOT NULL,
  "staff_member_id"      UUID         NOT NULL,
  -- the room (a resource, B.3a); NULL = no room
  "resource_id"          UUID,
  -- B.10: where it takes place (the member's or the room's location)
  "location_id"          UUID,
  -- „Locuri”: from the catalogue (service.capacity), changeable for this session
  "seats"                SMALLINT     NOT NULL,
  "starts_at"            TIMESTAMPTZ  NOT NULL,
  "ends_at"              TIMESTAMPTZ  NOT NULL,
  "status"               VARCHAR(10)  NOT NULL DEFAULT 'scheduled',
  "cancelled_at"         TIMESTAMPTZ,
  "cancelled_by_user_id" UUID,
  -- „Se repetă săptămânal”: the sessions created together share this id
  "repeat_group_id"      UUID,
  "created_by_user_id"   UUID         NOT NULL,
  "created_at"           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"           TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "class_session_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "class_session_service_id_fkey" FOREIGN KEY ("service_id")
    REFERENCES "booking"."service" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "class_session_staff_member_id_fkey" FOREIGN KEY ("staff_member_id")
    REFERENCES "booking"."staff_member" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "class_session_resource_id_fkey" FOREIGN KEY ("resource_id")
    REFERENCES "booking"."resource" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "class_session_seats_check" CHECK ("seats" BETWEEN 2 AND 100),
  CONSTRAINT "class_session_time_check" CHECK (
    "ends_at" > "starts_at" AND "ends_at" <= "starts_at" + interval '8 hours'
  ),
  CONSTRAINT "class_session_status_check" CHECK (
    ("status" = 'scheduled' AND "cancelled_at" IS NULL AND "cancelled_by_user_id" IS NULL)
    OR ("status" = 'cancelled' AND "cancelled_at" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "class_session_organization_id_id_key"
  ON "booking"."class_session" ("organization_id", "id");
CREATE INDEX "class_session_organization_id_starts_idx"
  ON "booking"."class_session" ("organization_id", "starts_at");
CREATE INDEX "class_session_staff_member_id_starts_idx"
  ON "booking"."class_session" ("staff_member_id", "starts_at");
CREATE INDEX "class_session_resource_id_starts_idx"
  ON "booking"."class_session" ("resource_id", "starts_at");

ALTER TABLE "booking"."appointment" ADD COLUMN "class_session_id" UUID;
ALTER TABLE "booking"."appointment"
  ADD CONSTRAINT "appointment_class_session_fkey" FOREIGN KEY ("organization_id", "class_session_id")
    REFERENCES "booking"."class_session" ("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  -- a participant is neither a step of a visit (B.9a) nor an appointment of a series (B.9b)
  ADD CONSTRAINT "appointment_class_session_check"
    CHECK ("class_session_id" IS NULL OR ("visit_id" IS NULL AND "series_id" IS NULL));
CREATE INDEX "appointment_class_session_id_idx" ON "booking"."appointment" ("class_session_id");

-- ── a session holds its member and its room ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION booking.class_session_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  occupying CONSTANT TEXT[] := ARRAY['awaiting_payment', 'unconfirmed', 'confirmed', 'in_progress'];
  v_units SMALLINT;
  taken INTEGER;
BEGIN
  NEW.updated_at := now();
  IF NEW.status <> 'scheduled' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'a cancelled session is not scheduled again' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.starts_at = OLD.starts_at AND NEW.ends_at = OLD.ends_at
     AND NEW.staff_member_id = OLD.staff_member_id
     AND NEW.resource_id IS NOT DISTINCT FROM OLD.resource_id THEN
    RETURN NEW;
  END IF;

  -- the member: the same lock as the appointments (B.4a), then nothing else at the same time
  PERFORM booking.lock_active_staff(NEW.staff_member_id, NEW.organization_id);
  IF EXISTS (
       SELECT 1 FROM booking.appointment a
        WHERE a.staff_member_id = NEW.staff_member_id
          AND a.status = ANY (occupying)
          AND a.class_session_id IS DISTINCT FROM NEW.id
          AND tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(NEW.starts_at, NEW.ends_at, '[)'))
     OR EXISTS (
       SELECT 1 FROM booking.class_session s
        WHERE s.staff_member_id = NEW.staff_member_id AND s.id <> NEW.id
          AND s.status = 'scheduled'
          AND tstzrange(s.starts_at, s.ends_at, '[)') && tstzrange(NEW.starts_at, NEW.ends_at, '[)'))
     OR EXISTS (
       SELECT 1 FROM booking.time_block b
        WHERE b.staff_member_id = NEW.staff_member_id AND b.archived_at IS NULL
          AND tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(NEW.starts_at, NEW.ends_at, '[)'))
  THEN
    RAISE EXCEPTION 'the session overlaps another appointment, session or blocked time of the member'
      USING ERRCODE = '23P01';
  END IF;

  -- the room: its row locked, then its uses at the same time counted against its units
  IF NEW.resource_id IS NOT NULL THEN
    SELECT r.units INTO v_units
      FROM booking.resource r
     WHERE r.id = NEW.resource_id AND r.organization_id = NEW.organization_id
       AND r.archived_at IS NULL
       FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'resource % is not an active resource of the business', NEW.resource_id
        USING ERRCODE = '23514';
    END IF;
    SELECT
      (SELECT count(*) FROM booking.appointment_resource ar
         JOIN booking.appointment a ON a.id = ar.appointment_id
        WHERE ar.resource_id = NEW.resource_id AND a.status = ANY (occupying)
          AND tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(NEW.starts_at, NEW.ends_at, '[)'))
      + (SELECT count(*) FROM booking.class_session s
          WHERE s.resource_id = NEW.resource_id AND s.id <> NEW.id AND s.status = 'scheduled'
            AND tstzrange(s.starts_at, s.ends_at, '[)') && tstzrange(NEW.starts_at, NEW.ends_at, '[)'))
      INTO taken;
    IF taken >= v_units THEN
      RAISE EXCEPTION 'the resource % has no free unit at that time', NEW.resource_id
        USING ERRCODE = '23P01', HINT = 'resource';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION booking.class_session_guard() FROM PUBLIC;

CREATE TRIGGER class_session_guard
  BEFORE INSERT OR UPDATE ON "booking"."class_session"
  FOR EACH ROW EXECUTE FUNCTION booking.class_session_guard();

-- ── check_resource_free (B.3b), recreated: the whole body plus the sessions in the room ─────
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
  -- B.9d1: a scheduled session holds one unit of its room
  taken := taken + (
    SELECT count(*) FROM booking.class_session s
     WHERE s.resource_id = p_resource AND s.status = 'scheduled'
       AND tstzrange(s.starts_at, s.ends_at, '[)') && tstzrange(v_starts, v_ends, '[)'));
  IF taken >= v_units THEN
    RAISE EXCEPTION 'the resource % has no free unit at that time', p_resource
      USING ERRCODE = '23P01', HINT = 'resource';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION booking.check_resource_free(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION booking.check_resource_free(UUID, UUID) TO booking_rw;

-- ── appointment_guard (B.4a), recreated: the whole body plus the sessions of the member ─────
CREATE OR REPLACE FUNCTION booking.appointment_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  occupying CONSTANT TEXT[] := ARRAY['awaiting_payment', 'unconfirmed', 'confirmed', 'in_progress'];
  moved BOOLEAN;
  same_service INTEGER;
  other INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('awaiting_payment', 'unconfirmed', 'confirmed') THEN
      RAISE EXCEPTION 'an appointment starts as awaiting_payment, unconfirmed or confirmed'
        USING ERRCODE = '23514';
    END IF;
    moved := true;
  ELSE
    moved := NEW.starts_at IS DISTINCT FROM OLD.starts_at
          OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
          OR NEW.staff_member_id IS DISTINCT FROM OLD.staff_member_id;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.corrected_at IS DISTINCT FROM OLD.corrected_at THEN
        -- the correction: only between „Încheiată” and „Nu a venit”
        IF NOT ((OLD.status = 'completed' AND NEW.status = 'no_show')
             OR (OLD.status = 'no_show' AND NEW.status = 'completed')) THEN
          RAISE EXCEPTION 'correction from % to % is not allowed', OLD.status, NEW.status
            USING ERRCODE = '23514';
        END IF;
      ELSIF NOT (
           (OLD.status = 'awaiting_payment' AND NEW.status IN ('confirmed', 'cancelled'))
        OR (OLD.status = 'unconfirmed' AND NEW.status IN ('confirmed', 'cancelled', 'no_show'))
        OR (OLD.status = 'confirmed' AND NEW.status IN ('in_progress', 'cancelled', 'no_show'))
        OR (OLD.status = 'in_progress' AND NEW.status = 'completed')
      ) THEN
        RAISE EXCEPTION 'transition from % to % is not allowed', OLD.status, NEW.status
          USING ERRCODE = '23514';
      END IF;
      IF NEW.status = 'no_show' AND OLD.status <> 'completed' AND now() < NEW.starts_at THEN
        RAISE EXCEPTION 'no_show before the start' USING ERRCODE = '23514';
      END IF;
      NEW.status_changed_at := now();
    ELSIF NEW.corrected_at IS DISTINCT FROM OLD.corrected_at THEN
      RAISE EXCEPTION 'a correction changes the state' USING ERRCODE = '23514';
    END IF;

    IF moved AND OLD.status NOT IN ('awaiting_payment', 'unconfirmed', 'confirmed') THEN
      RAISE EXCEPTION 'an appointment in state % is not moved', OLD.status USING ERRCODE = '23514';
    END IF;
  END IF;

  NEW.updated_at := now();

  -- no overlap: only when the appointment (still) occupies and its time or member is new
  IF NEW.status = ANY (occupying) AND moved THEN
    PERFORM booking.lock_active_staff(NEW.staff_member_id, NEW.organization_id);

    SELECT count(*) FILTER (WHERE a.service_id = NEW.service_id),
           count(*) FILTER (WHERE a.service_id <> NEW.service_id)
      INTO same_service, other
      FROM booking.appointment a
     WHERE a.staff_member_id = NEW.staff_member_id
       AND a.id <> NEW.id
       AND a.status = ANY (occupying)
       AND tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(NEW.starts_at, NEW.ends_at, '[)');

    IF other > 0 OR same_service >= NEW.capacity OR EXISTS (
      SELECT 1 FROM booking.time_block b
       WHERE b.staff_member_id = NEW.staff_member_id
         AND b.archived_at IS NULL
         AND tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(NEW.starts_at, NEW.ends_at, '[)')
    ) OR EXISTS (
      -- B.9d1: a scheduled session of the member, other than the appointment's own session
      SELECT 1 FROM booking.class_session s
       WHERE s.staff_member_id = NEW.staff_member_id
         AND s.status = 'scheduled'
         AND s.id IS DISTINCT FROM NEW.class_session_id
         AND tstzrange(s.starts_at, s.ends_at, '[)') && tstzrange(NEW.starts_at, NEW.ends_at, '[)')
    ) THEN
      RAISE EXCEPTION 'the appointment overlaps another one or a blocked time of the member'
        USING ERRCODE = '23P01';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION booking.appointment_guard() FROM PUBLIC;

-- RLS (D-SEC-1): USING + WITH CHECK on the organization of the transaction
ALTER TABLE "booking"."class_session" ENABLE ROW LEVEL SECURITY;
CREATE POLICY booking_rw_class_session ON "booking"."class_session"
  FOR ALL TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Grants (only booking_rw): no DELETE, no TRUNCATE; a session is only cancelled. The new column of
-- appointment is written only at INSERT (already granted).
REVOKE ALL ON "booking"."class_session" FROM PUBLIC;
GRANT SELECT, INSERT ON "booking"."class_session" TO booking_rw;
GRANT UPDATE ("status", "cancelled_at", "cancelled_by_user_id", "updated_at")
  ON "booking"."class_session" TO booking_rw;
