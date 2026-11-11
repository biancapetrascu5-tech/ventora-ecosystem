-- Lot C.0i (plans/CAMPAIGNKIT.md, prerechizit MK.1; aprobat de fondatoare pe 11.11.2026): the audit
-- category of the CampaignKit application (marketing). CampaignKit audits its writes (the sender
-- settings from MK.1, then campaigns, audiences, contacts) in the same transaction, and core/consent
-- writes a team member's manual consent on the calling application's category.
-- Additive: the existing rows keep their category; the constraint is replaced in one statement,
-- with the COMPLETE list.

ALTER TABLE "audit"."audit_log"
  DROP CONSTRAINT "audit_log_category_check",
  ADD CONSTRAINT "audit_log_category_check"
    CHECK ("category" IN ('identity', 'organization', 'access', 'support', 'founder', 'commercial', 'booking', 'crm', 'marketing'));
