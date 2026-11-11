-- Decision of 11.11.2026: a contact 30 days in the bin is anonymised (as booking.erase_client), never
-- deleted physically, no DELETE grant. The job finds the due contacts of every business through
-- crm.bin_expired_contacts (SECURITY DEFINER: it only lists ids), then anonymises each one in its
-- own business's context, as crm_rw (RLS):
--   the contact → name „—”, phones, e-mails, birthday, address, note, own fields, tags emptied;
--   its notes and comments → the text „—”, no mentions; its activities → the title „—”, no note,
--   no outcome; the leads converted into it → name „—”, phone, e-mail, request, referrer emptied.
-- An EasyBook contact is never in the bin (CHECK), its erasure comes from EasyBook (CR.12).

ALTER TABLE "crm"."contact" ADD COLUMN "anonymized_at" TIMESTAMPTZ;
ALTER TABLE "crm"."contact"
  ADD CONSTRAINT "contact_anonymized_check" CHECK ("anonymized_at" IS NULL OR "deleted_at" IS NOT NULL);

-- the due contacts of every business (ids only), oldest first, at most 100 per call
CREATE OR REPLACE FUNCTION crm.bin_expired_contacts(p_limit INTEGER)
RETURNS TABLE (id UUID, organization_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT c.id, c.organization_id
    FROM crm.contact c
   WHERE c.deleted_at IS NOT NULL
     AND c.deleted_at < now() - INTERVAL '30 days'
     AND c.anonymized_at IS NULL
   ORDER BY c.deleted_at, c.id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 100);
$$;

REVOKE ALL ON FUNCTION crm.bin_expired_contacts(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.bin_expired_contacts(INTEGER) TO crm_rw;

-- Grants: only crm_rw
GRANT UPDATE ("anonymized_at", "custom_values") ON "crm"."contact" TO crm_rw;
