-- Lot 2.9b (S112, HubBusinessSuspended): Hub-ul arată și afacerile suspendate, marcate „Acces
-- oprit”, fără să le poată deschide (authorize / resolveOrgContext refuză în continuare, D3-20 a).
-- Aditivă: o funcție nouă; list_my_memberships_v2 rămâne neschimbată (o folosește codul vechi
-- până la deploy).
--
--   list_my_memberships_v3 → ca v2, plus afacerile suspendate și coloana organization_status
--
-- Același tipar: SECURITY DEFINER, search_path fix, app.user_id din sesiune (S1), REVOKE FROM
-- PUBLIC, GRANT EXECUTE doar lui org_rw.

CREATE OR REPLACE FUNCTION organizations.list_my_memberships_v3()
RETURNS TABLE (
  organization_id     UUID,
  organization_name   VARCHAR(255),
  organization_slug   VARCHAR(63),
  role                "organizations"."MembershipRole",
  status              "organizations"."MembershipStatus",
  last_opened_at      TIMESTAMPTZ,
  organization_status "organizations"."OrganizationStatus"
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = organizations, pg_catalog
AS $$
  SELECT o.id, o.name, o.slug, m.role, m.status, m.last_opened_at, o.status
    FROM "organizations"."membership" m
    JOIN "organizations"."organization" o ON o.id = m.organization_id
   WHERE m.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
     AND m.status = 'active'
   ORDER BY m.last_opened_at DESC NULLS LAST, o.name;
$$;

REVOKE ALL ON FUNCTION organizations.list_my_memberships_v3() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION organizations.list_my_memberships_v3() TO org_rw;
