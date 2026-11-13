-- Lot B.13 — the confirmation and the reminder by e-mail, in the client's language (BOOKING.md
-- B.13; design BookingClientEmails, S116). The predefined automations of EasyBook (D-WF-6): the
-- confirmation always goes (PROPUS: it cannot be turned off, as in the design's DE DECIS), the
-- reminder 24 hours before can be turned off in Setări (settings.reminder_email).
--
-- booking.client_message is the module's own queue (decision of the founder, 12.11: the delivery of
-- core/notifications reaches only users of the platform, not the clients of a business). One row
-- per e-mail, unique on (organization_id, dedupe_key): the confirmation of an appointment and its
-- reminder for a given start exist once, however many times the job runs (T6). The row keeps no
-- personal data: the address and the language are read from the client when the e-mail is sent
-- (an erased client gets nothing). valid_until: an e-mail past it, or for an appointment cancelled
-- or moved since, is never sent.
--
-- booking.client_messages_due: the businesses with an e-mail to schedule or to send (only ids,
-- across RLS), as the other jobs of Booking. RLS (USING + WITH CHECK), grants on columns, no DELETE.

-- ── the reminder on / off ───────────────────────────────────────────────────────────────────
ALTER TABLE "booking"."settings" ADD COLUMN "reminder_email" BOOLEAN NOT NULL DEFAULT true;
GRANT UPDATE ("reminder_email") ON "booking"."settings" TO booking_rw;

-- ── the queue ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE "booking"."client_message" (
  "id"              UUID         NOT NULL,
  "organization_id" UUID         NOT NULL,
  "appointment_id"  UUID         NOT NULL,
  -- 'confirmation' | 'reminder' (B.14 adds the others)
  "kind"            VARCHAR(20)  NOT NULL,
  -- confirmation:<appointment> / reminder:<appointment>:<start, epoch seconds>
  "dedupe_key"      VARCHAR(120) NOT NULL,
  "send_after"      TIMESTAMPTZ  NOT NULL,
  "valid_until"     TIMESTAMPTZ  NOT NULL,
  -- pending → sending → sent; or cancelled (no longer valid) / failed (3 attempts)
  "state"           VARCHAR(10)  NOT NULL DEFAULT 'pending',
  "attempts"        SMALLINT     NOT NULL DEFAULT 0,
  -- why it was not sent: expired, appointment_changed, no_email, provider_error, not_configured…
  "reason"          VARCHAR(40),
  "sent_at"         TIMESTAMPTZ,
  "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "client_message_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "client_message_appointment_fkey" FOREIGN KEY ("organization_id", "appointment_id")
    REFERENCES "booking"."appointment" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "client_message_kind_check" CHECK ("kind" IN ('confirmation', 'reminder')),
  CONSTRAINT "client_message_state_check" CHECK (
    ("state" IN ('pending', 'sending') AND "sent_at" IS NULL)
    OR ("state" = 'sent' AND "sent_at" IS NOT NULL)
    OR ("state" IN ('cancelled', 'failed') AND "sent_at" IS NULL AND "reason" IS NOT NULL)
  ),
  CONSTRAINT "client_message_attempts_check" CHECK ("attempts" BETWEEN 0 AND 3),
  CONSTRAINT "client_message_valid_check" CHECK ("valid_until" > "send_after")
);

CREATE UNIQUE INDEX "client_message_organization_id_dedupe_key_key"
  ON "booking"."client_message" ("organization_id", "dedupe_key");
CREATE INDEX "client_message_organization_id_state_send_idx"
  ON "booking"."client_message" ("organization_id", "state", "send_after");
CREATE INDEX "client_message_appointment_id_idx" ON "booking"."client_message" ("appointment_id");

ALTER TABLE "booking"."client_message" ENABLE ROW LEVEL SECURITY;
CREATE POLICY booking_rw_client_message ON "booking"."client_message"
  FOR ALL TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

REVOKE ALL ON "booking"."client_message" FROM PUBLIC;
GRANT SELECT, INSERT ON "booking"."client_message" TO booking_rw;
GRANT UPDATE ("state", "attempts", "reason", "send_after", "sent_at", "updated_at")
  ON "booking"."client_message" TO booking_rw;

-- ── the businesses the job works for ────────────────────────────────────────────────────────
-- An e-mail due (pending, its time come), or one to schedule: a confirmation (an appointment
-- confirmed in the last 2 hours, still ahead, the first of its visit or series, its client with an
-- e-mail) or a reminder (confirmed, starting in 1–24 hours, booked more than 24 hours before, the
-- reminder on, the first of its visit) not in the queue yet. Only ids, as the other jobs.
CREATE OR REPLACE FUNCTION booking.client_messages_due(p_limit INTEGER)
RETURNS TABLE (organization_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT DISTINCT d.organization_id
    FROM (
      SELECT m.organization_id
        FROM booking.client_message m
       WHERE m.state = 'pending' AND m.send_after <= now()
      UNION
      SELECT a.organization_id
        FROM booking.appointment a
        JOIN booking.client c ON c.organization_id = a.organization_id AND c.id = a.client_id
       WHERE a.status = 'confirmed' AND c.email IS NOT NULL AND c.erased_at IS NULL
         AND a.starts_at > now()
         AND COALESCE(a.visit_step, 1) = 1
         AND (
           (a.status_changed_at >= now() - interval '2 hours'
             AND COALESCE(a.series_index, 1) = 1
             AND NOT EXISTS (
               SELECT 1 FROM booking.client_message m
                WHERE m.organization_id = a.organization_id
                  AND m.dedupe_key = 'confirmation:' || a.id::text))
           OR (a.starts_at <= now() + interval '24 hours'
             AND a.starts_at > now() + interval '1 hour'
             AND a.created_at < a.starts_at - interval '24 hours'
             AND COALESCE((SELECT s.reminder_email FROM booking.settings s
                            WHERE s.organization_id = a.organization_id), true)
             AND NOT EXISTS (
               SELECT 1 FROM booking.client_message m
                WHERE m.organization_id = a.organization_id
                  AND m.dedupe_key = 'reminder:' || a.id::text || ':'
                                     || extract(epoch FROM a.starts_at)::bigint::text))
         )
    ) d
   ORDER BY d.organization_id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 500);
$$;

REVOKE ALL ON FUNCTION booking.client_messages_due(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION booking.client_messages_due(INTEGER) TO booking_rw;
