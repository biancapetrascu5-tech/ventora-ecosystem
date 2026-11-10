-- Lot B.4a (BOOKING.md §3 B.4; plan reports/2026-11-09_2150_plan-booking-b4.md, approved 09.11.2026):
-- the appointments and their 7 states (D-B-11, design BookingStatuses, S116), the minimal client
-- (D-B4-1), the booking rules (D-B4-5), the history shown in BookingDetail (D-B4-7), the blocked
-- times and the human number per business (D-B4-8). No new role (booking_rw from booking_init), no
-- extension (D-B4-2 = a: no btree_gist), no DELETE.
--
--   settings             → the booking rules of the business (free cancellation, confirmation, notice,
--                          buffer); one row, written on the first save (until then the defaults)
--   client               → the client of the business, minimal: name, phone, e-mail, language. B.7
--                          adds the behaviour note, the blocked list and the GDPR handler (§6.4 e)
--   appointment_counter  → the last human number of the business (row locked in the transaction)
--   appointment          → an appointment: member, service, client, start / end (instants), state,
--                          the keep_snapshot copies (§6.4 d), the cancellation, the deposit (B.22),
--                          the correction of a final state (S116-D9)
--   appointment_history  → what happened to an appointment (insert only)
--   time_block           → a blocked time of a member (unavailable), no client, no quota
--
-- „Fără suprapuneri” (BOOKING.md B.4, D-B4-2 = a, D-B4-3 = a) is a rule of the database: the trigger
-- locks the member's row (every write for the same member waits for the previous one, whoever
-- writes) and counts what overlaps. service.capacity (B.1) is how many clients the same member can
-- have at the same time for the same service (S123-6); a different service or a blocked time never
-- overlaps.

-- CreateTable
CREATE TABLE "booking"."settings" (
  "organization_id"    UUID        NOT NULL,
  -- „Anulare gratuită cu cel puțin {n} ore înainte” (BookingSettings); 24 by default (D-B4-5)
  "free_cancel_hours"  SMALLINT    NOT NULL DEFAULT 24,
  -- the state of a public booking (B.11): auto → confirmed, manual → unconfirmed
  "confirmation_mode"  VARCHAR(6)  NOT NULL DEFAULT 'auto',
  -- the notice before a booking (B.5, B.11) and the buffer between appointments (B.5), in minutes
  "notice_min"         SMALLINT    NOT NULL DEFAULT 0,
  "buffer_min"         SMALLINT    NOT NULL DEFAULT 0,
  "updated_by_user_id" UUID        NOT NULL,
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "settings_pkey" PRIMARY KEY ("organization_id"),
  CONSTRAINT "settings_free_cancel_hours_check" CHECK ("free_cancel_hours" BETWEEN 0 AND 720),
  CONSTRAINT "settings_confirmation_mode_check" CHECK ("confirmation_mode" IN ('auto', 'manual')),
  CONSTRAINT "settings_notice_check"
    CHECK ("notice_min" BETWEEN 0 AND 10080 AND "notice_min" % 5 = 0),
  CONSTRAINT "settings_buffer_check" CHECK ("buffer_min" BETWEEN 0 AND 120 AND "buffer_min" % 5 = 0)
);

