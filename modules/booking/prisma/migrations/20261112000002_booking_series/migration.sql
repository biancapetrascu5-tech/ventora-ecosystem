-- Lot B.9b — recurring appointments (design BookingRecurring, S126; plan
-- reports/2026-11-12_plan-booking-b9.md). A series is its rule; its appointments are ordinary
-- appointments created all at once, each with series_id and series_index. The series row is written
-- once and never updated (a change „Aceasta și următoarele” / „Toate din serie” changes the
-- appointments). No personal data in the series (only ids), so erase_client is not recreated:
-- the client's appointments are anonymized by it as before.

CREATE TABLE "booking"."appointment_series" (
  -- given by the caller of createSeries: a retry with the same id returns the same series
  "id"                 UUID        NOT NULL,
  "organization_id"    UUID        NOT NULL,
  "client_id"          UUID        NOT NULL,
  "service_id"         UUID        NOT NULL,
  "staff_member_id"    UUID        NOT NULL,
  -- „Cât de des”: Săptămânal, La 2 săptămâni, Lunar (D-9b-2: the same weekday of the month)
  "frequency"          VARCHAR(8)  NOT NULL,
  -- the local time of the first appointment, in minutes from midnight (business time zone)
  "start_minute"       SMALLINT    NOT NULL,
  "first_date"         DATE        NOT NULL,
  -- „Până când”: a date or a number of appointments (exactly one of them)
  "until_date"         DATE,
  "occurrence_count"   SMALLINT,
  "created_by_user_id" UUID,
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "appointment_series_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "appointment_series_client_id_fkey" FOREIGN KEY ("client_id")
    REFERENCES "booking"."client" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "appointment_series_service_id_fkey" FOREIGN KEY ("service_id")
    REFERENCES "booking"."service" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "appointment_series_staff_member_id_fkey" FOREIGN KEY ("staff_member_id")
    REFERENCES "booking"."staff_member" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "appointment_series_frequency_check"
    CHECK ("frequency" IN ('weekly', 'biweekly', 'monthly')),
  CONSTRAINT "appointment_series_start_minute_check"
    CHECK ("start_minute" BETWEEN 0 AND 1435 AND "start_minute" % 5 = 0),
  -- D-9b-1: at most 52 appointments or 12 months
  CONSTRAINT "appointment_series_until_check" CHECK (
    ("until_date" IS NULL) <> ("occurrence_count" IS NULL)
    AND ("occurrence_count" IS NULL OR "occurrence_count" BETWEEN 2 AND 52)
    AND ("until_date" IS NULL
      OR ("until_date" > "first_date" AND "until_date" < ("first_date" + interval '12 months')))
  )
);

CREATE UNIQUE INDEX "appointment_series_organization_id_id_key"
  ON "booking"."appointment_series" ("organization_id", "id");
CREATE INDEX "appointment_series_client_id_idx"
  ON "booking"."appointment_series" ("client_id");

ALTER TABLE "booking"."appointment"
  ADD COLUMN "series_id"    UUID,
  -- the appointment's place in the series, 1..52 (a skipped date leaves no gap)
  ADD COLUMN "series_index" SMALLINT;

ALTER TABLE "booking"."appointment"
  ADD CONSTRAINT "appointment_series_check" CHECK (
    ("series_id" IS NULL AND "series_index" IS NULL)
    OR ("series_id" IS NOT NULL AND "series_index" BETWEEN 1 AND 52)
  ),
  -- a visit with several services (B.9a) is not repeated
  ADD CONSTRAINT "appointment_series_visit_check" CHECK ("series_id" IS NULL OR "visit_id" IS NULL),
  ADD CONSTRAINT "appointment_series_fkey" FOREIGN KEY ("organization_id", "series_id")
    REFERENCES "booking"."appointment_series" ("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE UNIQUE INDEX "appointment_organization_id_series_id_series_index_key"
  ON "booking"."appointment" ("organization_id", "series_id", "series_index");

-- RLS (D-SEC-1): USING + WITH CHECK on the organization of the transaction
ALTER TABLE "booking"."appointment_series" ENABLE ROW LEVEL SECURITY;
CREATE POLICY booking_rw_appointment_series ON "booking"."appointment_series"
  FOR ALL TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Grants (only booking_rw): written once, no UPDATE, no DELETE, no TRUNCATE. The new columns of
-- appointment are written only at INSERT (already granted).
REVOKE ALL ON "booking"."appointment_series" FROM PUBLIC;
GRANT SELECT, INSERT ON "booking"."appointment_series" TO booking_rw;
