-- Lot CR.2 (plans/CRM.md §3, aprobat 10.11.2026; design S130: ClientDeskContacts,
-- ClientDeskCompanies, ClientDeskContact): the contacts and the companies of ClientDesk.
--
--   company → a company (name, CUI, field, address, site, phone, e-mail, owner)
--   contact → a person: name, phones, e-mails, language, birthday (D-CRM-18), address, source,
--             owner, a short note; at most ONE company, with the role in it and „Principal”
--             (S130: one company per contact)
--
-- „Șterge” (S130) moves to a 30-day bin: deleted_at / deleted_by_user_id; restoring is possible
-- for 30 days (checked by the contract). No physical delete (§6.4 c). A contact that came from
-- EasyBook (source = 'easybook') is never deleted in ClientDesk (S130): a CHECK refuses it.
-- quota_operation_id: the crm.contacts reservation of the contact (D-CRM-4 = a: only the contacts
-- created in ClientDesk count; a contact from EasyBook has none). Personal data stays out of the
-- audit and of the events (ids only).

-- CreateTable
CREATE TABLE "crm"."company" (
  "id"                 UUID         NOT NULL,
  "organization_id"    UUID         NOT NULL,
  "name"               VARCHAR(160) NOT NULL,
  -- CUI: digits, optionally with RO in front (S130: „completarea firmei din CUI prin ANAF”)
  "tax_id"             VARCHAR(12),
  -- „Domeniu”
  "industry"           VARCHAR(80),
  "address"            VARCHAR(300),
  "website"            VARCHAR(200),
  "phone"              VARCHAR(16),
  "email"              VARCHAR(254),
  "owner_user_id"      UUID,
  "deleted_at"         TIMESTAMPTZ,
  "deleted_by_user_id" UUID,
  "created_by_user_id" UUID         NOT NULL,
  "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "company_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "company_name_check"
    CHECK ("name" = btrim("name") AND char_length("name") BETWEEN 1 AND 160),
  CONSTRAINT "company_tax_id_check" CHECK ("tax_id" IS NULL OR "tax_id" ~ '^(RO)?[0-9]{2,10}$'),
  CONSTRAINT "company_industry_check"
    CHECK ("industry" IS NULL OR ("industry" = btrim("industry") AND char_length("industry") BETWEEN 1 AND 80)),
  CONSTRAINT "company_address_check"
    CHECK ("address" IS NULL OR char_length("address") BETWEEN 1 AND 300),
  CONSTRAINT "company_website_check"
    CHECK ("website" IS NULL OR "website" ~ '^https?://[^\s]+$'),
  CONSTRAINT "company_phone_check" CHECK ("phone" IS NULL OR "phone" ~ '^\+[1-9][0-9]{6,14}$'),
  CONSTRAINT "company_email_check"
    CHECK ("email" IS NULL OR ("email" = lower("email") AND "email" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  CONSTRAINT "company_deleted_check"
    CHECK (("deleted_at" IS NULL) = ("deleted_by_user_id" IS NULL))
);

CREATE INDEX "company_organization_id_name_idx"
  ON "crm"."company" ("organization_id", lower("name"));
-- one active company per CUI in a business
CREATE UNIQUE INDEX "company_active_tax_id_key"
  ON "crm"."company" ("organization_id", "tax_id")
  WHERE "deleted_at" IS NULL AND "tax_id" IS NOT NULL;

-- CreateTable
CREATE TABLE "crm"."contact" (
  "id"                 UUID         NOT NULL,
  "organization_id"    UUID         NOT NULL,
  "name"               VARCHAR(160) NOT NULL,
  -- E.164, normalized by the contract (07… → +407…)
  "phone"              VARCHAR(16),
  "phone_alt"          VARCHAR(16),
  -- lower-case
  "email"              VARCHAR(254),
  "email_alt"          VARCHAR(254),
  "locale"             VARCHAR(2)   NOT NULL DEFAULT 'ro',
  -- D-CRM-18: the birthday, for the reminder (CR.13)
  "birthday"           DATE,
  "address"            VARCHAR(300),
  -- S130 (crm.src.*): EasyBook, site form, referral, event, CSV import, manual
  "source"             VARCHAR(12)  NOT NULL DEFAULT 'manual',
  -- S130: one company per contact
  "company_id"         UUID,
  "company_role"       VARCHAR(80),
  "is_company_primary" BOOLEAN      NOT NULL DEFAULT false,
  -- NULL = „Neatribuit” (D-CRM-15: everyone sees it and can take it)
  "owner_user_id"      UUID,
  "note"               VARCHAR(1000),
  -- the crm.contacts reservation (D-CRM-4 = a); NULL for a contact from EasyBook
  "quota_operation_id" VARCHAR(128),
  "deleted_at"         TIMESTAMPTZ,
  "deleted_by_user_id" UUID,
  -- NULL when the contact came from EasyBook (CR.12, written by the link, not by a person)
  "created_by_user_id" UUID,
  "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "contact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contact_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES "crm"."company" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "contact_name_check"
    CHECK ("name" = btrim("name") AND char_length("name") BETWEEN 1 AND 160),
  CONSTRAINT "contact_phone_check" CHECK ("phone" IS NULL OR "phone" ~ '^\+[1-9][0-9]{6,14}$'),
  CONSTRAINT "contact_phone_alt_check"
    CHECK ("phone_alt" IS NULL OR "phone_alt" ~ '^\+[1-9][0-9]{6,14}$'),
  CONSTRAINT "contact_email_check"
    CHECK ("email" IS NULL OR ("email" = lower("email") AND "email" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  CONSTRAINT "contact_email_alt_check"
    CHECK ("email_alt" IS NULL OR ("email_alt" = lower("email_alt") AND "email_alt" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  CONSTRAINT "contact_locale_check" CHECK ("locale" IN ('ro', 'en', 'fr', 'es', 'de', 'it')),
  CONSTRAINT "contact_birthday_check" CHECK ("birthday" IS NULL OR "birthday" >= DATE '1900-01-01'),
  CONSTRAINT "contact_address_check"
    CHECK ("address" IS NULL OR char_length("address") BETWEEN 1 AND 300),
  CONSTRAINT "contact_source_check"
    CHECK ("source" IN ('easybook', 'form', 'referral', 'event', 'import', 'manual')),
  CONSTRAINT "contact_company_role_check"
    CHECK ("company_role" IS NULL OR ("company_role" = btrim("company_role") AND char_length("company_role") BETWEEN 1 AND 80)),
  -- the role and „Principal” only with a company
  CONSTRAINT "contact_company_fields_check"
    CHECK ("company_id" IS NOT NULL OR ("company_role" IS NULL AND NOT "is_company_primary")),
  CONSTRAINT "contact_note_check" CHECK ("note" IS NULL OR char_length("note") <= 1000),
  CONSTRAINT "contact_deleted_check"
    CHECK (("deleted_at" IS NULL) = ("deleted_by_user_id" IS NULL)),
  -- S130: a contact from EasyBook is never deleted in ClientDesk
  CONSTRAINT "contact_easybook_not_deleted_check"
    CHECK ("source" <> 'easybook' OR "deleted_at" IS NULL),
  -- D-CRM-4 = a: a contact from EasyBook never holds a crm.contacts unit
  CONSTRAINT "contact_easybook_no_quota_check"
    CHECK ("source" <> 'easybook' OR "quota_operation_id" IS NULL)
);

CREATE INDEX "contact_organization_id_name_idx"
  ON "crm"."contact" ("organization_id", lower("name"));
CREATE INDEX "contact_organization_id_phone_idx" ON "crm"."contact" ("organization_id", "phone");
CREATE INDEX "contact_organization_id_email_idx" ON "crm"."contact" ("organization_id", "email");
CREATE INDEX "contact_organization_id_owner_idx"
  ON "crm"."contact" ("organization_id", "owner_user_id");
CREATE INDEX "contact_company_id_idx" ON "crm"."contact" ("company_id");
-- one „Principal” per company, among the active contacts
CREATE UNIQUE INDEX "contact_company_primary_key"
  ON "crm"."contact" ("company_id")
  WHERE "is_company_primary" AND "deleted_at" IS NULL;
-- the reconciliation resolver looks a reservation up by its operation
CREATE UNIQUE INDEX "contact_quota_operation_id_key"
  ON "crm"."contact" ("quota_operation_id")
  WHERE "quota_operation_id" IS NOT NULL;

-- A contact stays in an active company of its own business, whoever writes: on insert, on a
-- change of company and on restoring from the bin. SECURITY INVOKER: as crm_rw the lookup runs
-- under RLS, so a company of another business is not found. FOR SHARE waits for a deletion in
-- progress (deleteCompany locks the company FOR UPDATE) and then sees its result.
CREATE OR REPLACE FUNCTION crm.contact_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.company_id IS NOT NULL AND NEW.deleted_at IS NULL
     AND (TG_OP = 'INSERT'
          OR NEW.company_id IS DISTINCT FROM OLD.company_id
          OR OLD.deleted_at IS NOT NULL) THEN
    PERFORM 1 FROM crm.company c
     WHERE c.id = NEW.company_id
       AND c.organization_id = NEW.organization_id
       AND c.deleted_at IS NULL
       FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'company % is not an active company of the business', NEW.company_id
        USING ERRCODE = '23514';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION crm.contact_guard() FROM PUBLIC;

CREATE TRIGGER contact_guard
  BEFORE INSERT OR UPDATE ON "crm"."contact"
  FOR EACH ROW EXECUTE FUNCTION crm.contact_guard();

CREATE TRIGGER company_touch
  BEFORE UPDATE ON "crm"."company"
  FOR EACH ROW EXECUTE FUNCTION crm.touch_updated_at();

-- RLS (D-SEC-1): USING + WITH CHECK on app.organization_id
ALTER TABLE "crm"."company" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm"."contact" ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_rw_company ON "crm"."company"
  TO crm_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY crm_rw_contact ON "crm"."contact"
  TO crm_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Grants: explicit per table and per column; no DELETE (§6.4 c); no UPDATE of id /
-- organization_id / created_* / source (where a contact came from does not change).
REVOKE ALL ON "crm"."company", "crm"."contact" FROM PUBLIC;
GRANT SELECT, INSERT ON "crm"."company", "crm"."contact" TO crm_rw;
GRANT UPDATE ("name", "tax_id", "industry", "address", "website", "phone", "email",
              "owner_user_id", "deleted_at", "deleted_by_user_id", "updated_at")
  ON "crm"."company" TO crm_rw;
GRANT UPDATE ("name", "phone", "phone_alt", "email", "email_alt", "locale", "birthday",
              "address", "company_id", "company_role", "is_company_primary", "owner_user_id",
              "note", "quota_operation_id", "deleted_at", "deleted_by_user_id", "updated_at")
  ON "crm"."contact" TO crm_rw;
