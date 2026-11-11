-- Lot B.8 (BOOKING.md §3 B.8, D-B-14; design BookingHealthFields): the health fields. No new role,
-- no extension, no DELETE. Only on the businesses marked medical: the feature `booking.medical` of
-- the commercial registry, turned on by Founder per business (D-B-16 = a, proposed: the marking is
-- controlled by the Ventora team). Real medical data only after the lawyer's opinion (§6); until
-- then, test data.
--
--   medical_field    → the fields the business asks (Setări): label, kind, for which services
--   medical_consent  → the client's consent: when, which version of the text; withdrawn (by the salon
--                      or from the e-mail) → the answers are wiped
--   medical_answer   → one answer per client and field, ENCRYPTED by the application (AES-256-GCM,
--                      key BOOKING_MEDICAL_KEY): the database never holds the value in clear
-- Every read of a client's answers leaves an audit row (booking.medical_read, C.0g), with the
-- permission booking:medical (T3).

-- CreateTable
CREATE TABLE "booking"."medical_field" (
  "id"                  UUID         NOT NULL,
  "organization_id"     UUID         NOT NULL,
  "label"               VARCHAR(160) NOT NULL,
  -- text: free text; yes_no: Da / Nu; choice: one of `options`
  "kind"                VARCHAR(8)   NOT NULL,
  "options"             JSONB,
  -- NULL = every service; otherwise the services that ask it
  "service_ids"         UUID[],
  "required"            BOOLEAN      NOT NULL DEFAULT false,
  "sort_order"          INTEGER      NOT NULL DEFAULT 0,
  "archived_at"         TIMESTAMPTZ,
  "archived_by_user_id" UUID,
  "created_by_user_id"  UUID         NOT NULL,
  "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "medical_field_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "medical_field_label_check"
    CHECK ("label" = btrim("label") AND char_length("label") BETWEEN 1 AND 160),
  CONSTRAINT "medical_field_kind_check" CHECK (
    ("kind" IN ('text', 'yes_no') AND "options" IS NULL)
    OR ("kind" = 'choice' AND jsonb_typeof("options") = 'array'
        AND jsonb_array_length("options") BETWEEN 2 AND 20)
  ),
  CONSTRAINT "medical_field_sort_order_check" CHECK ("sort_order" BETWEEN 0 AND 1000000),
  CONSTRAINT "medical_field_archived_check"
    CHECK (("archived_at" IS NULL) = ("archived_by_user_id" IS NULL))
);

CREATE INDEX "medical_field_organization_id_sort_idx"
  ON "booking"."medical_field" ("organization_id", "sort_order");

-- CreateTable
CREATE TABLE "booking"."medical_consent" (
  "id"                     UUID        NOT NULL,
  "organization_id"        UUID        NOT NULL,
  "client_id"              UUID        NOT NULL,
  -- the version of the consent text shown (the legal text is provisional, BookingHealthFields)
  "text_version"           VARCHAR(32) NOT NULL,
  "given_at"               TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- team: recorded at the salon by a member; public: the client on the public page (B.11)
  "source"                 VARCHAR(6)  NOT NULL,
  "recorded_by_user_id"    UUID,
  "withdrawn_at"           TIMESTAMPTZ,
  "withdrawn_by"           VARCHAR(8),
  "withdrawn_by_user_id"   UUID,

  CONSTRAINT "medical_consent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "medical_consent_client_id_fkey" FOREIGN KEY ("client_id")
    REFERENCES "booking"."client" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "medical_consent_version_check"
    CHECK (char_length("text_version") BETWEEN 1 AND 32),
  CONSTRAINT "medical_consent_source_check" CHECK (
    ("source" = 'team' AND "recorded_by_user_id" IS NOT NULL)
    OR ("source" = 'public' AND "recorded_by_user_id" IS NULL)
  ),
  CONSTRAINT "medical_consent_withdrawn_check" CHECK (
    ("withdrawn_at" IS NULL AND "withdrawn_by" IS NULL AND "withdrawn_by_user_id" IS NULL)
    OR ("withdrawn_at" IS NOT NULL AND "withdrawn_by" IN ('business', 'client')
        AND (("withdrawn_by" = 'business') = ("withdrawn_by_user_id" IS NOT NULL)))
  )
);

