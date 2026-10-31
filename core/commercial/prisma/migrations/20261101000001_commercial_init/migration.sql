-- Lot 3.1 — commercial_init: registrul aplicațiilor și cheile din manifeste (ARCHITECTURE §8.4).
--
-- Tabele (fără organization_id, deci fără RLS — D-SEC-1 cere RLS doar unde există organizația):
--   application  → cele 15 aplicații + platforma (Hub-ul și serviciile Core)
--   feature_key  → funcționalitățile declarate de manifeste
--   quota_key    → cotele declarate de manifeste: kind (flow / stock), unit, period, overflow, refundable
-- O cheie dispărută din manifest se marchează retrasă (retired_at), nu se șterge.
--
-- Roluri (D-DB-1 varianta C):
--   commercial_rw (NOLOGIN NOINHERIT) → SELECT pe registru, prin SET LOCAL ROLE din app_runtime;
--                                       loturile următoare îi dau tabelele cu organization_id (RLS)
--   founder_runtime                   → SELECT direct pe registru (Founder verifică cheile, 3.2)
-- Scrierea registrului: doar sincronizarea de la deploy (scripts/sync-commercial-registry.ts),
-- pe DIRECT_URL (rolul de migrare). Niciun rol de runtime nu are INSERT / UPDATE / DELETE.

-- Roles (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'commercial_rw') THEN
    CREATE ROLE commercial_rw NOLOGIN NOINHERIT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
    EXECUTE 'GRANT commercial_rw TO app_runtime';
  END IF;
END $$;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "commercial";

GRANT USAGE ON SCHEMA "commercial" TO commercial_rw;

-- CreateTable
CREATE TABLE "commercial"."application" (
    "id" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "is_platform" BOOLEAN NOT NULL DEFAULT false,
    "retired_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "application_id_format" CHECK ("id" ~ '^[a-z][a-z0-9-]*$')
);

-- CreateTable
CREATE TABLE "commercial"."feature_key" (
    "key" VARCHAR(128) NOT NULL,
    "application_id" VARCHAR(64) NOT NULL,
    "description" TEXT,
    "retired_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_key_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "feature_key_format" CHECK ("key" ~ '^[a-z][a-z0-9]*(\.[a-z][a-zA-Z0-9]*)+$')
);

-- CreateTable
-- period: 'month' pentru o cotă de flux (resetarea lunară în ziua de ancorare a abonamentului,
-- D3-3), NULL pentru o cotă de stoc. overflow: doar 'block' (D3-6 a).
CREATE TABLE "commercial"."quota_key" (
    "key" VARCHAR(128) NOT NULL,
    "application_id" VARCHAR(64) NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "unit" VARCHAR(32) NOT NULL,
    "period" VARCHAR(16),
    "overflow" VARCHAR(16) NOT NULL,
    "refundable" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "retired_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quota_key_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "quota_key_format" CHECK ("key" ~ '^[a-z][a-z0-9]*(\.[a-z][a-zA-Z0-9]*)+$'),
    CONSTRAINT "quota_key_kind" CHECK ("kind" IN ('flow', 'stock')),
    CONSTRAINT "quota_key_period" CHECK (
      ("kind" = 'flow' AND "period" = 'month') OR ("kind" = 'stock' AND "period" IS NULL)
    ),
    CONSTRAINT "quota_key_overflow" CHECK ("overflow" IN ('block')),
    CONSTRAINT "quota_key_unit" CHECK ("unit" ~ '^[a-z][a-z0-9_]*$')
);

-- CreateIndex
CREATE INDEX "feature_key_application_id_idx" ON "commercial"."feature_key"("application_id");

-- CreateIndex
CREATE INDEX "quota_key_application_id_idx" ON "commercial"."quota_key"("application_id");

-- AddForeignKey
ALTER TABLE "commercial"."feature_key" ADD CONSTRAINT "feature_key_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "commercial"."application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial"."quota_key" ADD CONSTRAINT "quota_key_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "commercial"."application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Grants: registrul e doar de citit la runtime
REVOKE ALL ON ALL TABLES IN SCHEMA "commercial" FROM PUBLIC;
GRANT SELECT ON "commercial"."application", "commercial"."feature_key", "commercial"."quota_key"
  TO commercial_rw;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA "commercial" TO founder_runtime';
    EXECUTE 'GRANT SELECT ON "commercial"."application", "commercial"."feature_key", '
         || '"commercial"."quota_key" TO founder_runtime';
  END IF;
END $$;
