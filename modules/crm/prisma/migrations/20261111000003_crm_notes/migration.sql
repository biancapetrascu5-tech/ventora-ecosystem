-- Lot CR.6 (plans/CRM.md §3; design S130 ClientDeskContact · „Un singur istoric”): the notes and
-- the internal comments with @mentions, on a contact or a company (leads and deals in CR.8 / CR.9).
--
--   note → kind (note | comment), the text (up to 5 000 characters), the people mentioned (S130: only
--          members who see the record, checked by the contract), the subject it belongs to. The
--          author edits; the author or crm:admin deletes (into the bin, never a physical delete).
--
-- The attachments are files of core/files (owner module crm, resource contact / company): no table
-- here. The history joins the notes, the comments and the files; tasks, deals, EasyBook bookings,
-- e-mails and consent join it with their lots.

-- CreateTable
CREATE TABLE "crm"."note" (
  "id"                 UUID         NOT NULL,
  "organization_id"    UUID         NOT NULL,
  -- note („Notiță”) | comment („Comentariu”)
  "kind"               VARCHAR(7)   NOT NULL,
  -- contact | company | lead | deal (lead and deal from CR.8 / CR.9)
  "subject_type"       VARCHAR(7)   NOT NULL,
  "subject_id"         UUID         NOT NULL,
  "body"               TEXT         NOT NULL,
  "mentions"           UUID[]       NOT NULL DEFAULT '{}',
  "edited_at"          TIMESTAMPTZ,
  "deleted_at"         TIMESTAMPTZ,
  "deleted_by_user_id" UUID,
  "created_by_user_id" UUID         NOT NULL,
  "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "note_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "note_kind_check" CHECK ("kind" IN ('note', 'comment')),
  CONSTRAINT "note_subject_type_check" CHECK ("subject_type" IN ('contact', 'company', 'lead', 'deal')),
  CONSTRAINT "note_body_check" CHECK (char_length(btrim("body")) BETWEEN 1 AND 5000),
  CONSTRAINT "note_mentions_check" CHECK (cardinality("mentions") <= 20),
  CONSTRAINT "note_deleted_check" CHECK (("deleted_at" IS NULL) = ("deleted_by_user_id" IS NULL))
);

-- the history of a record, newest first
CREATE INDEX "note_subject_idx"
  ON "crm"."note" ("organization_id", "subject_type", "subject_id", "created_at" DESC);
-- „mențiunile mele”
CREATE INDEX "note_mentions_idx" ON "crm"."note" USING GIN ("mentions");

CREATE TRIGGER note_touch
  BEFORE UPDATE ON "crm"."note"
  FOR EACH ROW EXECUTE FUNCTION crm.touch_updated_at();

-- RLS (D-SEC-1): USING + WITH CHECK on app.organization_id
ALTER TABLE "crm"."note" ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_rw_note ON "crm"."note"
  TO crm_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Grants: only crm_rw; no DELETE (§6.4 c); no UPDATE of id / organization_id / kind /
-- subject_type / created_*. subject_id: only the merge of two contacts (CR.5) moves the notes of the
-- merged contact onto the one that stayed.
REVOKE ALL ON "crm"."note" FROM PUBLIC;
GRANT SELECT, INSERT ON "crm"."note" TO crm_rw;
GRANT UPDATE ("subject_id", "body", "mentions", "edited_at", "deleted_at", "deleted_by_user_id", "updated_at")
  ON "crm"."note" TO crm_rw;
