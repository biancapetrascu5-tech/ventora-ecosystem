-- Lot B.11b (BOOKING.md §3 B.11; design BookingClientManage, S125): the client's link for moving or
-- cancelling a booking, without an account („Modificați sau anulați programarea” in the e-mails of
-- BookingClientEmails). The link is /r/<slug>/m/<token>: the business comes only from the slug (T1),
-- the booking from the token, looked up in that business's context.
--
--   manage_token → one row per link given out (the public page after the code; later each e-mail of
--                  B.13 may give its own). The token is never stored, only its SHA-256; it stays
--                  valid while the booking exists (it survives a move: S125 „the link”). Revoked by
--                  the GDPR erasure (erase_client) and never deleted.
--   public_hold  → a hold may now be a move: move_appointment_id = the booking being moved; such a
--                  hold has no code (the token is the proof) and no personal data. The old time stays
--                  the client's until they confirm (S125 „Move”).
--
-- Additive: one table, two columns' rules on public_hold, erase_client recreated with its previous
-- body plus the tokens. RLS (USING + WITH CHECK), grants only to booking_rw, no DELETE. No new role,
-- no new audit category, no package.

-- CreateTable
CREATE TABLE "booking"."manage_token" (
    "id"              UUID         NOT NULL,
    "organization_id" UUID         NOT NULL,
    "appointment_id"  UUID         NOT NULL,
    "token_hash"      CHAR(64)     NOT NULL,
    "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at"      TIMESTAMPTZ,

    CONSTRAINT "manage_token_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "manage_token_appointment_id_fkey" FOREIGN KEY ("appointment_id")
      REFERENCES "booking"."appointment"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "manage_token_token_hash_key" ON "booking"."manage_token"("token_hash");
CREATE INDEX "manage_token_appointment_id_idx" ON "booking"."manage_token"("appointment_id");

ALTER TABLE "booking"."manage_token" ENABLE ROW LEVEL SECURITY;

CREATE POLICY booking_rw_manage_token ON "booking"."manage_token"
  FOR ALL TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

REVOKE ALL ON "booking"."manage_token" FROM PUBLIC;
GRANT SELECT, INSERT ON "booking"."manage_token" TO booking_rw;
GRANT UPDATE ("revoked_at") ON "booking"."manage_token" TO booking_rw;

-- public_hold: a hold for a move (no code, no personal data)
ALTER TABLE "booking"."public_hold" ADD COLUMN "move_appointment_id" UUID;
ALTER TABLE "booking"."public_hold" ALTER COLUMN "code_hash" DROP NOT NULL;
ALTER TABLE "booking"."public_hold"
  ADD CONSTRAINT "public_hold_move_appointment_id_fkey" FOREIGN KEY ("move_appointment_id")
    REFERENCES "booking"."appointment"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."public_hold"
  ADD CONSTRAINT "public_hold_move_check" CHECK (
    ("move_appointment_id" IS NULL AND "code_hash" IS NOT NULL)
    OR ("move_appointment_id" IS NOT NULL AND "code_hash" IS NULL
        AND "client_name" IS NULL AND "client_phone" IS NULL AND "client_email" IS NULL
        AND "message" IS NULL
        AND ("appointment_id" IS NULL OR "appointment_id" = "move_appointment_id"))
  );
CREATE INDEX "public_hold_move_appointment_id_idx" ON "booking"."public_hold"("move_appointment_id");

-- ── the GDPR erasure, extended (the founder's rule of 10.11.2026) ────────────────────────────
-- The same function as in booking_payments, plus the client's links: revoked, so the page of an
-- erased client's booking is not found any more.
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

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION booking.erase_client(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION booking.erase_client(UUID, UUID) TO booking_rw;
