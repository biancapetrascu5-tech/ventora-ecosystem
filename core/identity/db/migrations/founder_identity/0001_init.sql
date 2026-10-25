-- ============================================================
-- FOUNDER_IDENTITY SCHEMA — migration 0001
-- Run only after explicit approval. DO NOT execute automatically.
-- ============================================================

-- Roles (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_identity_rw') THEN
    CREATE ROLE founder_identity_rw NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    CREATE ROLE founder_runtime NOLOGIN;
  END IF;
END $$;

GRANT ROLE founder_identity_rw TO founder_runtime;
-- founder_runtime is separate from app_runtime: NO cross-schema access possible.

-- Schema
CREATE SCHEMA IF NOT EXISTS founder_identity;
GRANT USAGE ON SCHEMA founder_identity TO founder_identity_rw;

-- Tables
CREATE TABLE IF NOT EXISTS founder_identity.users (
  id                    TEXT        PRIMARY KEY,
  name                  TEXT        NOT NULL,
  email                 TEXT        NOT NULL UNIQUE,
  email_verified        BOOLEAN     NOT NULL DEFAULT false,
  image                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at            TIMESTAMPTZ,
  created_by_founder_id TEXT,
  revoked_by_founder_id TEXT
);

CREATE TABLE IF NOT EXISTS founder_identity.sessions (
  id          TEXT        PRIMARY KEY,
  expires_at  TIMESTAMPTZ NOT NULL,
  token       TEXT        NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address  TEXT,
  user_agent  TEXT,
  user_id     TEXT        NOT NULL REFERENCES founder_identity.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS founder_identity.accounts (
  id                       TEXT        PRIMARY KEY,
  account_id               TEXT        NOT NULL,
  provider_id              TEXT        NOT NULL,
  user_id                  TEXT        NOT NULL REFERENCES founder_identity.users(id) ON DELETE CASCADE,
  access_token             TEXT,
  refresh_token            TEXT,
  id_token                 TEXT,
  access_token_expires_at  TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  scope                    TEXT,
  password                 TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS founder_identity.verifications (
  id          TEXT        PRIMARY KEY,
  identifier  TEXT        NOT NULL,
  value       TEXT        NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS founder_identity.two_factors (
  id          TEXT PRIMARY KEY,
  secret      TEXT NOT NULL,
  backup_codes TEXT NOT NULL,
  user_id     TEXT NOT NULL REFERENCES founder_identity.users(id) ON DELETE CASCADE
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA founder_identity TO founder_identity_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA founder_identity GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO founder_identity_rw;