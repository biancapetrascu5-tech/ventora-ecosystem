-- Lot B.2 (BOOKING.md §3; plan reports/2026-11-08_2007_plan-booking-b2-b3.md, approved 08.11.2026):
-- the members in the calendar and their schedule. No new role (booking_rw from booking_init), no
-- extension, no DELETE (the rows are archived or updated, like the catalog in B.1).
--
--   business_hours      → the business's week: 7 rows, one interval per day (BookingSettings)
--   staff_member        → a member of the business in the calendar (D-B-1: only members with an
--                         account and EasyBook, D-B2-1 = a). S124: members join and leave the
--                         calendar from Hub · Echipă și invitații, so the rows follow the team
--                         (created, archived, restored by the module, created_by / archived_by NULL
--                         = automatic); display_name is the keep_snapshot copy (§6.4 d)
--   staff_weekly_hours  → the member's own week (schedule_mode = 'custom'): at most two intervals a
--                         day, the gap between them is the break (D-B2-3 = a)
--   staff_day_override  → one date that replaces the week (off, or other hours)
--   staff_time_off      → leave: a range of days, with an optional reason that only the owner and
--                         the admins see (S124; the calendar shows only „Concediu”)
--
-- Times are local wall-clock minutes of the business (0–1440, steps of 5) and dates are local
-- DATEs; the business time zone (C.0) turns them into instants only when they are read, so the
-- change to or from summer time does not move the schedule.

-- CreateTable
CREATE TABLE "booking"."business_hours" (
  "organization_id"    UUID        NOT NULL,
  -- ISO: 1 = Monday … 7 = Sunday
  "weekday"            SMALLINT    NOT NULL,
  "is_open"            BOOLEAN     NOT NULL,
  "opens_at_min"       SMALLINT,
  "closes_at_min"      SMALLINT,
  "updated_by_user_id" UUID        NOT NULL,
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "business_hours_pkey" PRIMARY KEY ("organization_id", "weekday"),
  CONSTRAINT "business_hours_weekday_check" CHECK ("weekday" BETWEEN 1 AND 7),
  CONSTRAINT "business_hours_interval_check" CHECK (
    (NOT "is_open" AND "opens_at_min" IS NULL AND "closes_at_min" IS NULL)
    OR ("is_open" AND "opens_at_min" IS NOT NULL AND "closes_at_min" IS NOT NULL
        AND "opens_at_min" >= 0 AND "opens_at_min" < "closes_at_min" AND "closes_at_min" <= 1440
        AND "opens_at_min" % 5 = 0 AND "closes_at_min" % 5 = 0)
  )
);

-- CreateTable
CREATE TABLE "booking"."staff_member" (
  "id"                  UUID         NOT NULL,
  "organization_id"     UUID         NOT NULL,
  -- the user (core/identity); no FK across schemas, validated on write (§6.4 b)
  "user_id"             UUID         NOT NULL,
  "display_name"        VARCHAR(120) NOT NULL,
  "schedule_mode"       VARCHAR(8)   NOT NULL DEFAULT 'business',
  "bookable_online"     BOOLEAN      NOT NULL DEFAULT true,
  "sort_order"          INTEGER      NOT NULL DEFAULT 0,
  -- „Scos din calendar pe {date}” (S124): the member left the team or lost EasyBook
  "archived_at"         TIMESTAMPTZ,
  -- NULL = archived / created by the module when the team changed (S124), not by a person
  "archived_by_user_id" UUID,
  "created_by_user_id"  UUID,
  "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "staff_member_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "staff_member_display_name_check"
    CHECK ("display_name" = btrim("display_name") AND char_length("display_name") BETWEEN 1 AND 120),
  CONSTRAINT "staff_member_schedule_mode_check" CHECK ("schedule_mode" IN ('business', 'custom')),
  CONSTRAINT "staff_member_sort_order_check" CHECK ("sort_order" BETWEEN 0 AND 1000000),
  CONSTRAINT "staff_member_archived_check"
    CHECK ("archived_by_user_id" IS NULL OR "archived_at" IS NOT NULL)
);

-- the calendar's columns, in order
CREATE INDEX "staff_member_organization_id_sort_idx"
  ON "booking"."staff_member" ("organization_id", "sort_order");
-- a person is in the calendar at most once (archived rows are restored, D-B2-4 = a); the
-- expression keeps the partial index out of the Prisma schema, like the name indexes of B.1
CREATE UNIQUE INDEX "staff_member_active_user_key"
  ON "booking"."staff_member" ("organization_id", ("user_id"::text))
  WHERE "archived_at" IS NULL;

