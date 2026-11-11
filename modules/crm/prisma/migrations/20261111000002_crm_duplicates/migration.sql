-- Lot CR.5 (plans/CRM.md §3; design S132 ClientDeskDuplicates; D-CRM-8 = a: exact rules, no
-- Postgres extension; D-CRM-9 = a): the duplicates and the merge of contacts.
--
--   contact.name_key       → the normalised name for the duplicates (crm.name_key: lower case,
--                            without Romanian diacritics, hyphens, dots and titles such as „dl.”,
--                            „dna.”, „dr.”), kept by a trigger on every write of the name.
--   contact.merged_into_id → set on the contact that disappeared in a merge (S132: searching by its
--                            data leads to the one that stays); only on a contact in the bin.
--   duplicate_dismissal    → „Nu sunt duplicate”: the pair does not come back (S132); can be undone
--                            (undone_at, never a physical delete).
--   contact_merge          → the record of a merge: which contact stayed, which disappeared, which
--                            fields came from the second one. Only INSERT and SELECT: a log.
--
-- Two EasyBook contacts are merged only in EasyBook; when one comes from EasyBook it is the one
-- that stays, with its basic data (S130, S132) — checked by the contract.

-- the normalised name: lower case, without Romanian diacritics, titles, hyphens and dots
CREATE OR REPLACE FUNCTION crm.name_key(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
  -- the title first (it may hold a hyphen or a dot), then hyphens, dots and apostrophes are
  -- dropped (Mureș-an = Mureșan), then any other run of signs is one space
  SELECT btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        translate(lower(coalesce(p_name, '')), 'ăâîșşțţáéíóúàèìòùäëïöüçñ', 'aaissttaeiouaeiouaeioucn'),
        '^(dl|dna|d-na|d-l|dra|dr|ing|prof|av)\.?\s+', ''),
      '[-.'']+', '', 'g'),
    '[^a-z0-9]+', ' ', 'g'));
$$;

REVOKE ALL ON FUNCTION crm.name_key(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.name_key(TEXT) TO crm_rw;

ALTER TABLE "crm"."contact"
  ADD COLUMN "name_key" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "merged_into_id" UUID,
  ADD CONSTRAINT "contact_merged_into_id_fkey" FOREIGN KEY ("merged_into_id")
    REFERENCES "crm"."contact" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  -- a merged contact is in the bin and not its own target
  ADD CONSTRAINT "contact_merged_check"
    CHECK ("merged_into_id" IS NULL OR ("deleted_at" IS NOT NULL AND "merged_into_id" <> "id"));

-- name_key follows name, whoever writes (a trigger, so no generated column in the Prisma schema)
CREATE OR REPLACE FUNCTION crm.contact_name_key()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW.name_key := crm.name_key(NEW.name);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION crm.contact_name_key() FROM PUBLIC;

CREATE TRIGGER contact_name_key
  BEFORE INSERT OR UPDATE OF "name" ON "crm"."contact"
  FOR EACH ROW EXECUTE FUNCTION crm.contact_name_key();

-- the contacts that exist get their key
UPDATE "crm"."contact" SET "name_key" = crm.name_key("name");

CREATE INDEX "contact_organization_id_name_key_idx" ON "crm"."contact" ("organization_id", "name_key");
CREATE INDEX "contact_organization_id_phone_alt_idx" ON "crm"."contact" ("organization_id", "phone_alt");
CREATE INDEX "contact_organization_id_email_alt_idx" ON "crm"."contact" ("organization_id", "email_alt");
CREATE INDEX "contact_merged_into_id_idx" ON "crm"."contact" ("merged_into_id");

-- CreateTable
CREATE TABLE "crm"."duplicate_dismissal" (
  "id"                 UUID        NOT NULL,
  "organization_id"    UUID        NOT NULL,
  -- the pair, the smaller id first
  "contact_a_id"       UUID        NOT NULL,
  "contact_b_id"       UUID        NOT NULL,
  "created_by_user_id" UUID        NOT NULL,
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "undone_at"          TIMESTAMPTZ,
  "undone_by_user_id"  UUID,

  CONSTRAINT "duplicate_dismissal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "duplicate_dismissal_contact_a_fkey" FOREIGN KEY ("contact_a_id")
    REFERENCES "crm"."contact" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "duplicate_dismissal_contact_b_fkey" FOREIGN KEY ("contact_b_id")
    REFERENCES "crm"."contact" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "duplicate_dismissal_order_check" CHECK ("contact_a_id" < "contact_b_id"),
  CONSTRAINT "duplicate_dismissal_undone_check"
    CHECK (("undone_at" IS NULL) = ("undone_by_user_id" IS NULL))
);

-- one active „Nu sunt duplicate” per pair
CREATE UNIQUE INDEX "duplicate_dismissal_active_key"
  ON "crm"."duplicate_dismissal" ("organization_id", "contact_a_id", "contact_b_id")
  WHERE "undone_at" IS NULL;

-- CreateTable
CREATE TABLE "crm"."contact_merge" (
  "id"                 UUID        NOT NULL,
  "organization_id"    UUID        NOT NULL,
  "kept_contact_id"    UUID        NOT NULL,
  "merged_contact_id"  UUID        NOT NULL,
  -- the names of the fields whose value came from the merged contact
  "fields_from_merged" TEXT[]      NOT NULL DEFAULT '{}',
  "created_by_user_id" UUID        NOT NULL,
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "contact_merge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contact_merge_kept_fkey" FOREIGN KEY ("kept_contact_id")
    REFERENCES "crm"."contact" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "contact_merge_merged_fkey" FOREIGN KEY ("merged_contact_id")
    REFERENCES "crm"."contact" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "contact_merge_distinct_check" CHECK ("kept_contact_id" <> "merged_contact_id")
);

CREATE INDEX "contact_merge_kept_idx" ON "crm"."contact_merge" ("kept_contact_id");

-- RLS (D-SEC-1): USING + WITH CHECK on app.organization_id
ALTER TABLE "crm"."duplicate_dismissal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm"."contact_merge" ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_rw_duplicate_dismissal ON "crm"."duplicate_dismissal"
  TO crm_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY crm_rw_contact_merge ON "crm"."contact_merge"
  TO crm_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Grants: only crm_rw; no DELETE (§6.4 c); the merge log is INSERT + SELECT only.
REVOKE ALL ON "crm"."duplicate_dismissal", "crm"."contact_merge" FROM PUBLIC;
GRANT SELECT, INSERT ON "crm"."duplicate_dismissal", "crm"."contact_merge" TO crm_rw;
GRANT UPDATE ("undone_at", "undone_by_user_id") ON "crm"."duplicate_dismissal" TO crm_rw;
GRANT UPDATE ("merged_into_id") ON "crm"."contact" TO crm_rw;
