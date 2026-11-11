-- Lot B.12 (BOOKING.md §3 B.12; design BookingCustomForms, S127): the questions at booking. The salon
-- defines them (Setări · „Rezervări online” · „Întrebări la rezervare”); the client answers them on the
-- public page, at the details step, only those of the chosen service; the team may answer them from
-- the Hub when the question says so. The answers live on the booking („Răspunsuri la întrebări”).
-- Health questions never go here: they go through the health fields of B.8 (separate consent).
--
--   form_question     → the questions, in the order the client sees them: the text, the type (short
--                       text, long text, yes / no, one choice, several choices, number, date), the
--                       options for the choices (2–20, in order), a help text, the services (NULL =
--                       all), required or not, shown in the Hub or not. Archived, never deleted.
--   appointment_answer→ one answer per booking and question; the text of the question is copied, so a
--                       later edit does not change what the client answered. Wiped (value NULL) by
--                       the GDPR erasure, never deleted.
--   public_hold       → the answers given on the public page wait in the hold (answers) while it is
--                       pending, like the message; settling the hold wipes them.
--
-- The optional photo (the founder's decision at S127, 11.11.2026): a question may let the client add
-- a photo (allows_photo, „Clientul poate adăuga o poză”). The photo is a file of core/files (PNG /
-- JPEG, at most 10 MB): on the public page an anonymous upload bound to the pending hold (C.4g), at
-- most one per question and 5 per hold; on the booking, appointment_answer.photo_file_id. The photos
-- of a hold that expires or is refused are deleted by booking.public-hold-cleanup (has_photos tells
-- it which holds to look at), through the system deletion of core/files (C.4f). The GDPR erasure
-- marks the client's photos (the answer wiped, photo_deleted_at still NULL); the application then
-- deletes them the same way, and the job retries the ones still marked.
--
-- Additive: two tables, two columns on public_hold (its two CHECKs recreated with them),
-- public_hold_cleanup_due and erase_client recreated with their previous bodies plus the photos and
-- the answers. RLS (USING + WITH CHECK), grants only to
-- booking_rw, no DELETE. No new role, no new audit category or code (booking.settings_updated), no
-- package.

-- CreateTable
CREATE TABLE "booking"."form_question" (
    "id"                  UUID         NOT NULL,
    "organization_id"     UUID         NOT NULL,
    "label"               VARCHAR(160) NOT NULL,
    -- short_text | long_text | yes_no | choice | multi | number | date
    "kind"                VARCHAR(10)  NOT NULL,
    "options"             JSONB,
    "help_text"           VARCHAR(240),
    -- NULL = every service; otherwise the services that ask it
    "service_ids"         UUID[],
    "required"            BOOLEAN      NOT NULL DEFAULT false,
    -- „Apare și când echipa face programarea din Hub”
    "in_hub"              BOOLEAN      NOT NULL DEFAULT false,
    -- „Clientul poate adăuga o poză” (S127): an optional photo with the answer
    "allows_photo"        BOOLEAN      NOT NULL DEFAULT false,
    "sort_order"          INTEGER      NOT NULL DEFAULT 0,
    "archived_at"         TIMESTAMPTZ,
    "archived_by_user_id" UUID,
    "created_by_user_id"  UUID         NOT NULL,
    "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_question_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "form_question_label_check"
      CHECK ("label" = btrim("label") AND char_length("label") BETWEEN 1 AND 160),
    CONSTRAINT "form_question_kind_check" CHECK (
      ("kind" IN ('short_text', 'long_text', 'yes_no', 'number', 'date') AND "options" IS NULL)
      OR ("kind" IN ('choice', 'multi') AND jsonb_typeof("options") = 'array'
          AND jsonb_array_length("options") BETWEEN 2 AND 20)
    ),
    CONSTRAINT "form_question_help_text_check"
      CHECK ("help_text" IS NULL OR char_length(btrim("help_text")) BETWEEN 1 AND 240),
    CONSTRAINT "form_question_sort_order_check" CHECK ("sort_order" BETWEEN 0 AND 1000000),
    CONSTRAINT "form_question_archived_check"
      CHECK (("archived_at" IS NULL) = ("archived_by_user_id" IS NULL))
);

-- the answers point to a question of the same business (composite FK, as in booking_manage)
CREATE UNIQUE INDEX "form_question_organization_id_id_key"
  ON "booking"."form_question"("organization_id", "id");
CREATE INDEX "form_question_organization_id_sort_idx"
  ON "booking"."form_question"("organization_id", "sort_order");

-- CreateTable
CREATE TABLE "booking"."appointment_answer" (
    "id"                 UUID         NOT NULL,
    "organization_id"    UUID         NOT NULL,
    "appointment_id"     UUID         NOT NULL,
    "question_id"        UUID         NOT NULL,
    -- the text of the question when it was answered
    "question_label"     VARCHAR(160) NOT NULL,
    -- a string (text, yes / no, choice, date), an array of strings (several choices) or a number;
    -- NULL once wiped
    "value"              JSONB,
    -- the optional photo (core/files, files.file.id; another schema, so no FK); kept after the
    -- erasure until the file is deleted (photo_deleted_at)
    "photo_file_id"      UUID,
    "photo_deleted_at"   TIMESTAMPTZ,
    -- client: the public page; team: from the Hub
    "source"             VARCHAR(6)   NOT NULL,
    "updated_by_user_id" UUID,
    "wiped_at"           TIMESTAMPTZ,
    "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_answer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "appointment_answer_appointment_fkey" FOREIGN KEY ("organization_id", "appointment_id")
      REFERENCES "booking"."appointment"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "appointment_answer_question_fkey" FOREIGN KEY ("organization_id", "question_id")
      REFERENCES "booking"."form_question"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "appointment_answer_label_check"
      CHECK (char_length("question_label") BETWEEN 1 AND 160),
    -- a live answer has a value or a photo (or both); a wiped one has no value
    CONSTRAINT "appointment_answer_value_check" CHECK (
      (("wiped_at" IS NULL AND ("value" IS NOT NULL OR "photo_file_id" IS NOT NULL))
       OR ("wiped_at" IS NOT NULL AND "value" IS NULL))
      AND ("value" IS NULL OR jsonb_typeof("value") IN ('string', 'array', 'number'))
    ),
    CONSTRAINT "appointment_answer_photo_check"
      CHECK ("photo_deleted_at" IS NULL OR "photo_file_id" IS NOT NULL),
    CONSTRAINT "appointment_answer_source_check" CHECK (
      ("source" = 'client' AND "updated_by_user_id" IS NULL)
      OR ("source" = 'team' AND "updated_by_user_id" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "appointment_answer_appointment_id_question_id_key"
  ON "booking"."appointment_answer"("appointment_id", "question_id");
CREATE INDEX "appointment_answer_question_id_idx"
  ON "booking"."appointment_answer"("question_id");

CREATE TRIGGER form_question_touch
  BEFORE UPDATE ON "booking"."form_question"
  FOR EACH ROW EXECUTE FUNCTION booking.touch_updated_at();
CREATE TRIGGER appointment_answer_touch
  BEFORE UPDATE ON "booking"."appointment_answer"
  FOR EACH ROW EXECUTE FUNCTION booking.touch_updated_at();

-- RLS (D-SEC-1): USING + WITH CHECK on the organization of the transaction
ALTER TABLE "booking"."form_question" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "booking"."appointment_answer" ENABLE ROW LEVEL SECURITY;

CREATE POLICY booking_rw_form_question ON "booking"."form_question"
  FOR ALL TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY booking_rw_appointment_answer ON "booking"."appointment_answer"
  FOR ALL TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Grants (only booking_rw): no DELETE, no TRUNCATE
REVOKE ALL ON "booking"."form_question", "booking"."appointment_answer" FROM PUBLIC;
GRANT SELECT, INSERT ON "booking"."form_question", "booking"."appointment_answer" TO booking_rw;
GRANT UPDATE ("label", "kind", "options", "help_text", "service_ids", "required", "in_hub",
              "allows_photo", "sort_order", "archived_at", "archived_by_user_id", "updated_at")
  ON "booking"."form_question" TO booking_rw;
GRANT UPDATE ("question_label", "value", "photo_file_id", "photo_deleted_at", "source",
              "updated_by_user_id", "wiped_at", "updated_at")
  ON "booking"."appointment_answer" TO booking_rw;

-- public_hold: the answers wait in the hold while it is pending (personal data, like the message)
ALTER TABLE "booking"."public_hold" ADD COLUMN "answers" JSONB;
-- a photo was asked for on this hold: the cleanup job deletes the photos not moved to a booking
ALTER TABLE "booking"."public_hold" ADD COLUMN "has_photos" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "booking"."public_hold"
  ADD CONSTRAINT "public_hold_answers_check"
    CHECK ("answers" IS NULL OR jsonb_typeof("answers") = 'array');
ALTER TABLE "booking"."public_hold" DROP CONSTRAINT "public_hold_settled_check";
ALTER TABLE "booking"."public_hold"
  ADD CONSTRAINT "public_hold_settled_check" CHECK (
    ("state" = 'pending' AND "settled_at" IS NULL)
    OR ("state" <> 'pending' AND "settled_at" IS NOT NULL
        AND "client_name" IS NULL AND "client_phone" IS NULL AND "client_email" IS NULL
        AND "message" IS NULL AND "answers" IS NULL)
  );
ALTER TABLE "booking"."public_hold" DROP CONSTRAINT "public_hold_move_check";
ALTER TABLE "booking"."public_hold"
  ADD CONSTRAINT "public_hold_move_check" CHECK (
    ("move_appointment_id" IS NULL AND "code_hash" IS NOT NULL)
    OR ("move_appointment_id" IS NOT NULL AND "code_hash" IS NULL
        AND "client_name" IS NULL AND "client_phone" IS NULL AND "client_email" IS NULL
        AND "message" IS NULL AND "answers" IS NULL AND NOT "has_photos"
        AND ("appointment_id" IS NULL OR "appointment_id" = "move_appointment_id"))
  );
GRANT UPDATE ("answers", "has_photos") ON "booking"."public_hold" TO booking_rw;

-- The job booking.public-hold-cleanup also deletes the photos of the settled holds (expired,
-- refused, or confirmed with photos not moved to the booking) and retries the photos of erased
-- clients still marked: the businesses with such rows are added to its list (only ids). The same function as in booking_manage plus that branch; CREATE OR
-- REPLACE keeps its grant (EXECUTE only booking_rw).
CREATE OR REPLACE FUNCTION booking.public_hold_cleanup_due(p_limit INTEGER)
RETURNS TABLE (organization_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT q.organization_id FROM (
    SELECT h.organization_id
      FROM booking.public_hold h
     WHERE (h.state = 'pending' AND h.expires_at <= now())
        OR ((h.email_hash IS NOT NULL OR h.ip_hash IS NOT NULL)
            AND h.created_at < now() - INTERVAL '24 hours')
        OR (h.has_photos AND h.state <> 'pending')
    UNION
    -- the photos of erased clients still marked (the storage refused them at the erasure)
    SELECT q.organization_id
      FROM booking.appointment_answer q
     WHERE q.wiped_at IS NOT NULL AND q.photo_file_id IS NOT NULL AND q.photo_deleted_at IS NULL
    UNION
    SELECT t.organization_id
      FROM booking.manage_token t
      JOIN booking.appointment a
        ON a.organization_id = t.organization_id AND a.id = t.appointment_id
     WHERE t.revoked_at IS NULL AND a.ends_at < now() - INTERVAL '30 days'
  ) q
   ORDER BY q.organization_id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 500);
$$;

-- ── the GDPR erasure, extended (the founder's rule of 10.11.2026) ────────────────────────────
-- The same function as in booking_manage, plus the answers to the questions of the client's bookings.
CREATE OR REPLACE FUNCTION booking.erase_client(p_client UUID, p_user UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_org UUID := NULLIF(current_setting('app.organization_id', true), '')::uuid;
  v_erased TIMESTAMPTZ;
  v_ids UUID[];
  v_count INTEGER;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no organization in the transaction' USING ERRCODE = '42501';
  END IF;
  IF p_user IS NULL THEN
    RAISE EXCEPTION 'the user who erases is required' USING ERRCODE = '23502';
  END IF;

  SELECT c.erased_at INTO v_erased
    FROM booking.client c
   WHERE c.id = p_client AND c.organization_id = v_org
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'client % not found', p_client USING ERRCODE = 'P0002';
  END IF;
  IF v_erased IS NOT NULL THEN
    RETURN 0;
  END IF;

  SELECT array_agg(c.id) INTO v_ids
    FROM booking.client c
   WHERE c.organization_id = v_org
     AND (c.id = p_client OR c.merged_into_client_id = p_client);

  UPDATE booking.client c
     SET name = 'Client șters', phone = NULL, email = NULL,
         erased_at = now(), erased_by_user_id = p_user,
         archived_at = COALESCE(c.archived_at, now()),
         archived_by_user_id = COALESCE(c.archived_by_user_id, p_user),
         updated_at = now()
   WHERE c.organization_id = v_org AND c.id = ANY (v_ids);

  UPDATE booking.appointment a
     SET client_name = 'Client șters', team_note = NULL
   WHERE a.organization_id = v_org AND a.client_id = ANY (v_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE booking.client_block b
     SET reason = 'Șters la cererea clientului'
   WHERE b.organization_id = v_org AND b.client_id = ANY (v_ids);

  UPDATE booking.client_note_removal r
     SET reason = 'Șters la cererea clientului'
   WHERE r.organization_id = v_org AND r.client_id = ANY (v_ids);

  -- B.8: the health answers wiped, the consents withdrawn by the business
  UPDATE booking.medical_answer m
     SET value_encrypted = NULL, wiped_at = now(), updated_by_user_id = p_user
   WHERE m.organization_id = v_org AND m.client_id = ANY (v_ids) AND m.wiped_at IS NULL;

  UPDATE booking.medical_consent k
     SET withdrawn_at = now(), withdrawn_by = 'business', withdrawn_by_user_id = p_user
   WHERE k.organization_id = v_org AND k.client_id = ANY (v_ids) AND k.withdrawn_at IS NULL;

  -- B.21: the notes of the payments (free text, may hold personal data)
  UPDATE booking.appointment_payment p
     SET note = NULL
   WHERE p.organization_id = v_org AND p.client_id = ANY (v_ids) AND p.note IS NOT NULL;

  -- B.11b: the client's links to their bookings, revoked
  UPDATE booking.manage_token t
     SET revoked_at = now()
   WHERE t.organization_id = v_org AND t.revoked_at IS NULL
     AND t.appointment_id IN (
       SELECT a.id FROM booking.appointment a
        WHERE a.organization_id = v_org AND a.client_id = ANY (v_ids));

  -- B.12: the answers to the salon's questions, wiped; their photos marked (photo_file_id kept,
  -- photo_deleted_at NULL) for the deletion through core/files
  UPDATE booking.appointment_answer q
     SET value = NULL, wiped_at = now()
   WHERE q.organization_id = v_org AND q.wiped_at IS NULL
     AND q.appointment_id IN (
       SELECT a.id FROM booking.appointment a
        WHERE a.organization_id = v_org AND a.client_id = ANY (v_ids));

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION booking.erase_client(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION booking.erase_client(UUID, UUID) TO booking_rw;
