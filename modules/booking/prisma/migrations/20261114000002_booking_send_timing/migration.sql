-- Lot B.14c — when the e-mails to clients leave (BOOKING.md B.14; design BookingMessageTemplates,
-- S127, „Când pleacă”). Decisions of the founder (13.11):
--   * the reminder: N hours before, N between 2 and 72, 24 by default (as before). It goes only for an
--     appointment booked more than N hours before it, and never in its last hour (as B.13);
--   * the thanks: right at the end of the visit ('now'), N hours after it ('after', N between 1 and
--     48, 2 by default, as before) or the next day at 10:00 in the business's zone ('next_day');
--   * the confirmation, the change and the cancellation leave at once (fixed);
--   * „Trimite reamintire” by hand (list, detail): rows written by the contract, at most one per
--     appointment and day (the dedupe key), even with the automatic reminder off. No SQL here: the
--     queue takes them as any pending row.
--
-- The thanks now enters the queue as soon as the appointment is completed, with send_after = its
-- time (computed by the job in the business's zone) and valid_until = 24 hours later; before, it
-- was written 2 hours after the end. A thanks whose time passed more than 24 hours ago is written
-- and then dropped as expired (one row, so the business is not looked at again). A change of the
-- setting applies to the visits completed after it.

-- ── the settings ────────────────────────────────────────────────────────────────────────────
ALTER TABLE "booking"."settings"
  ADD COLUMN "reminder_hours" SMALLINT NOT NULL DEFAULT 24,
  ADD COLUMN "thanks_when"    VARCHAR(8) NOT NULL DEFAULT 'after',
  ADD COLUMN "thanks_hours"   SMALLINT NOT NULL DEFAULT 2;
ALTER TABLE "booking"."settings"
  ADD CONSTRAINT "settings_reminder_hours_check" CHECK ("reminder_hours" BETWEEN 2 AND 72),
  ADD CONSTRAINT "settings_thanks_when_check" CHECK ("thanks_when" IN ('now', 'after', 'next_day')),
  ADD CONSTRAINT "settings_thanks_hours_check" CHECK ("thanks_hours" BETWEEN 1 AND 48);
GRANT UPDATE ("reminder_hours", "thanks_when", "thanks_hours") ON "booking"."settings" TO booking_rw;

-- ── the businesses the job works for (B.14 with the hours of each business) ─────────────────
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
      -- B.13: the confirmation; the reminder N hours before (B.14c)
      SELECT a.organization_id
        FROM booking.appointment a
        JOIN booking.client c ON c.organization_id = a.organization_id AND c.id = a.client_id
        CROSS JOIN LATERAL (
          SELECT COALESCE((SELECT s.reminder_hours FROM booking.settings s
                            WHERE s.organization_id = a.organization_id), 24) AS hours) r
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
           OR (a.starts_at <= now() + make_interval(hours => r.hours)
             AND a.starts_at > now() + interval '1 hour'
             AND a.created_at < a.starts_at - make_interval(hours => r.hours)
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
       WHERE h.kind = 'moved'
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
      -- B.14: the thanks after the visit, queued once completed with its own time (B.14c)
      SELECT a.organization_id
        FROM booking.appointment a
        JOIN booking.client c ON c.organization_id = a.organization_id AND c.id = a.client_id
       WHERE a.status = 'completed' AND c.email IS NOT NULL AND c.erased_at IS NULL
         AND a.ends_at > now() - interval '72 hours'
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
