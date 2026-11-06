-- Lot B.1 (BOOKING.md §3; plan 2026-11-06, approved; D-B1-1 = a, D-B1-2 = a, D-B1-3 = a):
-- the booking schema and the service catalog. Schema `booking`, the role `booking_rw`
-- (NOLOGIN NOINHERIT, granted only to app_runtime), RLS on app.organization_id (D-SEC-1).
--
--   service_category → the categories of the catalog (checklist: „Categorii de servicii”)
--   service          → a service: duration (fixed or variable), price (fixed, „de la”, range),
--                      currency (RON / EUR, D-B1-2), simultaneous capacity, bookable online
--   outbox_events    → booking.service.archived (ARCHITECTURE §6.4 c), with processed_events
--
-- No physical delete (§6.4 c): archiving and restoring, audited. A category with active services
-- is not archived (the contract answers Conflict). The trigger service_guard keeps a service out of
-- an archived category or a category of another business, whoever writes.

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'booking_rw') THEN
    CREATE ROLE booking_rw NOLOGIN NOINHERIT;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT booking_rw TO app_runtime;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS "booking";
GRANT USAGE ON SCHEMA "booking" TO booking_rw;

-- CreateTable
CREATE TABLE "booking"."service_category" (
  "id"                  UUID         NOT NULL,
  "organization_id"     UUID         NOT NULL,
  "name"                VARCHAR(80)  NOT NULL,
  "sort_order"          INTEGER      NOT NULL DEFAULT 0,
  "archived_at"         TIMESTAMPTZ,
  "archived_by_user_id" UUID,
  "created_by_user_id"  UUID         NOT NULL,
  "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "service_category_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_category_name_check"
    CHECK ("name" = btrim("name") AND char_length("name") BETWEEN 1 AND 80),
  CONSTRAINT "service_category_archived_check"
    CHECK (("archived_at" IS NULL) = ("archived_by_user_id" IS NULL))
);

-- the list, in order
CREATE INDEX "service_category_organization_id_sort_idx"
  ON "booking"."service_category" ("organization_id", "sort_order");
-- one active category per name in a business (an archived one frees the name)
CREATE UNIQUE INDEX "service_category_active_name_key"
  ON "booking"."service_category" ("organization_id", lower("name"))
  WHERE "archived_at" IS NULL;

-- CreateTable
CREATE TABLE "booking"."service" (
  "id"                   UUID         NOT NULL,
  "organization_id"      UUID         NOT NULL,
  -- NULL = „Fără categorie”
  "category_id"          UUID,
  "name"                 VARCHAR(120) NOT NULL,
  "description"          TEXT,
  "duration_minutes"     INTEGER      NOT NULL,
  -- variable duration: the upper bound; what the calendar blocks is decided in B.4 / B.5
  "duration_max_minutes" INTEGER,
  -- fixed | from („de la”) | range
  "price_kind"           VARCHAR(8)   NOT NULL DEFAULT 'fixed',
  -- in bani / cents
  "price_minor"          INTEGER      NOT NULL,
  "price_max_minor"      INTEGER,
  "currency"             CHAR(3)      NOT NULL DEFAULT 'RON',
  "capacity"             INTEGER      NOT NULL DEFAULT 1,
  "bookable_online"      BOOLEAN      NOT NULL DEFAULT true,
  "sort_order"           INTEGER      NOT NULL DEFAULT 0,
  "archived_at"          TIMESTAMPTZ,
  "archived_by_user_id"  UUID,
  "created_by_user_id"   UUID         NOT NULL,
  "created_at"           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"           TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "service_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_category_id_fkey" FOREIGN KEY ("category_id")
    REFERENCES "booking"."service_category" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "service_name_check"
    CHECK ("name" = btrim("name") AND char_length("name") BETWEEN 1 AND 120),
  CONSTRAINT "service_description_check"
    CHECK ("description" IS NULL OR char_length("description") <= 1000),
  CONSTRAINT "service_duration_check"
    CHECK ("duration_minutes" BETWEEN 5 AND 720 AND "duration_minutes" % 5 = 0),
  CONSTRAINT "service_duration_max_check" CHECK (
    "duration_max_minutes" IS NULL
    OR ("duration_max_minutes" > "duration_minutes" AND "duration_max_minutes" <= 720
        AND "duration_max_minutes" % 5 = 0)
  ),
  CONSTRAINT "service_price_kind_check" CHECK ("price_kind" IN ('fixed', 'from', 'range')),
  CONSTRAINT "service_price_check" CHECK ("price_minor" BETWEEN 0 AND 10000000),
  CONSTRAINT "service_price_max_check" CHECK (
    ("price_kind" = 'range') = ("price_max_minor" IS NOT NULL)
    AND ("price_max_minor" IS NULL OR ("price_max_minor" > "price_minor"
                                       AND "price_max_minor" <= 10000000))
  ),
  CONSTRAINT "service_currency_check" CHECK ("currency" IN ('RON', 'EUR')),
  CONSTRAINT "service_capacity_check" CHECK ("capacity" BETWEEN 1 AND 100),
  CONSTRAINT "service_archived_check"
    CHECK (("archived_at" IS NULL) = ("archived_by_user_id" IS NULL))
);

