-- Lot B.9c — the waiting list (design BookingWaitlist, S126; plan
-- reports/2026-11-12_plan-booking-b9.md). A client waits for a service (a member or „Oricine e
-- liber”), on some days, in an interval of the day; when a time frees up, the team offers it to one
-- client (D-9c-1: the team chooses; D-9c-2: one offer at a time per freed time). The client answers
-- from a link (/r/<slug>/w/<token>): the token is kept only as its hash, as for B.11b.
--
-- RLS (USING + WITH CHECK), grants only to booking_rw on columns, no DELETE. The job
-- booking.waitlist-offers closes the expired offers and the ones whose time was taken
-- (booking.waitlist_offers_due: only ids, across RLS). erase_client is recreated with its whole body
-- plus the waiting list (the note wiped, the entries closed, the open offers withdrawn).

CREATE TABLE "booking"."waitlist_entry" (
  "id"                      UUID         NOT NULL,
  "organization_id"         UUID         NOT NULL,
  "client_id"               UUID         NOT NULL,
  "service_id"              UUID         NOT NULL,
  -- NULL = „Oricine e liber”
  "staff_member_id"         UUID,
  -- the days the client can come (local dates in the business time zone, both included)
  "date_from"               DATE         NOT NULL,
  "date_to"                 DATE         NOT NULL,
  -- „Oricând”, „Dimineața” (before 12:00), „După-amiaza” (12:00–17:00), „Seara” (from 17:00),
  -- „Interval” (from_minute … to_minute, local)
  "time_kind"               VARCHAR(10)  NOT NULL,
  "from_minute"             SMALLINT,
  "to_minute"               SMALLINT,
  -- the team's note (free text; wiped by erase_client)
  "note"                    VARCHAR(500),
  -- „Așteaptă”, „Ofertă trimisă”, „A acceptat”, removed from the list
  "status"                  VARCHAR(10)  NOT NULL DEFAULT 'waiting',
  "accepted_appointment_id" UUID,
  "removed_at"              TIMESTAMPTZ,
  "removed_by_user_id"      UUID,
  "created_by_user_id"      UUID         NOT NULL,
  "created_at"              TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"              TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "waitlist_entry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "waitlist_entry_client_id_fkey" FOREIGN KEY ("client_id")
    REFERENCES "booking"."client" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "waitlist_entry_service_id_fkey" FOREIGN KEY ("service_id")
    REFERENCES "booking"."service" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "waitlist_entry_staff_member_id_fkey" FOREIGN KEY ("staff_member_id")
    REFERENCES "booking"."staff_member" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "waitlist_entry_appointment_fkey" FOREIGN KEY ("organization_id", "accepted_appointment_id")
    REFERENCES "booking"."appointment" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "waitlist_entry_dates_check"
    CHECK ("date_to" >= "date_from" AND "date_to" <= "date_from" + 90),
  CONSTRAINT "waitlist_entry_time_check" CHECK (
    ("time_kind" IN ('any', 'morning', 'afternoon', 'evening')
      AND "from_minute" IS NULL AND "to_minute" IS NULL)
    OR ("time_kind" = 'custom'
      AND "from_minute" BETWEEN 0 AND 1435 AND "from_minute" % 5 = 0
      AND "to_minute" BETWEEN 5 AND 1440 AND "to_minute" % 5 = 0
      AND "to_minute" > "from_minute")
  ),
  CONSTRAINT "waitlist_entry_note_check"
    CHECK ("note" IS NULL OR char_length("note") BETWEEN 1 AND 500),
  CONSTRAINT "waitlist_entry_status_check" CHECK (
    ("status" IN ('waiting', 'offered') AND "removed_at" IS NULL AND "accepted_appointment_id" IS NULL)
    OR ("status" = 'accepted' AND "accepted_appointment_id" IS NOT NULL)
    OR ("status" = 'removed' AND "removed_at" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "waitlist_entry_organization_id_id_key"
  ON "booking"."waitlist_entry" ("organization_id", "id");
CREATE INDEX "waitlist_entry_organization_id_status_created_idx"
  ON "booking"."waitlist_entry" ("organization_id", "status", "created_at");
CREATE INDEX "waitlist_entry_client_id_idx" ON "booking"."waitlist_entry" ("client_id");

CREATE TABLE "booking"."waitlist_offer" (
  "id"                 UUID         NOT NULL,
  "organization_id"    UUID         NOT NULL,
  "entry_id"           UUID         NOT NULL,
  -- the freed time offered (the member, the service of the entry, the start and the end)
  "staff_member_id"    UUID         NOT NULL,
  "starts_at"          TIMESTAMPTZ  NOT NULL,
  "ends_at"            TIMESTAMPTZ  NOT NULL,
  -- „Cât timp e valabilă”: 30 min, 1 h, 2 h
  "expires_at"         TIMESTAMPTZ  NOT NULL,
  -- D-9c-3: SMS counts against the business's SMS; until B.17/B.13 only e-mail is offered
  "channel"            VARCHAR(5)   NOT NULL,
  -- sha256 of the link token (the token itself is shown once, never stored)
  "token_hash"         CHAR(64)     NOT NULL,
  "state"              VARCHAR(10)  NOT NULL DEFAULT 'pending',
  -- the booking made when the client took the place (its id is the offer's id)
  "appointment_id"     UUID,
  "closed_at"          TIMESTAMPTZ,
  "created_by_user_id" UUID         NOT NULL,
  "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "waitlist_offer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "waitlist_offer_entry_fkey" FOREIGN KEY ("organization_id", "entry_id")
    REFERENCES "booking"."waitlist_entry" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "waitlist_offer_staff_member_id_fkey" FOREIGN KEY ("staff_member_id")
    REFERENCES "booking"."staff_member" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "waitlist_offer_appointment_fkey" FOREIGN KEY ("organization_id", "appointment_id")
    REFERENCES "booking"."appointment" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "waitlist_offer_time_check"
    CHECK ("ends_at" > "starts_at" AND "expires_at" > "created_at"),
  CONSTRAINT "waitlist_offer_channel_check" CHECK ("channel" IN ('email', 'sms')),
  CONSTRAINT "waitlist_offer_state_check" CHECK (
    ("state" = 'pending' AND "closed_at" IS NULL AND "appointment_id" IS NULL)
    OR ("state" = 'accepted' AND "closed_at" IS NOT NULL AND "appointment_id" IS NOT NULL)
    OR ("state" IN ('declined', 'expired', 'taken', 'withdrawn') AND "closed_at" IS NOT NULL
        AND "appointment_id" IS NULL)
  )
);

CREATE UNIQUE INDEX "waitlist_offer_token_hash_key" ON "booking"."waitlist_offer" ("token_hash");
CREATE INDEX "waitlist_offer_entry_id_idx" ON "booking"."waitlist_offer" ("entry_id");
CREATE INDEX "waitlist_offer_staff_member_id_starts_idx"
  ON "booking"."waitlist_offer" ("staff_member_id", "starts_at");
-- one open offer per entry (D-9c-2 for the same freed time is checked under the member's lock)
CREATE UNIQUE INDEX "waitlist_offer_pending_entry_key"
  ON "booking"."waitlist_offer" ("entry_id", (("state" = 'pending'))) WHERE "state" = 'pending';

-- RLS (D-SEC-1): USING + WITH CHECK on the organization of the transaction
ALTER TABLE "booking"."waitlist_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "booking"."waitlist_offer" ENABLE ROW LEVEL SECURITY;
CREATE POLICY booking_rw_waitlist_entry ON "booking"."waitlist_entry"
  FOR ALL TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY booking_rw_waitlist_offer ON "booking"."waitlist_offer"
  FOR ALL TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Grants (only booking_rw): no DELETE, no TRUNCATE
REVOKE ALL ON "booking"."waitlist_entry", "booking"."waitlist_offer" FROM PUBLIC;
GRANT SELECT, INSERT ON "booking"."waitlist_entry", "booking"."waitlist_offer" TO booking_rw;
GRANT UPDATE ("note", "status", "accepted_appointment_id", "removed_at", "removed_by_user_id",
              "updated_at")
  ON "booking"."waitlist_entry" TO booking_rw;
GRANT UPDATE ("state", "appointment_id", "closed_at") ON "booking"."waitlist_offer" TO booking_rw;

-- The businesses with an offer to close (expired, or its time taken by a booking): only the ids;
-- the job works in each business's own context, as booking_rw (same pattern as
-- public_hold_cleanup_due).
CREATE OR REPLACE FUNCTION booking.waitlist_offers_due(p_limit INTEGER)
RETURNS TABLE (organization_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT DISTINCT o.organization_id
    FROM booking.waitlist_offer o
   WHERE o.state = 'pending'
     AND (o.expires_at <= now()
       OR EXISTS (
         SELECT 1 FROM booking.appointment a
          WHERE a.organization_id = o.organization_id
            AND a.staff_member_id = o.staff_member_id
            AND a.status IN ('awaiting_payment', 'unconfirmed', 'confirmed', 'in_progress')
            AND tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(o.starts_at, o.ends_at, '[)')))
   ORDER BY o.organization_id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 500);
$$;

REVOKE ALL ON FUNCTION booking.waitlist_offers_due(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION booking.waitlist_offers_due(INTEGER) TO booking_rw;

-- ── the GDPR erasure, extended (the founder's rule of 10.11.2026) ────────────────────────────
-- The same function as in booking_forms, plus the waiting list: the note wiped, the open entries
-- removed, the open offers withdrawn (their link stops working).
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

  -- B.9c: the waiting list — the open offers withdrawn (the link stops working), the note wiped,
  -- the open entries removed
  UPDATE booking.waitlist_offer o
     SET state = 'withdrawn', closed_at = now()
   WHERE o.organization_id = v_org AND o.state = 'pending'
     AND o.entry_id IN (
       SELECT e.id FROM booking.waitlist_entry e
        WHERE e.organization_id = v_org AND e.client_id = ANY (v_ids));

  UPDATE booking.waitlist_entry e
     SET note = NULL,
         status = CASE WHEN e.status IN ('waiting', 'offered') THEN 'removed' ELSE e.status END,
         removed_at = CASE WHEN e.status IN ('waiting', 'offered') THEN now() ELSE e.removed_at END,
         removed_by_user_id = CASE WHEN e.status IN ('waiting', 'offered') THEN p_user
                                   ELSE e.removed_by_user_id END,
         updated_at = now()
   WHERE e.organization_id = v_org AND e.client_id = ANY (v_ids);

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION booking.erase_client(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION booking.erase_client(UUID, UUID) TO booking_rw;