CREATE INDEX "medical_consent_client_id_idx" ON "booking"."medical_consent" ("client_id");
-- one active consent per client (the client as text: an expression, which keeps the partial index
-- out of the Prisma schema, as in booking_staff)
CREATE UNIQUE INDEX "medical_consent_active_key"
  ON "booking"."medical_consent" (("client_id"::text))
  WHERE "withdrawn_at" IS NULL;

-- CreateTable
CREATE TABLE "booking"."medical_answer" (
  "id"              UUID        NOT NULL,
  "organization_id" UUID        NOT NULL,
  "client_id"       UUID        NOT NULL,
  "field_id"        UUID        NOT NULL,
  -- AES-256-GCM: version byte, 12-byte IV, 16-byte tag, the ciphertext; NULL once wiped
  "value_encrypted" BYTEA,
  "wiped_at"        TIMESTAMPTZ,
  "updated_by_user_id" UUID,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "medical_answer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "medical_answer_client_id_fkey" FOREIGN KEY ("client_id")
    REFERENCES "booking"."client" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "medical_answer_field_id_fkey" FOREIGN KEY ("field_id")
    REFERENCES "booking"."medical_field" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  -- a value or wiped, never both
  CONSTRAINT "medical_answer_value_check"
    CHECK (("value_encrypted" IS NULL) = ("wiped_at" IS NOT NULL))
);

CREATE UNIQUE INDEX "medical_answer_client_id_field_id_key"
  ON "booking"."medical_answer" ("client_id", "field_id");

CREATE TRIGGER medical_field_touch
  BEFORE UPDATE ON "booking"."medical_field"
  FOR EACH ROW EXECUTE FUNCTION booking.touch_updated_at();
CREATE TRIGGER medical_answer_touch
  BEFORE UPDATE ON "booking"."medical_answer"
  FOR EACH ROW EXECUTE FUNCTION booking.touch_updated_at();

-- RLS (D-SEC-1): USING + WITH CHECK on the organization of the transaction
ALTER TABLE "booking"."medical_field" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "booking"."medical_consent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "booking"."medical_answer" ENABLE ROW LEVEL SECURITY;

CREATE POLICY booking_rw_medical_field ON "booking"."medical_field"
  TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY booking_rw_medical_consent ON "booking"."medical_consent"
  TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY booking_rw_medical_answer ON "booking"."medical_answer"
  TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Grants (only booking_rw, as for the other booking tables): no DELETE, no TRUNCATE; a withdrawal
-- wipes the answers (value_encrypted NULL), it never deletes the rows.
REVOKE ALL ON "booking"."medical_field", "booking"."medical_consent", "booking"."medical_answer"
  FROM PUBLIC;
GRANT SELECT, INSERT ON "booking"."medical_field", "booking"."medical_consent",
                        "booking"."medical_answer" TO booking_rw;
GRANT UPDATE ("label", "kind", "options", "service_ids", "required", "sort_order", "archived_at",
              "archived_by_user_id", "updated_at")
  ON "booking"."medical_field" TO booking_rw;
GRANT UPDATE ("withdrawn_at", "withdrawn_by", "withdrawn_by_user_id")
  ON "booking"."medical_consent" TO booking_rw;
GRANT UPDATE ("value_encrypted", "wiped_at", "updated_by_user_id", "updated_at")
  ON "booking"."medical_answer" TO booking_rw;

-- ── the GDPR erasure, extended (the founder's rule of 10.11.2026) ────────────────────────────
-- The same function as in booking_behavior_note, plus the health answers (wiped) and the consents
-- (withdrawn by the business): after „Client șters” nothing personal stays.
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

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION booking.erase_client(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION booking.erase_client(UUID, UUID) TO booking_rw;
