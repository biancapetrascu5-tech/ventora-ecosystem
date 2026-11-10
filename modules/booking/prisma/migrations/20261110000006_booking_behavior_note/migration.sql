-- Lot B.7b (BOOKING.md §3 B.7; plan reports/2026-11-10_1745_plan-booking-b7.md, with the founder's
-- change of 10.11.2026: the simple rule of design S139 BookingBehaviorNote replaces the score with
-- four labels of D-B-15). No new role, no extension, no DELETE.
--
-- One label, „Risc ridicat”: N no-shows (2 or 3, default 2) in the last M months (3, 6 or 12,
-- default 6); cancellations in time don't count; everyone else has no label. Off by default; when
-- turned on, only the no-shows from that moment count (behavior_note_since). The label is computed
-- on read (it disappears by itself after M months without no-shows); removing it from the card,
-- with a reason, counts only the no-shows after the removal. Only the owner, the admins and the
-- application manager see it; it never leaves EasyBook (not in events, ClientDesk, CampaignKit,
-- API, webhooks, the public page, e-mails, SMS).

ALTER TABLE "booking"."settings"
  ADD COLUMN "behavior_note_enabled"  BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN "behavior_note_no_shows" SMALLINT    NOT NULL DEFAULT 2,
  ADD COLUMN "behavior_note_months"   SMALLINT    NOT NULL DEFAULT 6,
  ADD COLUMN "behavior_note_since"    TIMESTAMPTZ,
  ADD CONSTRAINT "settings_behavior_note_check" CHECK (
    "behavior_note_no_shows" IN (2, 3)
    AND "behavior_note_months" IN (3, 6, 12)
    AND ("behavior_note_enabled" = ("behavior_note_since" IS NOT NULL))
  );

-- CreateTable
CREATE TABLE "booking"."client_note_removal" (
  "id"                 UUID         NOT NULL,
  "organization_id"    UUID         NOT NULL,
  "client_id"          UUID         NOT NULL,
  -- the reason of the removal (S139: logged); personal, so erased with the client (erase_client)
  "reason"             VARCHAR(500) NOT NULL,
  "removed_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "removed_by_user_id" UUID         NOT NULL,

  CONSTRAINT "client_note_removal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "client_note_removal_client_id_fkey" FOREIGN KEY ("client_id")
    REFERENCES "booking"."client" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "client_note_removal_reason_check"
    CHECK ("reason" = btrim("reason") AND char_length("reason") BETWEEN 10 AND 500)
);

CREATE INDEX "client_note_removal_client_id_idx"
  ON "booking"."client_note_removal" ("client_id", "removed_at");

ALTER TABLE "booking"."client_note_removal" ENABLE ROW LEVEL SECURITY;

CREATE POLICY booking_rw_client_note_removal ON "booking"."client_note_removal"
  TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- insert only (the log of the removals)
REVOKE ALL ON "booking"."client_note_removal" FROM PUBLIC;
GRANT SELECT, INSERT ON "booking"."client_note_removal" TO booking_rw;
GRANT UPDATE ("behavior_note_enabled", "behavior_note_no_shows", "behavior_note_months",
              "behavior_note_since")
  ON "booking"."settings" TO booking_rw;

-- ── the GDPR erasure, extended (the founder's rule of 10.11.2026) ────────────────────────────
-- The same function as in booking_clients (D-B7-1 = a), plus the reasons of the removals of the
-- note: after „Client șters” nothing personal stays.
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

  -- B.7b: the reasons of the removals of the behaviour note
  UPDATE booking.client_note_removal r
     SET reason = 'Șters la cererea clientului'
   WHERE r.organization_id = v_org AND r.client_id = ANY (v_ids);

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION booking.erase_client(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION booking.erase_client(UUID, UUID) TO booking_rw;