CREATE INDEX "service_organization_id_category_sort_idx"
  ON "booking"."service" ("organization_id", "category_id", "sort_order");
CREATE INDEX "service_category_id_idx" ON "booking"."service" ("category_id");
CREATE UNIQUE INDEX "service_active_name_key"
  ON "booking"."service" ("organization_id", lower("name"))
  WHERE "archived_at" IS NULL;

-- A service stays in an active category of its own business, whoever writes: on insert, on a
-- change of category and on restoring (an archived service may sit in a category archived later).
-- SECURITY INVOKER: as booking_rw the lookup runs under RLS, so a category of another business is
-- not found. FOR SHARE waits for an archiving in progress (archiveServiceCategory locks the
-- category FOR UPDATE) and then sees its result, so the two cannot cross.
CREATE OR REPLACE FUNCTION booking.service_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.category_id IS NOT NULL AND NEW.archived_at IS NULL
     AND (TG_OP = 'INSERT'
          OR NEW.category_id IS DISTINCT FROM OLD.category_id
          OR OLD.archived_at IS NOT NULL) THEN
    PERFORM 1 FROM booking.service_category c
     WHERE c.id = NEW.category_id
       AND c.organization_id = NEW.organization_id
       AND c.archived_at IS NULL
       FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'service category % is not an active category of the business', NEW.category_id
        USING ERRCODE = '23514';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION booking.service_guard() FROM PUBLIC;

CREATE TRIGGER service_guard
  BEFORE INSERT OR UPDATE ON "booking"."service"
  FOR EACH ROW EXECUTE FUNCTION booking.service_guard();

CREATE OR REPLACE FUNCTION booking.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION booking.touch_updated_at() FROM PUBLIC;

CREATE TRIGGER service_category_touch
  BEFORE UPDATE ON "booking"."service_category"
  FOR EACH ROW EXECUTE FUNCTION booking.touch_updated_at();

-- RLS (D-SEC-1): USING + WITH CHECK on app.organization_id
ALTER TABLE "booking"."service_category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "booking"."service" ENABLE ROW LEVEL SECURITY;

CREATE POLICY booking_rw_service_category ON "booking"."service_category"
  TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY booking_rw_service ON "booking"."service"
  TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Grants: explicit per table and per column; no DELETE (§6.4 c); no UPDATE of id /
-- organization_id / created_*. No ALTER DEFAULT PRIVILEGES: each table gets its grants in its
-- own migration.
REVOKE ALL ON "booking"."service_category", "booking"."service" FROM PUBLIC;
GRANT SELECT, INSERT ON "booking"."service_category", "booking"."service" TO booking_rw;
GRANT UPDATE ("name", "sort_order", "archived_at", "archived_by_user_id", "updated_at")
  ON "booking"."service_category" TO booking_rw;
GRANT UPDATE ("category_id", "name", "description", "duration_minutes", "duration_max_minutes",
              "price_kind", "price_minor", "price_max_minor", "currency", "capacity",
              "bookable_online", "sort_order", "archived_at", "archived_by_user_id", "updated_at")
  ON "booking"."service" TO booking_rw;