-- CreateTable
CREATE TABLE "booking"."staff_weekly_hours" (
  "staff_member_id" UUID        NOT NULL,
  "weekday"         SMALLINT    NOT NULL,
  "organization_id" UUID        NOT NULL,
  "is_working"      BOOLEAN     NOT NULL,
  "start1_min"      SMALLINT,
  "end1_min"        SMALLINT,
  "start2_min"      SMALLINT,
  "end2_min"        SMALLINT,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "staff_weekly_hours_pkey" PRIMARY KEY ("staff_member_id", "weekday"),
  CONSTRAINT "staff_weekly_hours_staff_member_id_fkey" FOREIGN KEY ("staff_member_id")
    REFERENCES "booking"."staff_member" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "staff_weekly_hours_weekday_check" CHECK ("weekday" BETWEEN 1 AND 7),
  CONSTRAINT "staff_weekly_hours_interval_check" CHECK (
    (NOT "is_working" AND "start1_min" IS NULL AND "end1_min" IS NULL
     AND "start2_min" IS NULL AND "end2_min" IS NULL)
    OR ("is_working" AND "start1_min" IS NOT NULL AND "end1_min" IS NOT NULL
        AND "start1_min" >= 0 AND "start1_min" < "end1_min" AND "end1_min" <= 1440
        AND "start1_min" % 5 = 0 AND "end1_min" % 5 = 0
        AND (("start2_min" IS NULL AND "end2_min" IS NULL)
             OR ("start2_min" IS NOT NULL AND "end2_min" IS NOT NULL
                 AND "end1_min" < "start2_min" AND "start2_min" < "end2_min" AND "end2_min" <= 1440
                 AND "start2_min" % 5 = 0 AND "end2_min" % 5 = 0)))
  )
);

CREATE INDEX "staff_weekly_hours_organization_id_idx"
  ON "booking"."staff_weekly_hours" ("organization_id");

-- CreateTable
CREATE TABLE "booking"."staff_day_override" (
  "id"                  UUID         NOT NULL,
  "organization_id"     UUID         NOT NULL,
  "staff_member_id"     UUID         NOT NULL,
  "on_date"             DATE         NOT NULL,
  "is_working"          BOOLEAN      NOT NULL,
  "start1_min"          SMALLINT,
  "end1_min"            SMALLINT,
  "start2_min"          SMALLINT,
  "end2_min"            SMALLINT,
  "archived_at"         TIMESTAMPTZ,
  "archived_by_user_id" UUID,
  "created_by_user_id"  UUID         NOT NULL,
  "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "staff_day_override_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "staff_day_override_staff_member_id_fkey" FOREIGN KEY ("staff_member_id")
    REFERENCES "booking"."staff_member" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "staff_day_override_interval_check" CHECK (
    (NOT "is_working" AND "start1_min" IS NULL AND "end1_min" IS NULL
     AND "start2_min" IS NULL AND "end2_min" IS NULL)
    OR ("is_working" AND "start1_min" IS NOT NULL AND "end1_min" IS NOT NULL
        AND "start1_min" >= 0 AND "start1_min" < "end1_min" AND "end1_min" <= 1440
        AND "start1_min" % 5 = 0 AND "end1_min" % 5 = 0
        AND (("start2_min" IS NULL AND "end2_min" IS NULL)
             OR ("start2_min" IS NOT NULL AND "end2_min" IS NOT NULL
                 AND "end1_min" < "start2_min" AND "start2_min" < "end2_min" AND "end2_min" <= 1440
                 AND "start2_min" % 5 = 0 AND "end2_min" % 5 = 0)))
  ),
  CONSTRAINT "staff_day_override_archived_check"
    CHECK (("archived_at" IS NULL) = ("archived_by_user_id" IS NULL))
);

CREATE INDEX "staff_day_override_staff_date_idx"
  ON "booking"."staff_day_override" ("staff_member_id", "on_date");
-- one active exception per member and date (the date as a day number: an immutable expression,
-- which keeps the partial index out of the Prisma schema)
CREATE UNIQUE INDEX "staff_day_override_active_date_key"
  ON "booking"."staff_day_override" ("staff_member_id", ("on_date" - DATE '2000-01-01'))
  WHERE "archived_at" IS NULL;

-- CreateTable
CREATE TABLE "booking"."staff_time_off" (
  "id"                  UUID         NOT NULL,
  "organization_id"     UUID         NOT NULL,
  "staff_member_id"     UUID         NOT NULL,
  "starts_on"           DATE         NOT NULL,
  "ends_on"             DATE         NOT NULL,
  -- optional; only the owner and the admins see it (S124)
  "reason"              VARCHAR(200),
  "archived_at"         TIMESTAMPTZ,
  "archived_by_user_id" UUID,
  "created_by_user_id"  UUID         NOT NULL,
  "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "staff_time_off_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "staff_time_off_staff_member_id_fkey" FOREIGN KEY ("staff_member_id")
    REFERENCES "booking"."staff_member" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  -- inclusive range, at most 366 days
  CONSTRAINT "staff_time_off_range_check"
    CHECK ("starts_on" <= "ends_on" AND "ends_on" - "starts_on" <= 365),
  CONSTRAINT "staff_time_off_reason_check"
    CHECK ("reason" IS NULL OR char_length("reason") BETWEEN 1 AND 200),
  CONSTRAINT "staff_time_off_archived_check"
    CHECK (("archived_at" IS NULL) = ("archived_by_user_id" IS NULL))
);

