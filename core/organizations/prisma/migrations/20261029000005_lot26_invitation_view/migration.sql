-- Lot 2.6 · E (invitația) și F (alegerea afacerii). Doar aditivă: două coloane care pot fi NULL
-- și trei funcții noi; nimic existent nu se schimbă.
--
--   invitation.new_link_requested_at   → „Cere o invitație nouă” din invitația expirată (E)
--   membership.last_opened_at          → „deschisă …” în HubChooseBusiness (F)
--   find_invitation_view_by_token_hash → ecranul /invite/[token]: orice stare (E)
--   request_new_invitation_link        → marchează cererea pe invitația expirată (E)
--   list_my_memberships_v2             → ca list_my_memberships, plus last_opened_at (F)

ALTER TABLE "organizations"."invitation" ADD COLUMN "new_link_requested_at" TIMESTAMPTZ;
ALTER TABLE "organizations"."membership" ADD COLUMN "last_opened_at" TIMESTAMPTZ;

-- Ecranul invitației arată și invitațiile folosite sau anulate (HubStates), deci întoarce orice
-- stare; find_invitation_by_token_hash (acceptarea) rămâne cum e.
CREATE OR REPLACE FUNCTION organizations.find_invitation_view_by_token_hash(p_token_hash TEXT)
RETURNS TABLE (
  id                UUID,
  organization_id   UUID,
  organization_name VARCHAR(255),
  invited_by_name   VARCHAR(255),
  email             VARCHAR(255),
  role              "organizations"."MembershipRole",
  expires_at        TIMESTAMPTZ,
  status            "organizations"."InvitationStatus",
  application_ids   VARCHAR(64)[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = organizations, pg_catalog
AS $$
  SELECT i.id, i.organization_id, i.organization_name, i.invited_by_name, i.email, i.role,
         i.expires_at, i.status, i.application_ids
    FROM "organizations"."invitation" i
   WHERE i.token_hash = p_token_hash;
$$;

REVOKE ALL ON FUNCTION organizations.find_invitation_view_by_token_hash(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION organizations.find_invitation_view_by_token_hash(TEXT) TO org_rw;

-- Doar o invitație expirată (status sau termen) primește cererea; întoarce cine a invitat.
CREATE OR REPLACE FUNCTION organizations.request_new_invitation_link(p_token_hash TEXT)
RETURNS TABLE (
  id                 UUID,
  organization_id    UUID,
  invited_by_user_id UUID
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = organizations, pg_catalog
AS $$
  UPDATE "organizations"."invitation" i
     SET new_link_requested_at = now(), updated_at = now()
   WHERE i.token_hash = p_token_hash
     AND (i.status = 'expired' OR (i.status = 'pending' AND i.expires_at < now()))
  RETURNING i.id, i.organization_id, i.invited_by_user_id;
$$;

REVOKE ALL ON FUNCTION organizations.request_new_invitation_link(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION organizations.request_new_invitation_link(TEXT) TO org_rw;

CREATE OR REPLACE FUNCTION organizations.list_my_memberships_v2()
RETURNS TABLE (
  organization_id   UUID,
  organization_name VARCHAR(255),
  organization_slug VARCHAR(63),
  role              "organizations"."MembershipRole",
  status            "organizations"."MembershipStatus",
  last_opened_at    TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = organizations, pg_catalog
AS $$
  SELECT o.id, o.name, o.slug, m.role, m.status, m.last_opened_at
    FROM "organizations"."membership" m
    JOIN "organizations"."organization" o ON o.id = m.organization_id
   WHERE m.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
     AND m.status = 'active'
   ORDER BY m.last_opened_at DESC NULLS LAST, o.name;
$$;

REVOKE ALL ON FUNCTION organizations.list_my_memberships_v2() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION organizations.list_my_memberships_v2() TO org_rw;
