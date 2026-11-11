-- Lot B.11a (BOOKING.md §3 B.11; design BookingPublic, S116): the public booking, without an
-- account. The client chooses a time, gives name, phone and e-mail, passes the anti-robot check
-- (Turnstile, verified on the server) and gets a 6-digit code by e-mail; the time is held 10
-- minutes (S116: „Păstrăm ora 12:30 pentru dumneavoastră încă 9:42”). With the right code the
-- appointment is written (source 'public'), counted in booking.appointments like one from the Hub.
--
-- public_hold: one row per attempt. The code is never stored, only its SHA-256 with the hold id;
-- the IP only as a SHA-256 (the limits per IP); the e-mail and phone are needed to write the client
-- and to send the code, and are wiped (with the name and the message) in the same UPDATE that
-- settles the hold (confirmed, expired, refused; the CHECK public_hold_settled_check holds it).
-- erase_client is not concerned: a hold is never linked to a client, and a settled one keeps no
-- personal data. A pending hold left behind is settled (and wiped) at the next public request, and
-- in any case by the internal Booking job (booking.public-hold-cleanup, every 10 minutes).
--
-- email_hash and ip_hash (review #164): a plain SHA-256 of an e-mail or an IP can be guessed, so
-- they live only as long as the limits need them (10 an hour per IP, 5 a day per e-mail): the job
-- sets both to NULL on the rows older than 24 hours. No key, no secret.
--
-- Additive: one table, RLS (USING + WITH CHECK), grants only to booking_rw (SELECT, INSERT and
-- UPDATE of the state columns and of the two hashes; no DELETE). One SECURITY DEFINER function for
-- the job (only ids). No new role, no new audit category, no package.

CREATE TABLE "booking"."public_hold" (
    "id"                UUID         NOT NULL,
    "organization_id"   UUID         NOT NULL,
    "staff_member_id"   UUID         NOT NULL,
    "service_id"        UUID         NOT NULL,
    "location_id"       UUID,
    "starts_at"         TIMESTAMPTZ  NOT NULL,
    "ends_at"           TIMESTAMPTZ  NOT NULL,
    "duration_minutes"  INTEGER      NOT NULL,
    "client_name"       VARCHAR(120),
    "client_phone"      VARCHAR(32),
    "client_email"      VARCHAR(254),
    "client_locale"     VARCHAR(5)   NOT NULL DEFAULT 'ro',
    "message"           VARCHAR(500),
    "email_hash"        CHAR(64),
    "ip_hash"           CHAR(64),
    "code_hash"         CHAR(64)     NOT NULL,
    "attempts"          SMALLINT     NOT NULL DEFAULT 0,
    "sends"             SMALLINT     NOT NULL DEFAULT 1,
    "last_sent_at"      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at"        TIMESTAMPTZ  NOT NULL,
    "state"             VARCHAR(9)   NOT NULL DEFAULT 'pending',
    "appointment_id"    UUID,
    "settled_at"        TIMESTAMPTZ,
    "created_at"        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_hold_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "public_hold_staff_member_id_fkey" FOREIGN KEY ("staff_member_id")
      REFERENCES "booking"."staff_member"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "public_hold_service_id_fkey" FOREIGN KEY ("service_id")
      REFERENCES "booking"."service"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "public_hold_interval_check" CHECK ("ends_at" > "starts_at"),
    CONSTRAINT "public_hold_state_check" CHECK ("state" IN ('pending', 'confirmed', 'expired', 'refused')),
    CONSTRAINT "public_hold_attempts_check" CHECK ("attempts" BETWEEN 0 AND 5),
    CONSTRAINT "public_hold_sends_check" CHECK ("sends" BETWEEN 1 AND 3),
    -- a settled hold keeps no personal data; a confirmed one points to its appointment
    CONSTRAINT "public_hold_settled_check" CHECK (
      ("state" = 'pending' AND "settled_at" IS NULL)
      OR ("state" <> 'pending' AND "settled_at" IS NOT NULL
          AND "client_name" IS NULL AND "client_phone" IS NULL AND "client_email" IS NULL
          AND "message" IS NULL)
    ),
    CONSTRAINT "public_hold_appointment_check" CHECK (("state" = 'confirmed') = ("appointment_id" IS NOT NULL))
);

CREATE INDEX "public_hold_staff_member_id_starts_idx" ON "booking"."public_hold"("staff_member_id", "starts_at");
CREATE INDEX "public_hold_organization_id_created_idx" ON "booking"."public_hold"("organization_id", "created_at");

ALTER TABLE "booking"."public_hold" ENABLE ROW LEVEL SECURITY;

CREATE POLICY booking_rw_public_hold ON "booking"."public_hold"
  FOR ALL TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

REVOKE ALL ON "booking"."public_hold" FROM PUBLIC;
GRANT SELECT, INSERT ON "booking"."public_hold" TO booking_rw;
GRANT UPDATE ("code_hash", "attempts", "sends", "last_sent_at", "expires_at", "state",
              "appointment_id", "settled_at", "client_name", "client_phone", "client_email",
              "message", "email_hash", "ip_hash")
  ON "booking"."public_hold" TO booking_rw;

-- The internal Booking job (review #164): the businesses with something to clean, across RLS (only
-- the ids; the job then works in each business's own context, as booking_rw). Same pattern as
-- support.auto_close_due.
CREATE OR REPLACE FUNCTION booking.public_hold_cleanup_due(p_limit INTEGER)
RETURNS TABLE (organization_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT DISTINCT h.organization_id
    FROM booking.public_hold h
   WHERE (h.state = 'pending' AND h.expires_at <= now())
      OR ((h.email_hash IS NOT NULL OR h.ip_hash IS NOT NULL)
          AND h.created_at < now() - INTERVAL '24 hours')
   ORDER BY h.organization_id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 500);
$$;

REVOKE ALL ON FUNCTION booking.public_hold_cleanup_due(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION booking.public_hold_cleanup_due(INTEGER) TO booking_rw;
