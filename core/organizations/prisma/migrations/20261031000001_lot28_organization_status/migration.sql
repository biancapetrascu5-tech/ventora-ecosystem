-- Lot 2.8 — starea afacerii (D3-20, varianta a, 30.10.2026): o afacere suspendată nu mai are
-- intrare pentru nimeni din ea (authorize refuză orice cerere, inclusiv citirea); datele rămân,
-- iar Founder o poate reactiva. Sesiunea de suport rămâne posibilă (authorizeSupport nu citește
-- starea). Aditivă: o coloană cu valoare implicită, două coloane care pot fi NULL și funcții noi.
--
--   organization.status / suspended_at / suspended_by_founder_id
--   list_my_memberships_v2               → doar afacerile active (Hub-ul nu mai oferă una suspendată)
--   founder_list_organizations           → FounderBusinesses: afacerile, owner-ul activ sau invitația lui
--   founder_set_organization_status      → suspendarea și reactivarea, din Founder
--
-- Același tipar ca M3 (20261028000003): SECURITY DEFINER, search_path fix, REVOKE FROM PUBLIC,
-- GRANT EXECUTE doar lui founder_runtime.

CREATE TYPE "organizations"."OrganizationStatus" AS ENUM ('active', 'suspended');

ALTER TABLE "organizations"."organization"
  ADD COLUMN "status" "organizations"."OrganizationStatus" NOT NULL DEFAULT 'active',
  ADD COLUMN "suspended_at" TIMESTAMPTZ,
  ADD COLUMN "suspended_by_founder_id" UUID;

-- Aceeași formă ca în 20261029000005; doar filtrul pe starea afacerii e nou.
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
     AND o.status = 'active'
   ORDER BY m.last_opened_at DESC NULLS LAST, o.name;
$$;

-- Un rând per afacere: primul owner activ (după vechime) sau, dacă nu există încă, invitația de
-- owner cea mai nouă (adresa și starea ei, ca „pending”/„expired” calculat), plus câți oameni
-- activi are afacerea (dialogul de suspendare: „Cei 8 oameni ai afacerii…”).
CREATE OR REPLACE FUNCTION organizations.founder_list_organizations()
RETURNS TABLE (
  organization_id        UUID,
  organization_name      VARCHAR(255),
  organization_slug      VARCHAR(63),
  status                 "organizations"."OrganizationStatus",
  created_at             TIMESTAMPTZ,
  suspended_at           TIMESTAMPTZ,
  owner_user_id          UUID,
  owner_invitation_email VARCHAR(255),
  owner_invitation_state TEXT,
  member_count           INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = organizations, pg_catalog
AS $$
  SELECT o.id, o.name, o.slug, o.status, o.created_at, o.suspended_at,
         ow.user_id,
         CASE WHEN ow.user_id IS NULL THEN inv.email END,
         CASE
           WHEN ow.user_id IS NOT NULL OR inv.id IS NULL THEN NULL
           WHEN inv.status = 'pending' AND inv.expires_at < now() THEN 'expired'
           ELSE inv.status::text
         END,
         (SELECT count(*)::int FROM "organizations"."membership" mc
           WHERE mc.organization_id = o.id AND mc.status = 'active')
    FROM "organizations"."organization" o
    LEFT JOIN LATERAL (
      SELECT m.user_id
        FROM "organizations"."membership" m
       WHERE m.organization_id = o.id AND m.role = 'owner' AND m.status = 'active'
       ORDER BY m.created_at
       LIMIT 1
    ) ow ON TRUE
    LEFT JOIN LATERAL (
      SELECT i.id, i.email, i.status, i.expires_at
        FROM "organizations"."invitation" i
       WHERE i.organization_id = o.id AND i.role = 'owner'
       ORDER BY i.created_at DESC
       LIMIT 1
    ) inv ON TRUE
   ORDER BY o.name, o.id;
$$;

-- Schimbă starea; întoarce numele afacerii și starea de dinainte (0 rânduri: afacere inexistentă).
-- Aceeași stare de două ori nu schimbă nimic (previous_status = noua stare).
CREATE OR REPLACE FUNCTION organizations.founder_set_organization_status(
  p_org     UUID,
  p_status  TEXT,
  p_founder UUID
)
RETURNS TABLE (
  organization_name VARCHAR(255),
  previous_status   "organizations"."OrganizationStatus"
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = organizations, pg_catalog
AS $$
  WITH before AS (
    SELECT o.id, o.name, o.status
      FROM "organizations"."organization" o
     WHERE o.id = p_org
       FOR UPDATE
  ), updated AS (
    UPDATE "organizations"."organization" o
       SET status = p_status::"organizations"."OrganizationStatus",
           suspended_at = CASE WHEN p_status = 'suspended' THEN now() END,
           suspended_by_founder_id = CASE WHEN p_status = 'suspended' THEN p_founder END,
           updated_at = now()
      FROM before b
     WHERE o.id = b.id AND b.status <> p_status::"organizations"."OrganizationStatus"
    RETURNING o.id
  )
  SELECT b.name, b.status FROM before b;
$$;

REVOKE ALL ON FUNCTION organizations.founder_list_organizations() FROM PUBLIC;
REVOKE ALL ON FUNCTION organizations.founder_set_organization_status(UUID, TEXT, UUID) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION organizations.founder_list_organizations() TO founder_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION organizations.founder_set_organization_status(UUID, TEXT, UUID) TO founder_runtime';
  END IF;
END $$;
