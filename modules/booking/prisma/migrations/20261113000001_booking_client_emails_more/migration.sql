-- Lot B.14 — the cancellation, the change and the thanks by e-mail (BOOKING.md B.14; design
-- BookingClientEmails S116, BookingMessageTemplates S127). The same queue and rules as B.13.
-- Decisions of the founder (13.11): the confirmation, the cancellation and the change always go
-- (they cannot be turned off); the thanks after the visit can be turned off in Setări
-- (settings.thanks_email, on by default as in the design); the cancellation and the change are not
-- counted, the thanks is counted in messaging.email as scheduled. The editor of the texts is B.14b.
--
-- New kinds, one row each (the unique dedupe key):
--   cancellation:<appointment>  a confirmed appointment cancelled in the last 2 hours, still ahead;
--                               of a series cancelled at once, only the first (one e-mail)
--   change:<history row>        a move by the business (not by the client on their page) in the
--                               last 2 hours, of a confirmed appointment still ahead; of a series
--                               moved at once, only the first; only the latest move of the appointment
--   thanks:<appointment>        a completed appointment (of a visit: its last step), 2 hours after
--                               its end (at most 24 hours late)

-- ── the thanks on / off ─────────────────────────────────────────────────────────────────────
ALTER TABLE "booking"."settings" ADD COLUMN "thanks_email" BOOLEAN NOT NULL DEFAULT true;
GRANT UPDATE ("thanks_email") ON "booking"."settings" TO booking_rw;

-- ── the new kinds ───────────────────────────────────────────────────────────────────────────
ALTER TABLE "booking"."client_message" DROP CONSTRAINT "client_message_kind_check";
ALTER TABLE "booking"."client_message" ADD CONSTRAINT "client_message_kind_check"
  CHECK ("kind" IN ('confirmation', 'reminder', 'cancellation', 'change', 'thanks'));

-- ── the businesses the job works for (B.13 + the new kinds) ─────────────────────────────────
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
      -- B.13: the confirmation and the reminder
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
      UNION
      -- B.14: the cancellation
      SELECT a.organization_id
        FROM booking.appointment a
        JOIN booking.client c ON c.organization_id = a.organization_id AND c.id = a.client_id
       WHERE a.status = 'cancelled' AND c.email IS NOT NULL AND c.erased_at IS NULL
         AND a.cancelled_at >= now() - interval '2 hours'
         AND a.starts_at > now()
         AND COALESCE(a.visit_step, 1) = 1
         AND EXISTS (
           SELECT 1 FROM booking.appointment_history h
            WHERE h.organization_id = a.organization_id AND h.appointment_id = a.id
              AND h.kind = 'status' AND h.from_status = 'confirmed' AND h.to_status = 'cancelled')
         AND NOT EXISTS (
           SELECT 1 FROM booking.appointment b
            WHERE b.organization_id = a.organization_id AND b.series_id = a.series_id
              AND b.status = 'cancelled' AND b.cancelled_at = a.cancelled_at
              AND b.starts_at < a.starts_at)
         AND NOT EXISTS (
           SELECT 1 FROM booking.client_message m
            WHERE m.organization_id = a.organization_id
              AND m.dedupe_key = 'cancellation:' || a.id::text)
      UNION
      -- B.14: the change
      SELECT a.organization_id
        FROM booking.appointment_history h
        JOIN booking.appointment a ON a.organization_id = h.organization_id AND a.id = h.appointment_id
        JOIN booking.client c ON c.organization_id = a.organization_id AND c.id = a.client_id
       WHERE h.kind = 'moved' AND h.actor_type <> 'client'
         AND h.created_at >= now() - interval '2 hours'
         AND a.status = 'confirmed' AND c.email IS NOT NULL AND c.erased_at IS NULL
         AND a.starts_at > now()
         AND COALESCE(a.visit_step, 1) = 1
         AND NOT EXISTS (
           SELECT 1 FROM booking.appointment_history l
            WHERE l.organization_id = h.organization_id AND l.appointment_id = h.appointment_id
              AND l.kind = 'moved' AND l.id > h.id)
         AND NOT EXISTS (
           SELECT 1 FROM booking.appointment_history h2
             JOIN booking.appointment b ON b.organization_id = h2.organization_id AND b.id = h2.appointment_id
            WHERE h2.organization_id = h.organization_id AND h2.kind = 'moved'
              AND h2.created_at = h.created_at AND b.series_id = a.series_id
              AND b.starts_at < a.starts_at)
         AND NOT EXISTS (
           SELECT 1 FROM booking.client_message m
            WHERE m.organization_id = a.organization_id
              AND m.dedupe_key = 'change:' || h.id::text)
      UNION
      -- B.14: the thanks after the visit
      SELECT a.organization_id
        FROM booking.appointment a
        JOIN booking.client c ON c.organization_id = a.organization_id AND c.id = a.client_id
       WHERE a.status = 'completed' AND c.email IS NOT NULL AND c.erased_at IS NULL
         AND a.ends_at <= now() - interval '2 hours'
         AND a.ends_at > now() - interval '26 hours'
         AND COALESCE(a.visit_step, 1) = COALESCE(a.visit_steps, 1)
         AND COALESCE((SELECT s.thanks_email FROM booking.settings s
                        WHERE s.organization_id = a.organization_id), true)
         AND NOT EXISTS (
           SELECT 1 FROM booking.client_message m
            WHERE m.organization_id = a.organization_id
              AND m.dedupe_key = 'thanks:' || a.id::text)
    ) d
   ORDER BY d.organization_id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 500);
$$;

REVOKE ALL ON FUNCTION booking.client_messages_due(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION booking.client_messages_due(INTEGER) TO booking_rw;