CREATE INDEX "staff_time_off_staff_starts_idx"
  ON "booking"."staff_time_off" ("staff_member_id", "starts_on");

-- A row of a member's schedule belongs to an active member of the same business, whoever writes:
-- on insert and on every update that leaves the row active (archiving an exception or a leave of
-- an archived member stays possible). SECURITY INVOKER: as booking_rw the lookup runs under RLS, so
-- a member of another business is not found. FOR SHARE waits for an archiving of the member in
-- progress and then sees its result.
CREATE OR REPLACE FUNCTION booking.staff_child_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (to_jsonb(NEW) ->> 'archived_at') IS NULL THEN
    PERFORM 1 FROM booking.staff_member m
     WHERE m.id = NEW.staff_member_id
       AND m.organization_id = NEW.organization_id
       AND m.archived_at IS NULL
       FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'staff member % is not an active member of the calendar', NEW.staff_member_id
        USING ERRCODE = '23514';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION booking.staff_child_guard() FROM PUBLIC;

CREATE TRIGGER staff_weekly_hours_guard
  BEFORE INSERT OR UPDATE ON "booking"."staff_weekly_hours"
  FOR EACH ROW EXECUTE FUNCTION booking.staff_child_guard();
CREATE TRIGGER staff_day_override_guard
  BEFORE INSERT OR UPDATE ON "booking"."staff_day_override"
  FOR EACH ROW EXECUTE FUNCTION booking.staff_child_guard();
CREATE TRIGGER staff_time_off_guard
  BEFORE INSERT OR UPDATE ON "booking"."staff_time_off"
  FOR EACH ROW EXECUTE FUNCTION booking.staff_child_guard();

-- updated_at on the two parent tables (booking.touch_updated_at from booking_init)
CREATE TRIGGER business_hours_touch
  BEFORE UPDATE ON "booking"."business_hours"
  FOR EACH ROW EXECUTE FUNCTION booking.touch_updated_at();
CREATE TRIGGER staff_member_touch
  BEFORE UPDATE ON "booking"."staff_member"
  FOR EACH ROW EXECUTE FUNCTION booking.touch_updated_at();

-- RLS (D-SEC-1): USING + WITH CHECK on app.organization_id
ALTER TABLE "booking"."business_hours" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "booking"."staff_member" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "booking"."staff_weekly_hours" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "booking"."staff_day_override" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "booking"."staff_time_off" ENABLE ROW LEVEL SECURITY;

CREATE POLICY booking_rw_business_hours ON "booking"."business_hours"
  TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY booking_rw_staff_member ON "booking"."staff_member"
  TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY booking_rw_staff_weekly_hours ON "booking"."staff_weekly_hours"
  TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY booking_rw_staff_day_override ON "booking"."staff_day_override"
  TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY booking_rw_staff_time_off ON "booking"."staff_time_off"
  TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Grants (plan §1.4): explicit per table and per column; no DELETE, no TRUNCATE; never an UPDATE of
-- id / organization_id / user_id / staff_member_id / weekday / on_date / created_*.
REVOKE ALL ON "booking"."business_hours", "booking"."staff_member", "booking"."staff_weekly_hours",
              "booking"."staff_day_override", "booking"."staff_time_off" FROM PUBLIC;
GRANT SELECT, INSERT ON "booking"."business_hours", "booking"."staff_member",
                        "booking"."staff_weekly_hours", "booking"."staff_day_override",
                        "booking"."staff_time_off" TO booking_rw;
GRANT UPDATE ("is_open", "opens_at_min", "closes_at_min", "updated_at", "updated_by_user_id")
  ON "booking"."business_hours" TO booking_rw;
GRANT UPDATE ("display_name", "schedule_mode", "bookable_online", "sort_order", "archived_at",
              "archived_by_user_id", "updated_at")
  ON "booking"."staff_member" TO booking_rw;
GRANT UPDATE ("is_working", "start1_min", "end1_min", "start2_min", "end2_min", "updated_at")
  ON "booking"."staff_weekly_hours" TO booking_rw;
GRANT UPDATE ("is_working", "start1_min", "end1_min", "start2_min", "end2_min", "archived_at",
              "archived_by_user_id", "updated_at")
  ON "booking"."staff_day_override" TO booking_rw;
GRANT UPDATE ("starts_on", "ends_on", "reason", "archived_at", "archived_by_user_id", "updated_at")
  ON "booking"."staff_time_off" TO booking_rw;
