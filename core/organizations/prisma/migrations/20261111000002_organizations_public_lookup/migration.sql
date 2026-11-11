-- Lot B.11a (BOOKING.md; D-B-5 = a): the public booking page app.ventora-hub.com/r/<slug> finds
-- the business by its slug, without a session. RLS on organization needs app.organization_id, which
-- the public page does not have yet, so one SECURITY DEFINER function returns only what the page
-- needs: the id, the name and the time zone of an ACTIVE business (a suspended one is not found),
-- and the user id of its active owner. The owner id never leaves the server: core/access answers
-- „may member X take appointments” only for a caller who is a member of the business, so the
-- public context of Booking asks as the owner (Booking writes nothing with it: the public writes
-- carry no user id).
--
-- Additive: one function. GRANT EXECUTE only to org_rw (the contract runs as org_rw). No table, no
-- column, no new role.

CREATE OR REPLACE FUNCTION organizations.find_public_organization(p_slug TEXT)
RETURNS TABLE (id UUID, name VARCHAR, time_zone VARCHAR, owner_user_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT o.id, o.name, o.time_zone,
         (SELECT m.user_id FROM organizations.membership m
           WHERE m.organization_id = o.id AND m.role = 'owner' AND m.status = 'active'
           ORDER BY m.created_at LIMIT 1)
    FROM organizations.organization o
   WHERE o.slug = lower(p_slug)
     AND o.status = 'active'
$$;

REVOKE ALL ON FUNCTION organizations.find_public_organization(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION organizations.find_public_organization(TEXT) TO org_rw;
