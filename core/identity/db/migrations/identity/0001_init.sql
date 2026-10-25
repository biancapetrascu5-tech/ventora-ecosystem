-- ============================================================
-- IDENTITY SCHEMA — migration 0001
-- Run only after explicit approval. DO NOT execute automatically.
-- ============================================================

-- Roles (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'identity_rw') THEN
    CREATE ROLE identity_rw NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime NOLOGIN;
  END IF;
END $$;

GRANT ROLE identity_rw TO app_runtime;

-- Schema
CREATE SCHEMA IF NOT EXISTS identity;
GRANT USAGE ON SCHEMA identity TO identity_rw;

-- Tables
CREATE TABLE IF NOT EXISTS identity.users (
  id                   TEXT        PRIMARY KEY,
  name                 TEXT        NOT NULL,
  email                TEXT        NOT NULL UNIQUE,
  email_verified       BOOLEAN     NOT NULL DEFAULT false,
  image                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  two_factor_enabled   BOOLEAN
);

CREATE TABLE IF NOT EXISTS identity.sessions (
  id          TEXT        PRIMARY KEY,
  expires_at  TIMESTAMPTZ NOT NULL,
  token       TEXT        NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address  TEXT,
  user_agent  TEXT,
  user_id     TEXT        NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS identity.accounts (
  id                      TEXT        PRIMARY KEY,
  account_id              TEXT        NOT NULL,
  provider_id             TEXT        NOT NULL,
  user_id                 TEXT        NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  access_token            TEXT,
  refresh_token           TEXT,
  id_token                TEXT,
  access_token_expires_at TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  scope                   TEXT,
  password                TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS identity.verifications (
  id          TEXT        PRIMARY KEY,
  identifier  TEXT        NOT NULL,
  value       TEXT        NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS identity.two_factors (
  id                        TEXT        PRIMARY KEY,
  secret                    TEXT        NOT NULL,
  backup_codes              TEXT        NOT NULL,
  user_id                   TEXT        NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  verified                  BOOLEAN     DEFAULT false,
  failed_verification_count INTEGER     DEFAULT 0,
  locked_until              TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS identity.rate_limits (
  key         TEXT        PRIMARY KEY,
  attempts    INTEGER     NOT NULL DEFAULT 0,
  reset_at    TIMESTAMPTZ NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA identity TO identity_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA identity GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO identity_rw;

-- RLS (D-SEC-1) — identity tables are not per-tenant; no RLS on identity schema.
-- identity_rw has NO access to founder_identity.* — enforced by separate role chain.