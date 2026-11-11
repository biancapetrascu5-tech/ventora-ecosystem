-- Lot CR.10 (plans/CRM.md §3; D-CRM-17 decided 11.11.2026 as recommended in S131): the lead score
-- from simple rules with points, 0–100, shown with its reasons; no AI, no sensitive data; the
-- business can switch it off. The score is computed on every read (always current, no job).
--
--   lead.asked_price     → „a cerut prețul” (+15), set on the lead card or by a form (CR.17)
--   lead.offer_opened_at → „a deschis oferta” (+20), set by the e-mail tracking (CR.14)
--   settings.lead_scoring_enabled   → the switch (S131: the business can turn scoring off)
--   settings.lead_min_budget_minor  → the minimum budget: below it −10 (none: the rule is off)

ALTER TABLE "crm"."lead"
  ADD COLUMN "asked_price" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "offer_opened_at" TIMESTAMPTZ;

ALTER TABLE "crm"."settings"
  ADD COLUMN "lead_scoring_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "lead_min_budget_minor" BIGINT,
  ADD CONSTRAINT "settings_lead_min_budget_check"
    CHECK ("lead_min_budget_minor" IS NULL OR "lead_min_budget_minor" >= 0);

-- Grants: only crm_rw
GRANT UPDATE ("asked_price", "offer_opened_at") ON "crm"."lead" TO crm_rw;
GRANT UPDATE ("lead_scoring_enabled", "lead_min_budget_minor") ON "crm"."settings" TO crm_rw;
