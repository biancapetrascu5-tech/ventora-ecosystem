-- Lot C.0b (Booking Etapa 1, plan 2026-11-06): the audit category of the Booking application.
-- B.1 audits every write of the service catalog (booking.service.* / booking.service_category.*)
-- in the same transaction; the CHECK from audit_init allowed only the Core categories.
-- Additive: the existing rows keep their category; the constraint is replaced in one statement.

ALTER TABLE "audit"."audit_log"
  DROP CONSTRAINT "audit_log_category_check",
  ADD CONSTRAINT "audit_log_category_check"
    CHECK ("category" IN ('identity', 'organization', 'access', 'support', 'founder', 'commercial', 'booking'));
