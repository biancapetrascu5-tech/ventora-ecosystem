-- Lot B.7a (BOOKING.md §3 B.7; plan reports/2026-11-10_1745_plan-booking-b7.md, approved
-- 10.11.2026: D-B7-1 = a, D-B7-2 = a, D-B7-3 = a, D-B7-4 = a; design BookingClientCard,
-- BookingBlockedClients S125): the client card. No new role, no extension, no DELETE.
--
--   client.merged_into_*  → D-B7-2 = a: a merged client is archived and points to the one kept; its
--                           appointments keep their client_id (protected, B.4a) and show on the kept one
--   client.erased_*       → D-B7-1 = a: the GDPR erasure (ARCHITECTURE §6.4 e), written only by
--                           booking.erase_client
--   client_block          → BookingBlockedClients (S125): a block with its internal reason; unblocking
--                           closes it and keeps the reason (the business log)

ALTER TABLE "booking"."client"
  ADD COLUMN "merged_into_client_id" UUID,
  ADD COLUMN "merged_at"             TIMESTAMPTZ,
  ADD COLUMN "merged_by_user_id"     UUID,
  ADD COLUMN "erased_at"             TIMESTAMPTZ,
  ADD COLUMN "erased_by_user_id"     UUID,
  ADD CONSTRAINT "client_merged_into_client_id_fkey" FOREIGN KEY ("merged_into_client_id")
    REFERENCES "booking"."client" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  -- a merged client: archived, never into itself, with who and when
  ADD CONSTRAINT "client_merged_check" CHECK (
    ("merged_into_client_id" IS NULL AND "merged_at" IS NULL AND "merged_by_user_id" IS NULL)
    OR ("merged_into_client_id" IS NOT NULL AND "merged_into_client_id" <> "id"
        AND "merged_at" IS NOT NULL AND "merged_by_user_id" IS NOT NULL
        AND "archived_at" IS NOT NULL)
  ),
  ADD CONSTRAINT "client_erased_check"
    CHECK (("erased_at" IS NULL) = ("erased_by_user_id" IS NULL));

-- D-B7-1 = a: an erased client has no phone and no e-mail
ALTER TABLE "booking"."client" DROP CONSTRAINT "client_contact_check";
ALTER TABLE "booking"."client" ADD CONSTRAINT "client_contact_check"
  CHECK ("phone" IS NOT NULL OR "email" IS NOT NULL OR "erased_at" IS NOT NULL);

CREATE INDEX "client_merged_into_client_id_idx" ON "booking"."client" ("merged_into_client_id");

-- CreateTable
CREATE TABLE "booking"."client_block" (
  "id"                   UUID         NOT NULL,
  "organization_id"      UUID         NOT NULL,
  "client_id"            UUID         NOT NULL,
  -- „Motiv intern” (S125): at least 10 characters; only the owner and the admins see it
  "reason"               VARCHAR(500) NOT NULL,
  "blocked_at"           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "blocked_by_user_id"   UUID         NOT NULL,
  "unblocked_at"         TIMESTAMPTZ,
  "unblocked_by_user_id" UUID,
  "updated_at"           TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "client_block_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "client_block_client_id_fkey" FOREIGN KEY ("client_id")
    REFERENCES "booking"."client" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "client_block_reason_check"
    CHECK ("reason" = btrim("reason") AND char_length("reason") BETWEEN 10 AND 500),
  CONSTRAINT "client_block_unblocked_check"
    CHECK (("unblocked_at" IS NULL) = ("unblocked_by_user_id" IS NULL))
);

CREATE INDEX "client_block_client_id_idx" ON "booking"."client_block" ("client_id");
-- one open block per client (the client as text: an expression, which keeps the partial index out
-- of the Prisma schema, as in booking_staff)
CREATE UNIQUE INDEX "client_block_open_key"
  ON "booking"."client_block" (("client_id"::text))
  WHERE "unblocked_at" IS NULL;

CREATE TRIGGER client_block_touch
  BEFORE UPDATE ON "booking"."client_block"
  FOR EACH ROW EXECUTE FUNCTION booking.touch_updated_at();

-- RLS (D-SEC-1): USING + WITH CHECK on the organization of the transaction
ALTER TABLE "booking"."client_block" ENABLE ROW LEVEL SECURITY;

CREATE POLICY booking_rw_client_block ON "booking"."client_block"
  TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- ── D-B7-1 = a: the GDPR erasure ─────────────────────────────────────────────────────────────
--
-- The only way to change the copy of the client's name on the appointments (appointment.client_name
-- is protected for booking_rw, B.4a keep_snapshot). SECURITY DEFINER, so it bypasses RLS: it reads
-- the organization from the transaction (app.organization_id, set by withBookingTx) and touches only
-- that organization's rows. It anonymizes, in one call:
--   - the client and the clients merged into it (the same person): name „Client șters”, no phone,
--     no e-mail, erased and archived;
--   - the copy of their name on their appointments, and the team's note on them (it may hold
--     personal data); the appointments stay, for the business's history;
--   - the internal reasons of their blocks.
-- It returns how many appointments were anonymized. A client already erased: nothing to do (0).
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

  -- the client and the clients merged into it, all of this organization
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

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION booking.erase_client(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION booking.erase_client(UUID, UUID) TO booking_rw;

-- Grants, as for the other booking tables: no DELETE, no TRUNCATE. The erasure columns are not
-- granted: only booking.erase_client writes them.
REVOKE ALL ON "booking"."client_block" FROM PUBLIC;
GRANT SELECT, INSERT ON "booking"."client_block" TO booking_rw;
GRANT UPDATE ("unblocked_at", "unblocked_by_user_id", "updated_at")
  ON "booking"."client_block" TO booking_rw;
GRANT UPDATE ("merged_into_client_id", "merged_at", "merged_by_user_id")
  ON "booking"."client" TO booking_rw;
