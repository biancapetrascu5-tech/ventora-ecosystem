-- Lot B.9d2 — the waiting list of a class and the online booking of a seat (design BookingClasses,
-- S126; plan reports/2026-11-12_plan-booking-b9.md).
--   D-9d-2: the waiting list of a class is automatic: when a seat frees up, the first person on the
--           list gets the offer (through the offers of B.9c);
--   D-9d-3: a seat can be booked online, with the seats left shown; closed when full or at the
--           online cut-off (the notice of the business).
--
-- The tables of B.9c and B.11a get the session they are for:
--   waitlist_entry.class_session_id  the entry waits for one session (its member, service and day);
--   waitlist_offer.class_session_id  the offer is a seat of that session; an automatic offer has no
--                                    user (created_by_user_id NULL only then);
--   public_hold.class_session_id     the 10 minutes of the online booking hold one seat.
-- A pending offer and a pending hold keep their seat (checked by the app under the session's
-- lock); the participants are still at most the seats (the rule of appointment_guard, B.9d1).
-- The token of an automatic offer is issued again when the link is sent (token_hash rotated: the
-- old link stops working), so the column gets an UPDATE grant.
--
-- booking.waitlist_offers_due is recreated with its whole body (booking_waitlist) plus: the class
-- offers whose session was cancelled, started or filled, and the sessions with a free seat and
-- someone waiting (or with entries left on a session that is over). Only ids, as before.
-- No new table, role or package; RLS and the policies of the three tables are unchanged.

-- ── the waiting list of a session ────────────────────────────────────────────────────────────
ALTER TABLE "booking"."waitlist_entry" ADD COLUMN "class_session_id" UUID;
ALTER TABLE "booking"."waitlist_entry"
  ADD CONSTRAINT "waitlist_entry_class_session_fkey" FOREIGN KEY ("organization_id", "class_session_id")
    REFERENCES "booking"."class_session" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
-- an entry for a session: its member, one day, any time of that day
ALTER TABLE "booking"."waitlist_entry"
  ADD CONSTRAINT "waitlist_entry_class_session_check" CHECK (
    "class_session_id" IS NULL
    OR ("staff_member_id" IS NOT NULL AND "date_to" = "date_from" AND "time_kind" = 'any')
  );
CREATE INDEX "waitlist_entry_class_session_created_idx"
  ON "booking"."waitlist_entry" ("class_session_id", "created_at") WHERE "class_session_id" IS NOT NULL;
-- a client waits once for a session
CREATE UNIQUE INDEX "waitlist_entry_class_session_client_key"
  ON "booking"."waitlist_entry" ("class_session_id", "client_id")
  WHERE "class_session_id" IS NOT NULL AND "status" IN ('waiting', 'offered');

-- ── the offer of a seat ──────────────────────────────────────────────────────────────────────
ALTER TABLE "booking"."waitlist_offer" ADD COLUMN "class_session_id" UUID;
ALTER TABLE "booking"."waitlist_offer"
  ADD CONSTRAINT "waitlist_offer_class_session_fkey" FOREIGN KEY ("organization_id", "class_session_id")
    REFERENCES "booking"."class_session" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
-- the automatic offer (D-9d-2) is made by the system: no user
ALTER TABLE "booking"."waitlist_offer" ALTER COLUMN "created_by_user_id" DROP NOT NULL;
ALTER TABLE "booking"."waitlist_offer"
  ADD CONSTRAINT "waitlist_offer_created_by_check"
    CHECK ("created_by_user_id" IS NOT NULL OR "class_session_id" IS NOT NULL);
CREATE INDEX "waitlist_offer_class_session_idx"
  ON "booking"."waitlist_offer" ("class_session_id") WHERE "class_session_id" IS NOT NULL;
-- the link sent again: a new token, the old one stops working
GRANT UPDATE ("token_hash") ON "booking"."waitlist_offer" TO booking_rw;

