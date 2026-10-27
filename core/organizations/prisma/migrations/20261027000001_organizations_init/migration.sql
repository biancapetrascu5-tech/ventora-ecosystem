-- Migration: organizations_init
-- Creates organizations schema, roles, tables, RLS policies, and SECURITY DEFINER functions.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'org_rw') THEN
    CREATE ROLE org_rw NOLOGIN NOINHERIT;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    EXECUTE 'GRANT org_rw TO app_runtime';
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS organizations;

CREATE TYPE organizations.membership_role AS ENUM (
  'owner', 'admin', 'member', 'external_collaborator'
);

CREATE TYPE organizations.membership_status AS ENUM (
  'active', 'suspended'
);

CREATE TYPE organizations.invitation_status AS ENUM (
  'pending', 'accepted', 'expired', 'revoked'
);

CREATE TYPE organizations.invitation_email_status AS ENUM (
  'pending', 'sent', 'failed'
);

CREATE TYPE organizations.created_via AS ENUM (
  'founder', 'self_service', 'import'
);

CREATE TABLE organizations.organization (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  VARCHAR(63) NOT NULL UNIQUE,
  name                  VARCHAR(255) NOT NULL,
  created_via           organizations.created_via NOT NULL,
  created_by_founder_id UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE organizations.organization_setting (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations.organization(id) ON DELETE CASCADE,
  key             VARCHAR(128) NOT NULL,
  value           TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, key)
);

CREATE TABLE organizations.membership (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations.organization(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,
  role            organizations.membership_role NOT NULL,
  status          organizations.membership_status NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

CREATE TABLE organizations.application_access (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations.organization(id) ON DELETE CASCADE,
  application_id  VARCHAR(64) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, application_id)
);

CREATE TABLE organizations.invitation (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations.organization(id) ON DELETE CASCADE,
  organization_name   VARCHAR(255) NOT NULL,
  invited_by_user_id  UUID NOT NULL,
  invited_by_name     VARCHAR(255) NOT NULL,
  email               VARCHAR(255) NOT NULL,
  role                organizations.membership_role NOT NULL,
  token_hash          VARCHAR(64) NOT NULL UNIQUE,
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  status              organizations.invitation_status NOT NULL DEFAULT 'pending',
  email_status        organizations.invitation_email_status NOT NULL DEFAULT 'pending',
  accepted_by_user_id UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON organizations.membership(user_id);
CREATE INDEX ON organizations.invitation(email);
CREATE INDEX ON organizations.invitation(organization_id, status);

ALTER TABLE organizations.organization ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations.organization_setting ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations.membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations.application_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations.invitation ENABLE ROW LEVEL SECURITY;

-- RLS policies: all reads/writes scoped to app.organization_id (set LOCAL per transaction)
CREATE POLICY org_rw_organization ON organizations.organization
  TO org_rw
  USING (id = current_setting('app.organization_id', true)::uuid)
  WITH CHECK (id = current_setting('app.organization_id', true)::uuid);

CREATE POLICY org_rw_organization_setting ON organizations.organization_setting
  TO org_rw
  USING (organization_id = current_setting('app.organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.organization_id', true)::uuid);

CREATE POLICY org_rw_membership ON organizations.membership
  TO org_rw
  USING (organization_id = current_setting('app.organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.organization_id', true)::uuid);

CREATE POLICY org_rw_application_access ON organizations.application_access
  TO org_rw
  USING (organization_id = current_setting('app.organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.organization_id', true)::uuid);

CREATE POLICY org_rw_invitation ON organizations.invitation
  TO org_rw
  USING (organization_id = current_setting('app.organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.organization_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON organizations.organization TO org_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON organizations.organization_setting TO org_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON organizations.membership TO org_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON organizations.application_access TO org_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON organizations.invitation TO org_rw;

-- SECURITY DEFINER functions
-- Owner = postgres (migration role). LANGUAGE sql. Fixed search_path. REVOKE then GRANT.

CREATE OR REPLACE FUNCTION organizations.list_my_memberships(p_user_id UUID)
RETURNS TABLE (
  organization_id   UUID,
  organization_name VARCHAR(255),
  organization_slug VARCHAR(63),
  role              organizations.membership_role,
  status            organizations.membership_status
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = organizations, pg_catalog
AS $$
  SELECT
    o.id,
    o.name,
    o.slug,
    m.role,
    m.status
  FROM organizations.membership m
  JOIN organizations.organization o ON o.id = m.organization_id
  WHERE m.user_id = p_user_id
    AND m.status = 'active'
  ORDER BY o.name;
$$;

REVOKE ALL ON FUNCTION organizations.list_my_memberships(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION organizations.list_my_memberships(UUID) TO org_rw;

-- Returns pending OR expired invitations (expired shown in "invitation expired" screen)
CREATE OR REPLACE FUNCTION organizations.find_invitation_by_token_hash(p_token_hash TEXT)
RETURNS TABLE (
  id                  UUID,
  organization_id     UUID,
  organization_name   VARCHAR(255),
  invited_by_name     VARCHAR(255),
  email               VARCHAR(255),
  role                organizations.membership_role,
  expires_at          TIMESTAMPTZ,
  status              organizations.invitation_status
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = organizations, pg_catalog
AS $$
  SELECT
    i.id,
    i.organization_id,
    i.organization_name,
    i.invited_by_name,
    i.email,
    i.role,
    i.expires_at,
    i.status
  FROM organizations.invitation i
  WHERE i.token_hash = p_token_hash
    AND i.status IN ('pending', 'expired');
$$;

REVOKE ALL ON FUNCTION organizations.find_invitation_by_token_hash(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION organizations.find_invitation_by_token_hash(TEXT) TO org_rw;

-- Atomic org + owner-invitation creation. Only founder_runtime can call.
CREATE OR REPLACE FUNCTION organizations.founder_create_organization(
  p_name                  TEXT,
  p_slug                  TEXT,
  p_owner_email           TEXT,
  p_invitation_token_hash TEXT,
  p_created_by_founder_id UUID
)
RETURNS TABLE (
  organization_id UUID,
  invitation_id   UUID
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = organizations, pg_catalog
AS $$
  WITH new_org AS (
    INSERT INTO organizations.organization (name, slug, created_via, created_by_founder_id)
    VALUES (p_name, p_slug, 'founder', p_created_by_founder_id)
    RETURNING id, name
  ),
  new_inv AS (
    INSERT INTO organizations.invitation (
      organization_id, organization_name, invited_by_user_id, invited_by_name,
      email, role, token_hash, expires_at
    )
    VALUES (
      (SELECT id FROM new_org),
      (SELECT name FROM new_org),
      p_created_by_founder_id,
      'Founder',
      p_owner_email,
      'owner',
      p_invitation_token_hash,
      NOW() + INTERVAL '30 days'
    )
    RETURNING id
  )
  SELECT (SELECT id FROM new_org), (SELECT id FROM new_inv);
$$;

REVOKE ALL ON FUNCTION organizations.founder_create_organization(TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION organizations.founder_create_organization(TEXT, TEXT, TEXT, TEXT, UUID) TO founder_runtime';
  END IF;
END $$;
