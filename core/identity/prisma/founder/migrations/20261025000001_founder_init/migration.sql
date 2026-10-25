-- Roles: separate DO $$ blocks per role (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_identity_rw') THEN
    CREATE ROLE founder_identity_rw NOLOGIN NOINHERIT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    CREATE ROLE founder_runtime LOGIN NOINHERIT;
  END IF;
END $$;

GRANT founder_identity_rw TO founder_runtime;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "founder_identity";

GRANT USAGE ON SCHEMA "founder_identity" TO founder_identity_rw;

-- CreateTable
CREATE TABLE "founder_identity"."users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL,
    "image" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "created_by_founder_id" TEXT,
    "revoked_by_founder_id" TEXT,
    "two_factor_enabled" BOOLEAN,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "founder_identity"."sessions" (
    "id" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "founder_identity"."accounts" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMPTZ,
    "refresh_token_expires_at" TIMESTAMPTZ,
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "founder_identity"."verifications" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ,
    "updated_at" TIMESTAMPTZ,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "founder_identity"."two_factors" (
    "id" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "backup_codes" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "verified" BOOLEAN DEFAULT false,
    "failed_verification_count" INTEGER DEFAULT 0,
    "locked_until" TIMESTAMPTZ,

    CONSTRAINT "two_factors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "founder_identity"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "founder_identity"."sessions"("token");

-- AddForeignKey
ALTER TABLE "founder_identity"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "founder_identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "founder_identity"."accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "founder_identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "founder_identity"."two_factors" ADD CONSTRAINT "two_factors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "founder_identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "founder_identity" TO founder_identity_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA "founder_identity" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO founder_identity_rw;
