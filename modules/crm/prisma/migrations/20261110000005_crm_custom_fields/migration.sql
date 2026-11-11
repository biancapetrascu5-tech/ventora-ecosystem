-- Lot CR.3 (plans/CRM.md §3; design S132, ClientDeskSettings · „Câmpuri proprii”): the business's
-- own fields for contacts, companies, leads and deals.
--
--   custom_field   → the definition: name, type (text, number, amount, date, list, yes / no), the
--                    list options, where it appears (contact, company, lead, deal), required, as a
--                    column in the contact list, in the import, the order. At most 30 active
--                    fields per business (S132; checked by the contract under a lock). The type is
--                    locked once the field has values (contract). A deleted field stays 30 days in
--                    the bin with its values (S132), then it is no longer restorable.
--   custom_values  → a jsonb object on contact and company ({ "<field id>": value }), validated by
--                    the contract against the definitions. Leads and deals get theirs in CR.8 /
--                    CR.9. S132: no fields for medical data (the settings screen says so).
--
-- No physical delete (§6.4 c).

-- CreateTable
CREATE TABLE "crm"."custom_field" (
  "id"                 UUID         NOT NULL,
  "organization_id"    UUID         NOT NULL,
  "name"               VARCHAR(60)  NOT NULL,
  -- text | number | amount | date | list | boolean
  "field_type"         VARCHAR(8)   NOT NULL,
  -- list: the options, an array of 1–50 strings; NULL for the other types
  "options"            JSONB,
  -- where the field appears: contact, company, lead, deal (at least one)
  "applies_to"         TEXT[]       NOT NULL,
  "is_required"        BOOLEAN      NOT NULL DEFAULT false,
  "show_in_list"       BOOLEAN      NOT NULL DEFAULT false,
  "in_import"          BOOLEAN      NOT NULL DEFAULT true,
  "sort_order"         INTEGER      NOT NULL DEFAULT 0,
  "deleted_at"         TIMESTAMPTZ,
  "deleted_by_user_id" UUID,
  "created_by_user_id" UUID         NOT NULL,
  "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "custom_field_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "custom_field_name_check"
    CHECK ("name" = btrim("name") AND char_length("name") BETWEEN 1 AND 60),
  CONSTRAINT "custom_field_type_check"
    CHECK ("field_type" IN ('text', 'number', 'amount', 'date', 'list', 'boolean')),
  CONSTRAINT "custom_field_options_check" CHECK (
    ("field_type" = 'list') = ("options" IS NOT NULL)
    AND ("options" IS NULL
         OR (jsonb_typeof("options") = 'array' AND jsonb_array_length("options") BETWEEN 1 AND 50))
  ),
  CONSTRAINT "custom_field_applies_to_check" CHECK (
    cardinality("applies_to") BETWEEN 1 AND 4
    AND "applies_to" <@ ARRAY['contact', 'company', 'lead', 'deal']::TEXT[]
  ),
  CONSTRAINT "custom_field_sort_order_check" CHECK ("sort_order" BETWEEN 0 AND 10000),
  CONSTRAINT "custom_field_deleted_check"
    CHECK (("deleted_at" IS NULL) = ("deleted_by_user_id" IS NULL))
);

CREATE INDEX "custom_field_organization_id_sort_idx"
  ON "crm"."custom_field" ("organization_id", "sort_order");
-- one active field per name in a business (a deleted one frees the name)
CREATE UNIQUE INDEX "custom_field_active_name_key"
  ON "crm"."custom_field" ("organization_id", lower("name"))
  WHERE "deleted_at" IS NULL;

CREATE TRIGGER custom_field_touch
  BEFORE UPDATE ON "crm"."custom_field"
  FOR EACH ROW EXECUTE FUNCTION crm.touch_updated_at();

-- The values: one jsonb object per row, keys = field ids
ALTER TABLE "crm"."contact"
  ADD COLUMN "custom_values" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT "contact_custom_values_check" CHECK (jsonb_typeof("custom_values") = 'object');
ALTER TABLE "crm"."company"
  ADD COLUMN "custom_values" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT "company_custom_values_check" CHECK (jsonb_typeof("custom_values") = 'object');

-- the filters on a field (custom_values @> '{"<id>": value}') and „the field has values”
CREATE INDEX "contact_custom_values_idx" ON "crm"."contact" USING GIN ("custom_values" jsonb_path_ops);
CREATE INDEX "company_custom_values_idx" ON "crm"."company" USING GIN ("custom_values" jsonb_path_ops);

-- RLS (D-SEC-1): USING + WITH CHECK on app.organization_id
ALTER TABLE "crm"."custom_field" ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_rw_custom_field ON "crm"."custom_field"
  TO crm_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Grants: explicit per table and per column; no DELETE (§6.4 c); no UPDATE of id /
-- organization_id / created_*.
REVOKE ALL ON "crm"."custom_field" FROM PUBLIC;
GRANT SELECT, INSERT ON "crm"."custom_field" TO crm_rw;
GRANT UPDATE ("name", "field_type", "options", "applies_to", "is_required", "show_in_list",
              "in_import", "sort_order", "deleted_at", "deleted_by_user_id", "updated_at")
  ON "crm"."custom_field" TO crm_rw;
GRANT UPDATE ("custom_values") ON "crm"."contact" TO crm_rw;
GRANT UPDATE ("custom_values") ON "crm"."company" TO crm_rw;
