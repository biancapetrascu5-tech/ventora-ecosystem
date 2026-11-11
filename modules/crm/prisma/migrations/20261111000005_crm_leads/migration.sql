-- Lot CR.8 (plans/CRM.md §3; D-CRM-3; design S131 ClientDeskLeads): the leads — requests that are
-- not clients yet, kept apart from the contacts (they do not take a unit of crm.contacts).
--
--   lead → name, phone, e-mail, the request in their words, the source (the fixed S131 set: form,
--          phone, e-mail, referral, event, manual; configurable sources: NECESITĂ DECIZIE), who
--          recommended, the declared budget and event date, the owner („Neatribuit”), the state:
--          new → contacted → qualified; closed as disqualified (with the reason, can be reopened)
--          or converted (linked to the contact it became, for the history and the sources report).
--   The score and the automatic deletion of old disqualified leads are DE DECIS (S131).

-- CreateTable
CREATE TABLE "crm"."lead" (
  "id"                   UUID         NOT NULL,
  "organization_id"      UUID         NOT NULL,
  "name"                 VARCHAR(160) NOT NULL,
  "phone"                VARCHAR(16),
  "email"                VARCHAR(254),
  "request"              VARCHAR(5000),
  "source"               VARCHAR(8)   NOT NULL DEFAULT 'manual',
  "referred_by"          VARCHAR(160),
  "budget_minor"         BIGINT,
  "currency"             VARCHAR(3)   NOT NULL DEFAULT 'RON',
  "event_date"           DATE,
  "owner_user_id"        UUID,
  "state"                VARCHAR(12)  NOT NULL DEFAULT 'new',
  "disqualify_reason"    VARCHAR(11),
  "disqualify_note"      VARCHAR(500),
  "closed_at"            TIMESTAMPTZ,
  "closed_by_user_id"    UUID,
  "converted_contact_id" UUID,
  "deleted_at"           TIMESTAMPTZ,
  "deleted_by_user_id"   UUID,
  "created_by_user_id"   UUID,
  "created_at"           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"           TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "lead_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lead_name_check" CHECK (char_length(btrim("name")) >= 1),
  CONSTRAINT "lead_phone_check" CHECK ("phone" IS NULL OR "phone" ~ '^\+[1-9][0-9]{6,14}$'),
  CONSTRAINT "lead_email_check"
    CHECK ("email" IS NULL OR ("email" = lower("email") AND "email" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  CONSTRAINT "lead_source_check"
    CHECK ("source" IN ('form', 'phone', 'email', 'referral', 'event', 'manual')),
  CONSTRAINT "lead_budget_check" CHECK ("budget_minor" IS NULL OR "budget_minor" >= 0),
  CONSTRAINT "lead_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "lead_state_check"
    CHECK ("state" IN ('new', 'contacted', 'qualified', 'disqualified', 'converted')),
  CONSTRAINT "lead_disqualified_check" CHECK (
    ("state" = 'disqualified') = ("disqualify_reason" IS NOT NULL)
    AND ("disqualify_reason" IS NULL
         OR "disqualify_reason" IN ('budget', 'no_reply', 'not_offered', 'competitor', 'spam', 'other'))
    AND ("disqualify_note" IS NULL OR "state" = 'disqualified')
  ),
  CONSTRAINT "lead_converted_check" CHECK (("state" = 'converted') = ("converted_contact_id" IS NOT NULL)),
  CONSTRAINT "lead_closed_check" CHECK (
    ("state" IN ('disqualified', 'converted')) = ("closed_at" IS NOT NULL)
    AND ("closed_at" IS NULL) = ("closed_by_user_id" IS NULL)
  ),
  CONSTRAINT "lead_deleted_check" CHECK (("deleted_at" IS NULL) = ("deleted_by_user_id" IS NULL)),
  CONSTRAINT "lead_converted_contact_id_fkey" FOREIGN KEY ("converted_contact_id")
    REFERENCES "crm"."contact" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- the inbox: by state, newest first
CREATE INDEX "lead_organization_id_state_idx" ON "crm"."lead" ("organization_id", "state", "created_at" DESC);
CREATE INDEX "lead_organization_id_owner_idx" ON "crm"."lead" ("organization_id", "owner_user_id");
CREATE INDEX "lead_organization_id_phone_idx" ON "crm"."lead" ("organization_id", "phone");
CREATE INDEX "lead_organization_id_email_idx" ON "crm"."lead" ("organization_id", "email");
-- a contact's history includes the leads it came from
CREATE INDEX "lead_converted_contact_id_idx" ON "crm"."lead" ("converted_contact_id");

CREATE TRIGGER lead_touch
  BEFORE UPDATE ON "crm"."lead"
  FOR EACH ROW EXECUTE FUNCTION crm.touch_updated_at();

-- RLS (D-SEC-1): USING + WITH CHECK on app.organization_id
ALTER TABLE "crm"."lead" ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_rw_lead ON "crm"."lead"
  TO crm_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Grants: only crm_rw; no DELETE (§6.4 c); no UPDATE of id / organization_id / created_*.
REVOKE ALL ON "crm"."lead" FROM PUBLIC;
GRANT SELECT, INSERT ON "crm"."lead" TO crm_rw;
GRANT UPDATE (
  "name", "phone", "email", "request", "source", "referred_by", "budget_minor", "currency",
  "event_date", "owner_user_id", "state", "disqualify_reason", "disqualify_note", "closed_at",
  "closed_by_user_id", "converted_contact_id", "deleted_at", "deleted_by_user_id", "updated_at"
) ON "crm"."lead" TO crm_rw;
