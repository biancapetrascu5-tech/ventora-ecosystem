-- Lot CR.8b (decision of 11.11.2026, as in S132 „Etichete și surse”): the lead sources of a business.
--
--   lead_source → the built-in ones (key: form, phone, email, referral, event, manual) are written
--                 once per business; they can be renamed (label) or hidden, never deleted, so the
--                 forms and EasyBook always have a source. The business's own (no key, a label) can
--                 be added, renamed and deleted (into the bin; the leads keep them).
--   lead.source  → gains 'custom': then lead.source_id names the business's own source.

-- CreateTable
CREATE TABLE "crm"."lead_source" (
  "id"                 UUID         NOT NULL,
  "organization_id"    UUID         NOT NULL,
  "key"                VARCHAR(8),
  "label"              VARCHAR(60),
  "hidden"             BOOLEAN      NOT NULL DEFAULT false,
  "sort_order"         INTEGER      NOT NULL DEFAULT 0,
  "deleted_at"         TIMESTAMPTZ,
  "deleted_by_user_id" UUID,
  "created_by_user_id" UUID,
  "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "lead_source_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lead_source_label_check" CHECK (
    ("key" IS NOT NULL OR char_length(btrim("label")) >= 1)
    AND ("key" IS NULL OR "key" IN ('form', 'phone', 'email', 'referral', 'event', 'manual'))
  ),
  -- a built-in source is hidden, never deleted (S132)
  CONSTRAINT "lead_source_builtin_check" CHECK ("key" IS NULL OR "deleted_at" IS NULL),
  CONSTRAINT "lead_source_deleted_check" CHECK (("deleted_at" IS NULL) = ("deleted_by_user_id" IS NULL))
);
CREATE INDEX "lead_source_organization_id_idx" ON "crm"."lead_source" ("organization_id");
-- the built-in ones are written once per business (ON CONFLICT)
CREATE UNIQUE INDEX "lead_source_key_key" ON "crm"."lead_source" ("organization_id", "key") WHERE "key" IS NOT NULL;

CREATE TRIGGER lead_source_touch BEFORE UPDATE ON "crm"."lead_source"
  FOR EACH ROW EXECUTE FUNCTION crm.touch_updated_at();

ALTER TABLE "crm"."lead_source" ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_rw_lead_source ON "crm"."lead_source" TO crm_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- the lead: 'custom' with its source
ALTER TABLE "crm"."lead"
  ADD COLUMN "source_id" UUID,
  DROP CONSTRAINT "lead_source_check",
  ADD CONSTRAINT "lead_source_check"
    CHECK ("source" IN ('form', 'phone', 'email', 'referral', 'event', 'manual', 'custom')),
  ADD CONSTRAINT "lead_source_custom_check" CHECK (("source" = 'custom') = ("source_id" IS NOT NULL)),
  ADD CONSTRAINT "lead_source_id_fkey" FOREIGN KEY ("source_id")
    REFERENCES "crm"."lead_source" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX "lead_source_id_idx" ON "crm"."lead" ("source_id");

-- Grants: only crm_rw; no DELETE (§6.4 c)
REVOKE ALL ON "crm"."lead_source" FROM PUBLIC;
GRANT SELECT, INSERT ON "crm"."lead_source" TO crm_rw;
GRANT UPDATE ("label", "hidden", "sort_order", "deleted_at", "deleted_by_user_id", "updated_at")
  ON "crm"."lead_source" TO crm_rw;
GRANT UPDATE ("source_id") ON "crm"."lead" TO crm_rw;
