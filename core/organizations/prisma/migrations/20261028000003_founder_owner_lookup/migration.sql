-- Lot 2.5c — M3: ce poate citi și scrie Founder în organizations, fără drepturi pe tabele.
-- Același tipar ca founder_create_organization: SECURITY DEFINER, search_path fix,
-- REVOKE FROM PUBLIC, GRANT EXECUTE doar lui founder_runtime.
--
--   founder_get_owner_membership            → recuperarea owner-ului (§4.4): doar owner activ
--   founder_list_organization_owners        → sesiunea de suport: numele afacerii + owner-ii (e-mail)
--   founder_set_owner_invitation_email_status → 2.5b §5.3: email_status pentru invitația owner-ului
--                                              creată din Founder

CREATE OR REPLACE FUNCTION organizations.founder_get_owner_membership(p_org UUID, p_user UUID)
RETURNS TABLE (
  membership_id     UUID,
  organization_name VARCHAR(255)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = organizations, pg_catalog
AS $$
  SELECT m.id, o.name
    FROM "organizations"."membership" m
    JOIN "organizations"."organization" o ON o.id = m.organization_id
   WHERE m.organization_id = p_org
     AND m.user_id = p_user
     AND m.role = 'owner'
     AND m.status = 'active';
$$;

-- Un rând per owner activ; o organizație fără owner (invitația încă neacceptată) întoarce un
-- singur rând cu user_id NULL. Organizație inexistentă → 0 rânduri.
CREATE OR REPLACE FUNCTION organizations.founder_list_organization_owners(p_org UUID)
RETURNS TABLE (
  organization_name VARCHAR(255),
  user_id           UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = organizations, pg_catalog
AS $$
  SELECT o.name, m.user_id
    FROM "organizations"."organization" o
    LEFT JOIN "organizations"."membership" m
      ON m.organization_id = o.id AND m.role = 'owner' AND m.status = 'active'
   WHERE o.id = p_org
   ORDER BY m.created_at;
$$;

-- Doar invitația de owner scrisă de founder_create_organization
-- (invited_by_user_id = organization.created_by_founder_id). Întoarce true dacă a schimbat un rând.
CREATE OR REPLACE FUNCTION organizations.founder_set_owner_invitation_email_status(
  p_invitation UUID,
  p_status     TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = organizations, pg_catalog
AS $$
  WITH updated AS (
    UPDATE "organizations"."invitation" i
       SET email_status = p_status::"organizations"."InvitationEmailStatus",
           updated_at = NOW()
      FROM "organizations"."organization" o
     WHERE i.id = p_invitation
       AND o.id = i.organization_id
       AND i.role = 'owner'
       AND o.created_by_founder_id IS NOT NULL
       AND i.invited_by_user_id = o.created_by_founder_id
    RETURNING i.id
  )
  SELECT EXISTS (SELECT 1 FROM updated);
$$;

REVOKE ALL ON FUNCTION organizations.founder_get_owner_membership(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION organizations.founder_list_organization_owners(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION organizations.founder_set_owner_invitation_email_status(UUID, TEXT) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION organizations.founder_get_owner_membership(UUID, UUID) TO founder_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION organizations.founder_list_organization_owners(UUID) TO founder_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION organizations.founder_set_owner_invitation_email_status(UUID, TEXT) TO founder_runtime';
  END IF;
END $$;
