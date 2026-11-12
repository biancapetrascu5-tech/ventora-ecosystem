-- Lot B.9a — several services in one visit (design BookingMultiService, S126; plan
-- reports/2026-11-12_plan-booking-b9.md). Every step is an ordinary appointment; four columns hold
-- the visit together. No new table, role, GRANT or function: the columns are written only at
-- creation (INSERT is already granted to booking_rw on the table) and never updated, and
-- erase_client has nothing to clear in them (no personal data).

ALTER TABLE "booking"."appointment"
  -- the visit (a UUID chosen by the caller of createVisit); NULL = an appointment alone
  ADD COLUMN "visit_id"            UUID,
  -- the step's place, 1..visit_steps (T-9a-3: 2–5 steps)
  ADD COLUMN "visit_step"          SMALLINT,
  ADD COLUMN "visit_steps"         SMALLINT,
  -- the pause after the step (BookingMultiService: 0, 5, 10, 15, 30 minutes; 0 on the last step)
  ADD COLUMN "break_after_minutes" SMALLINT;

ALTER TABLE "booking"."appointment"
  ADD CONSTRAINT "appointment_visit_check" CHECK (
    ("visit_id" IS NULL AND "visit_step" IS NULL AND "visit_steps" IS NULL
      AND "break_after_minutes" IS NULL)
    OR ("visit_id" IS NOT NULL
      AND "visit_steps" BETWEEN 2 AND 5
      AND "visit_step" BETWEEN 1 AND "visit_steps"
      AND "break_after_minutes" IN (0, 5, 10, 15, 30)
      AND ("visit_step" < "visit_steps" OR "break_after_minutes" = 0))
  );

-- one appointment per step of a visit (NULLs are distinct: the appointments alone are not touched)
CREATE UNIQUE INDEX "appointment_organization_id_visit_id_visit_step_key"
  ON "booking"."appointment" ("organization_id", "visit_id", "visit_step");