-- Outbox (Lot 4.1, ARCHITECTURE §11.2): generat de outboxMigrationSql('booking', 'booking_rw') din @ventora/db-kit.

CREATE TABLE "booking"."outbox_events" (
  "event_id"        UUID         NOT NULL,
  "type"            VARCHAR(128) NOT NULL,
  "version"         INTEGER      NOT NULL,
  "occurred_at"     TIMESTAMPTZ  NOT NULL,
  "organization_id" UUID         NOT NULL,
  "source_app"      VARCHAR(64)  NOT NULL,
  "resource_id"     VARCHAR(255) NOT NULL,
  "correlation_id"  VARCHAR(255),
  "payload"         JSONB        NOT NULL,
  "status"          VARCHAR(16)  NOT NULL DEFAULT 'pending',
  "attempts"        INTEGER      NOT NULL DEFAULT 0,
  "available_at"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "last_error"      TEXT,
  "failed_at"       TIMESTAMPTZ,
  "dispatched_at"   TIMESTAMPTZ,
  "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("event_id"),
  CONSTRAINT "outbox_events_version_check" CHECK ("version" >= 1),
  CONSTRAINT "outbox_events_status_check" CHECK ("status" IN ('pending', 'dispatched', 'dead')),
  CONSTRAINT "outbox_events_attempts_check" CHECK ("attempts" >= 0)
);

CREATE INDEX "outbox_events_pending_idx"
  ON "booking"."outbox_events" ("available_at", "occurred_at")
  WHERE "status" = 'pending';

CREATE INDEX "outbox_events_dead_idx"
  ON "booking"."outbox_events" ("failed_at")
  WHERE "status" = 'dead';

-- Idempotența consumatorilor (D4-1 = a): un rând per (consumator, eveniment), scris în aceeași
-- tranzacție cu efectul consumatorului.
CREATE TABLE "booking"."processed_events" (
  "consumer"        VARCHAR(128) NOT NULL,
  "event_id"        UUID         NOT NULL,
  "organization_id" UUID         NOT NULL,
  "processed_at"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "processed_events_pkey" PRIMARY KEY ("consumer", "event_id")
);

GRANT SELECT, INSERT, UPDATE ON "booking"."outbox_events" TO booking_rw;
GRANT SELECT, INSERT ON "booking"."processed_events" TO booking_rw;
REVOKE DELETE ON "booking"."outbox_events" FROM booking_rw;
REVOKE UPDATE, DELETE ON "booking"."processed_events" FROM booking_rw;

ALTER TABLE "booking"."outbox_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "booking"."processed_events" ENABLE ROW LEVEL SECURITY;

CREATE POLICY booking_rw_outbox_events ON "booking"."outbox_events"
  TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY booking_rw_processed_events ON "booking"."processed_events"
  TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE OR REPLACE FUNCTION "booking".outbox_pending(p_limit INTEGER)
RETURNS TABLE (event_id UUID, organization_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT e.event_id, e.organization_id
    FROM "booking".outbox_events e
   WHERE e.status = 'pending'
     AND e.available_at <= now()
   ORDER BY e.available_at, e.occurred_at, e.event_id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 100);
$$;

CREATE OR REPLACE FUNCTION "booking".outbox_dead_letters(p_limit INTEGER)
RETURNS TABLE (
  event_id        UUID,
  type            VARCHAR(128),
  version         INTEGER,
  organization_id UUID,
  source_app      VARCHAR(64),
  resource_id     VARCHAR(255),
  attempts        INTEGER,
  last_error      TEXT,
  occurred_at     TIMESTAMPTZ,
  failed_at       TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT e.event_id, e.type, e.version, e.organization_id, e.source_app, e.resource_id,
         e.attempts, e.last_error, e.occurred_at, e.failed_at
    FROM "booking".outbox_events e
   WHERE e.status = 'dead'
   ORDER BY e.failed_at DESC, e.event_id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 500);
$$;

REVOKE ALL ON FUNCTION "booking".outbox_pending(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION "booking".outbox_dead_letters(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "booking".outbox_pending(INTEGER) TO booking_rw;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA "booking" TO founder_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION "booking".outbox_dead_letters(INTEGER) TO founder_runtime';
  END IF;
END $$;