-- CreateTable
CREATE TABLE "booking"."client" (
  "id"                  UUID         NOT NULL,
  "organization_id"     UUID         NOT NULL,
  "name"                VARCHAR(120) NOT NULL,
  -- E.164 (+40712345678)
  "phone"               VARCHAR(16),
  -- lower case, trimmed
  "email"               VARCHAR(254),
  -- D-B-10: the messages to the client in their language
  "locale"              VARCHAR(2)   NOT NULL DEFAULT 'ro',
  "archived_at"         TIMESTAMPTZ,
  "archived_by_user_id" UUID,
  -- NULL = created by the public page (B.11)
  "created_by_user_id"  UUID,
  "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "client_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "client_name_check"
    CHECK ("name" = btrim("name") AND char_length("name") BETWEEN 1 AND 120),
  CONSTRAINT "client_phone_check" CHECK ("phone" IS NULL OR "phone" ~ '^\+[1-9][0-9]{6,14}$'),
  CONSTRAINT "client_email_check" CHECK (
    "email" IS NULL
    OR ("email" = lower(btrim("email")) AND "email" ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
  ),
  CONSTRAINT "client_contact_check" CHECK ("phone" IS NOT NULL OR "email" IS NOT NULL),
  CONSTRAINT "client_locale_check" CHECK ("locale" IN ('ro', 'en', 'fr', 'es', 'de', 'it')),
  CONSTRAINT "client_archived_check"
    CHECK (("archived_at" IS NULL) = ("archived_by_user_id" IS NULL))
);

CREATE INDEX "client_organization_id_name_idx" ON "booking"."client" ("organization_id", "name");

-- the same phone / e-mail once among the active clients of a business; expressions, so that the
-- Prisma drift guard leaves them to the migration (as in booking_staff)
CREATE UNIQUE INDEX "client_active_phone_key"
  ON "booking"."client" ("organization_id", (lower("phone")))
  WHERE "archived_at" IS NULL AND "phone" IS NOT NULL;
CREATE UNIQUE INDEX "client_active_email_key"
  ON "booking"."client" ("organization_id", (lower("email")))
  WHERE "archived_at" IS NULL AND "email" IS NOT NULL;

-- CreateTable
CREATE TABLE "booking"."appointment_counter" (
  "organization_id" UUID    NOT NULL,
  "last_number"     INTEGER NOT NULL,

  CONSTRAINT "appointment_counter_pkey" PRIMARY KEY ("organization_id"),
  CONSTRAINT "appointment_counter_last_number_check" CHECK ("last_number" > 0)
);

-- CreateTable
CREATE TABLE "booking"."appointment" (
  -- given by the caller: it is also the operationId of the quota (B.4b)
  "id"                   UUID         NOT NULL,
  "organization_id"      UUID         NOT NULL,
  "number"               INTEGER      NOT NULL,
  "staff_member_id"      UUID         NOT NULL,
  "service_id"           UUID         NOT NULL,
  "client_id"            UUID         NOT NULL,
  "starts_at"            TIMESTAMPTZ  NOT NULL,
  "ends_at"              TIMESTAMPTZ  NOT NULL,
  -- S123-3: the chosen duration, between the service's minimum and maximum
  "duration_minutes"     SMALLINT     NOT NULL,
  -- how many clients the member can have at once for this service (S123-6), copied at creation
  "capacity"             SMALLINT     NOT NULL,
  "status"               VARCHAR(16)  NOT NULL,
  "status_changed_at"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- keep_snapshot (§6.4 d): what the history shows when the service, the member or the client change
  "service_name"         VARCHAR(120) NOT NULL,
  "staff_display_name"   VARCHAR(120) NOT NULL,
  "client_name"          VARCHAR(120) NOT NULL,
  "price_kind"           VARCHAR(8)   NOT NULL,
  "price_minor"          INTEGER      NOT NULL,
  "price_max_minor"      INTEGER,
  "currency"             CHAR(3)      NOT NULL,
  -- the team's note (BookingDetail), never shown to the client
  "team_note"            VARCHAR(1000),
  "source"               VARCHAR(6)   NOT NULL DEFAULT 'hub',
  -- „Anulată de client / de {name} · cu {time} înainte”
  "cancelled_at"         TIMESTAMPTZ,
  "cancelled_by"         VARCHAR(8),
  "cancelled_by_user_id" UUID,
  "cancel_minutes_before" INTEGER,
  -- outside the free cancellation (settings.free_cancel_hours at the time of cancelling)
  "cancel_late"          BOOLEAN,
  -- „Așteaptă plata” (B.22): the deposit asked and until when the time is kept
  "deposit_minor"        INTEGER,
  "deposit_currency"     CHAR(3),
  "payment_due_at"       TIMESTAMPTZ,
  -- S116-D9: a final state corrected within 24 hours by the owner or an admin, with a reason
  "corrected_at"         TIMESTAMPTZ,
  "corrected_by_user_id" UUID,
  "correction_reason"    VARCHAR(500),
  -- NULL = the public page (B.11)
  "created_by_user_id"   UUID,
  "created_at"           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"           TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "appointment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "appointment_staff_member_id_fkey" FOREIGN KEY ("staff_member_id")
    REFERENCES "booking"."staff_member" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "appointment_service_id_fkey" FOREIGN KEY ("service_id")
    REFERENCES "booking"."service" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "appointment_client_id_fkey" FOREIGN KEY ("client_id")
    REFERENCES "booking"."client" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "appointment_number_check" CHECK ("number" > 0),
  CONSTRAINT "appointment_duration_check" CHECK (
    "duration_minutes" BETWEEN 5 AND 480 AND "duration_minutes" % 5 = 0
    AND "ends_at" = "starts_at" + make_interval(mins => "duration_minutes")
  ),
  CONSTRAINT "appointment_capacity_check" CHECK ("capacity" BETWEEN 1 AND 100),
  CONSTRAINT "appointment_status_check" CHECK ("status" IN (
    'awaiting_payment', 'unconfirmed', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'
  )),
  CONSTRAINT "appointment_price_check" CHECK (
    "price_kind" IN ('fixed', 'from', 'range') AND "price_minor" BETWEEN 0 AND 10000000
    AND ("price_max_minor" IS NULL OR "price_max_minor" BETWEEN 0 AND 10000000)
    AND "currency" IN ('RON', 'EUR')
  ),
  CONSTRAINT "appointment_team_note_check"
    CHECK ("team_note" IS NULL OR char_length("team_note") BETWEEN 1 AND 1000),
  CONSTRAINT "appointment_source_check" CHECK ("source" IN ('hub', 'public')),
  CONSTRAINT "appointment_cancel_check" CHECK (
    ("status" = 'cancelled'
      AND "cancelled_at" IS NOT NULL AND "cancelled_by" IN ('client', 'business')
      AND "cancel_minutes_before" IS NOT NULL AND "cancel_late" IS NOT NULL)
    OR ("status" <> 'cancelled'
      AND "cancelled_at" IS NULL AND "cancelled_by" IS NULL AND "cancelled_by_user_id" IS NULL
      AND "cancel_minutes_before" IS NULL AND "cancel_late" IS NULL)
  ),
  CONSTRAINT "appointment_deposit_check" CHECK (
    ("deposit_minor" IS NULL AND "deposit_currency" IS NULL AND "payment_due_at" IS NULL)
    OR ("deposit_minor" BETWEEN 1 AND 10000000 AND "deposit_currency" IN ('RON', 'EUR')
        AND "payment_due_at" IS NOT NULL)
  ),
  CONSTRAINT "appointment_awaiting_payment_check"
    CHECK ("status" <> 'awaiting_payment' OR "deposit_minor" IS NOT NULL),
  CONSTRAINT "appointment_correction_check" CHECK (
    ("corrected_at" IS NULL AND "corrected_by_user_id" IS NULL AND "correction_reason" IS NULL)
    OR ("corrected_at" IS NOT NULL AND "corrected_by_user_id" IS NOT NULL
        AND char_length("correction_reason") BETWEEN 1 AND 500)
  )
);

CREATE UNIQUE INDEX "appointment_organization_id_number_key"
  ON "booking"."appointment" ("organization_id", "number");
CREATE INDEX "appointment_organization_id_starts_idx"
  ON "booking"."appointment" ("organization_id", "starts_at");
CREATE INDEX "appointment_staff_member_id_starts_idx"
  ON "booking"."appointment" ("staff_member_id", "starts_at");
CREATE INDEX "appointment_client_id_starts_idx"
  ON "booking"."appointment" ("client_id", "starts_at");
CREATE INDEX "appointment_service_id_starts_idx"
  ON "booking"."appointment" ("service_id", "starts_at");

-- CreateTable
CREATE TABLE "booking"."appointment_history" (
  "id"              UUID        NOT NULL,
  "organization_id" UUID        NOT NULL,
  "appointment_id"  UUID        NOT NULL,
  -- created | status | moved | corrected | updated
  "kind"            VARCHAR(10) NOT NULL,
  "from_status"     VARCHAR(16),
  "to_status"       VARCHAR(16),
  -- after a creation or a move: where the appointment is now
  "starts_at"       TIMESTAMPTZ,
  "ends_at"         TIMESTAMPTZ,
  "staff_member_id" UUID,
  "actor_type"      VARCHAR(6)  NOT NULL,
  "actor_user_id"   UUID,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "appointment_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "appointment_history_appointment_id_fkey" FOREIGN KEY ("appointment_id")
    REFERENCES "booking"."appointment" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "appointment_history_kind_check"
    CHECK ("kind" IN ('created', 'status', 'moved', 'corrected', 'updated')),
  CONSTRAINT "appointment_history_actor_check" CHECK (
    "actor_type" IN ('user', 'client', 'system')
    AND (("actor_type" = 'user') = ("actor_user_id" IS NOT NULL))
  )
);

CREATE INDEX "appointment_history_appointment_id_idx"
  ON "booking"."appointment_history" ("appointment_id", "created_at");

-- CreateTable
CREATE TABLE "booking"."time_block" (
  "id"                  UUID         NOT NULL,
  "organization_id"     UUID         NOT NULL,
  "staff_member_id"     UUID         NOT NULL,
  "starts_at"           TIMESTAMPTZ  NOT NULL,
  "ends_at"             TIMESTAMPTZ  NOT NULL,
  "reason"              VARCHAR(200),
  "archived_at"         TIMESTAMPTZ,
  "archived_by_user_id" UUID,
  "created_by_user_id"  UUID         NOT NULL,
  "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "time_block_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "time_block_staff_member_id_fkey" FOREIGN KEY ("staff_member_id")
    REFERENCES "booking"."staff_member" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  -- at most 7 days; a longer absence is a leave (B.2)
  CONSTRAINT "time_block_range_check"
    CHECK ("ends_at" > "starts_at" AND "ends_at" - "starts_at" <= interval '7 days'),
  CONSTRAINT "time_block_reason_check"
    CHECK ("reason" IS NULL OR char_length("reason") BETWEEN 1 AND 200),
  CONSTRAINT "time_block_archived_check"
    CHECK (("archived_at" IS NULL) = ("archived_by_user_id" IS NULL))
);

CREATE INDEX "time_block_staff_member_id_starts_idx"
  ON "booking"."time_block" ("staff_member_id", "starts_at");

-- ── the rules in the database ─────────────────────────────────────────────────────────────────

-- The member's row, locked: every write that can make an overlap for this member waits here for the
-- previous one (Hub, the public page, the jobs), so the count below sees the committed result. As
-- booking_rw it runs under RLS: a member of another business is not found. FOR UPDATE: the
-- staff_child_guard of B.2 takes FOR SHARE on the same row, so a member being archived and a new
-- appointment for them also wait for each other.
CREATE OR REPLACE FUNCTION booking.lock_active_staff(p_staff UUID, p_org UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM 1 FROM booking.staff_member m
   WHERE m.id = p_staff AND m.organization_id = p_org AND m.archived_at IS NULL
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'staff member % is not an active member of the calendar', p_staff
      USING ERRCODE = '23514';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION booking.lock_active_staff(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION booking.lock_active_staff(UUID, UUID) TO booking_rw;

-- The states (BookingStatuses, S116): the allowed transitions, the final states, „Nu a venit” only
-- after the start, the correction (S116-D9, D-B4-11 = a); then no overlap for the member.
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
    ) THEN
      RAISE EXCEPTION 'the appointment overlaps another one or a blocked time of the member'
        USING ERRCODE = '23P01';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION booking.appointment_guard() FROM PUBLIC;

CREATE TRIGGER appointment_guard
  BEFORE INSERT OR UPDATE ON "booking"."appointment"
  FOR EACH ROW EXECUTE FUNCTION booking.appointment_guard();

-- A blocked time: an active member of the business, and nothing occupying under it.
CREATE OR REPLACE FUNCTION booking.time_block_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.archived_at IS NULL AND (
       TG_OP = 'INSERT'
       OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
       OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
       OR OLD.archived_at IS NOT NULL) THEN
    PERFORM booking.lock_active_staff(NEW.staff_member_id, NEW.organization_id);
    IF EXISTS (
      SELECT 1 FROM booking.appointment a
       WHERE a.staff_member_id = NEW.staff_member_id
         AND a.status IN ('awaiting_payment', 'unconfirmed', 'confirmed', 'in_progress')
         AND tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(NEW.starts_at, NEW.ends_at, '[)')
    ) THEN
      RAISE EXCEPTION 'the blocked time overlaps an appointment of the member'
        USING ERRCODE = '23P01';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION booking.time_block_guard() FROM PUBLIC;

CREATE TRIGGER time_block_guard
  BEFORE INSERT OR UPDATE ON "booking"."time_block"
  FOR EACH ROW EXECUTE FUNCTION booking.time_block_guard();

-- updated_at (booking.touch_updated_at from booking_init)
CREATE TRIGGER settings_touch
  BEFORE UPDATE ON "booking"."settings"
  FOR EACH ROW EXECUTE FUNCTION booking.touch_updated_at();
CREATE TRIGGER client_touch
  BEFORE UPDATE ON "booking"."client"
  FOR EACH ROW EXECUTE FUNCTION booking.touch_updated_at();

-- RLS (D-SEC-1): USING + WITH CHECK on the organization of the transaction, on every table
ALTER TABLE "booking"."settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "booking"."client" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "booking"."appointment_counter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "booking"."appointment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "booking"."appointment_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "booking"."time_block" ENABLE ROW LEVEL SECURITY;

CREATE POLICY booking_rw_settings ON "booking"."settings"
  TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY booking_rw_client ON "booking"."client"
  TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY booking_rw_appointment_counter ON "booking"."appointment_counter"
  TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY booking_rw_appointment ON "booking"."appointment"
  TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY booking_rw_appointment_history ON "booking"."appointment_history"
  TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY booking_rw_time_block ON "booking"."time_block"
  TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Grants (plan §8): explicit per table and per column; no DELETE, no TRUNCATE. Never an UPDATE of
-- id / organization_id / number / service_id / client_id / the service and price copies / created_*;
-- appointment_history is insert only.
REVOKE ALL ON "booking"."settings", "booking"."client", "booking"."appointment_counter",
              "booking"."appointment", "booking"."appointment_history", "booking"."time_block"
  FROM PUBLIC;
GRANT SELECT, INSERT ON "booking"."settings", "booking"."client", "booking"."appointment_counter",
                        "booking"."appointment", "booking"."appointment_history",
                        "booking"."time_block" TO booking_rw;
GRANT UPDATE ("free_cancel_hours", "confirmation_mode", "notice_min", "buffer_min",
              "updated_by_user_id", "updated_at")
  ON "booking"."settings" TO booking_rw;
GRANT UPDATE ("name", "phone", "email", "locale", "archived_at", "archived_by_user_id", "updated_at")
  ON "booking"."client" TO booking_rw;
GRANT UPDATE ("last_number") ON "booking"."appointment_counter" TO booking_rw;
GRANT UPDATE ("status", "status_changed_at", "starts_at", "ends_at", "duration_minutes",
              "staff_member_id", "staff_display_name", "team_note",
              "cancelled_at", "cancelled_by", "cancelled_by_user_id", "cancel_minutes_before",
              "cancel_late", "deposit_minor", "deposit_currency", "payment_due_at",
              "corrected_at", "corrected_by_user_id", "correction_reason", "updated_at")
  ON "booking"."appointment" TO booking_rw;
GRANT UPDATE ("starts_at", "ends_at", "reason", "archived_at", "archived_by_user_id", "updated_at")
  ON "booking"."time_block" TO booking_rw;