-- ── the online hold of a seat ────────────────────────────────────────────────────────────────
ALTER TABLE "booking"."public_hold" ADD COLUMN "class_session_id" UUID;
ALTER TABLE "booking"."public_hold"
  ADD CONSTRAINT "public_hold_class_session_fkey" FOREIGN KEY ("organization_id", "class_session_id")
    REFERENCES "booking"."class_session" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
-- a seat is booked, never moved, online (B.11b keeps a participant 'online_closed')
ALTER TABLE "booking"."public_hold"
  ADD CONSTRAINT "public_hold_class_session_check"
    CHECK ("class_session_id" IS NULL OR "move_appointment_id" IS NULL);
CREATE INDEX "public_hold_class_session_idx"
  ON "booking"."public_hold" ("class_session_id") WHERE "class_session_id" IS NOT NULL;

-- ── the job booking.waitlist-offers, extended ────────────────────────────────────────────────
-- The same function as in booking_waitlist (the general offers: expired, or their time booked),
-- plus the classes: an offer whose session was cancelled, started or filled; a session still ahead
-- with a free seat (seats − participants − pending offers − pending holds) and someone waiting; a
-- session cancelled or started with entries still waiting. 15 minutes before the start no offer is
-- made any more (CLASS_WAITLIST_LIMITS.leadMinutes).
CREATE OR REPLACE FUNCTION booking.waitlist_offers_due(p_limit INTEGER)
RETURNS TABLE (organization_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT DISTINCT d.organization_id
    FROM (
      SELECT o.organization_id
        FROM booking.waitlist_offer o
       WHERE o.state = 'pending'
         AND (o.expires_at <= now()
           OR (o.class_session_id IS NULL AND EXISTS (
             SELECT 1 FROM booking.appointment a
              WHERE a.organization_id = o.organization_id
                AND a.staff_member_id = o.staff_member_id
                AND a.status IN ('awaiting_payment', 'unconfirmed', 'confirmed', 'in_progress')
                AND tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(o.starts_at, o.ends_at, '[)')))
           OR (o.class_session_id IS NOT NULL AND EXISTS (
             SELECT 1 FROM booking.class_session s
              WHERE s.organization_id = o.organization_id
                AND s.id = o.class_session_id
                AND (s.status <> 'scheduled' OR s.starts_at <= now()
                  OR (SELECT count(*) FROM booking.appointment a
                       WHERE a.organization_id = s.organization_id
                         AND a.class_session_id = s.id
                         AND a.status IN ('awaiting_payment', 'unconfirmed', 'confirmed',
                                          'in_progress', 'completed')) >= s.seats))))
      UNION
      SELECT e.organization_id
        FROM booking.waitlist_entry e
        JOIN booking.class_session s
          ON s.organization_id = e.organization_id AND s.id = e.class_session_id
       WHERE e.status IN ('waiting', 'offered')
         AND (s.status <> 'scheduled' OR s.starts_at <= now()
           OR (e.status = 'waiting' AND s.starts_at > now() + interval '15 minutes'
             AND s.seats
                 - (SELECT count(*) FROM booking.appointment a
                     WHERE a.organization_id = s.organization_id
                       AND a.class_session_id = s.id
                       AND a.status IN ('awaiting_payment', 'unconfirmed', 'confirmed',
                                        'in_progress', 'completed'))
                 - (SELECT count(*) FROM booking.waitlist_offer x
                     WHERE x.organization_id = s.organization_id
                       AND x.class_session_id = s.id
                       AND x.state = 'pending' AND x.expires_at > now())
                 - (SELECT count(*) FROM booking.public_hold h
                     WHERE h.organization_id = s.organization_id
                       AND h.class_session_id = s.id
                       AND h.state = 'pending' AND h.expires_at > now()) > 0))
    ) d
   ORDER BY d.organization_id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 500);
$$;

REVOKE ALL ON FUNCTION booking.waitlist_offers_due(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION booking.waitlist_offers_due(INTEGER) TO booking_rw;
