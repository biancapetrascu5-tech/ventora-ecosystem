-- Lot B.12b (S146, the founder's decision of 12.11.2026): the photos of the answers are deleted
-- 30 days after the booking ("Poza o vede doar salonul și se șterge la 30 de zile după programare").
--
-- The deletion itself is done by the job booking.public-hold-cleanup, through the system deletion of
-- core/files (deleteFileAsSystem, reason photo_retention, an audit row `system` per file), then
-- appointment_answer.photo_deleted_at. Here only:
--   - public_hold_cleanup_due recreated with its previous body (booking_forms) plus the businesses
--     that have a photo of an answer whose booking ended more than 30 days ago (only ids);
--   - a partial index on the photos not yet deleted, for that branch and for the job.
-- No table, no column, no grant change, no new role, no DELETE.

CREATE INDEX "appointment_answer_photo_pending_idx"
    ON "booking"."appointment_answer" ("organization_id", "appointment_id")
    WHERE "photo_file_id" IS NOT NULL AND "photo_deleted_at" IS NULL;

-- The same function as in booking_forms plus the branch of the photos older than 30 days after the
-- booking; CREATE OR REPLACE keeps its grant (EXECUTE only booking_rw).
CREATE OR REPLACE FUNCTION booking.public_hold_cleanup_due(p_limit INTEGER)
RETURNS TABLE (organization_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT q.organization_id FROM (
    SELECT h.organization_id
      FROM booking.public_hold h
     WHERE (h.state = 'pending' AND h.expires_at <= now())
        OR ((h.email_hash IS NOT NULL OR h.ip_hash IS NOT NULL)
            AND h.created_at < now() - INTERVAL '24 hours')
        OR (h.has_photos AND h.state <> 'pending')
    UNION
    -- the photos of erased clients still marked (the storage refused them at the erasure)
    SELECT q.organization_id
      FROM booking.appointment_answer q
     WHERE q.wiped_at IS NOT NULL AND q.photo_file_id IS NOT NULL AND q.photo_deleted_at IS NULL
    UNION
    -- S146: the photos of the answers, 30 days after the booking
    SELECT q.organization_id
      FROM booking.appointment_answer q
      JOIN booking.appointment a
        ON a.organization_id = q.organization_id AND a.id = q.appointment_id
     WHERE q.photo_file_id IS NOT NULL AND q.photo_deleted_at IS NULL
       AND a.ends_at < now() - INTERVAL '30 days'
    UNION
    SELECT t.organization_id
      FROM booking.manage_token t
      JOIN booking.appointment a
        ON a.organization_id = t.organization_id AND a.id = t.appointment_id
     WHERE t.revoked_at IS NULL AND a.ends_at < now() - INTERVAL '30 days'
  ) q
   ORDER BY q.organization_id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 500);
$$;
