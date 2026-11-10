-- Lot C.4 (plans/CRM.md, prerechizit CR.2): the audit category of the ClientDesk application (crm).
-- CR.2 audits every write of the contacts and the companies (crm.contact_* / crm.company_*) in
-- the same transaction; the CHECK allowed only the Core categories and booking (C.0b).
-- Additive: the existing rows keep their category; the constraint is replaced in one statement.

ALTER TABLE "audit"."audit_log"
  DROP CONSTRAINT "audit_log_category_check",
  ADD CONSTRAINT "audit_log_category_check"
    CHECK ("category" IN ('identity', 'organization', 'access', 'support', 'founder', 'commercial', 'booking', 'crm'));
