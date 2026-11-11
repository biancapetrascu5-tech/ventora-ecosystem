-- Lot C.1 (BOOKING.md; D-B-3 = a, D-B-4 = a): the business's locations, in core/organizations,
-- with the stock quota platform.locations and a time zone per location. The modules (Booking,
-- B.10) validate a location through the contract (ARCHITECTURE §6.4 b), never by reading this
-- table.
--
-- Additive: one new table. No new role, no new audit category. The grants are on org_rw (approved
-- by the founder, 11.11.2026): the default privileges of organizations_init would give it SELECT,
-- INSERT, UPDATE, DELETE on any new table, so they are revoked first and given back narrower:
-- SELECT, INSERT and UPDATE on the editable columns only; no DELETE (a location is archived).

CREATE TABLE "organizations"."location" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "address" VARCHAR(500),
    "time_zone" VARCHAR(64) NOT NULL DEFAULT 'Europe/Bucharest',
    "archived_at" TIMESTAMPTZ,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "location_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "location_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 120),
    CONSTRAINT "location_address_check" CHECK ("address" IS NULL OR char_length(btrim("address")) BETWEEN 1 AND 500)
);

CREATE INDEX "location_organization_id_idx" ON "organizations"."location"("organization_id");

ALTER TABLE "organizations"."location" ADD CONSTRAINT "location_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"."organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Two active locations of a business never share a name (case-insensitive). An expression index:
-- it stays out of the Prisma schema, like the partial unique indexes of booking.
CREATE UNIQUE INDEX "location_active_name_key" ON "organizations"."location" ("organization_id", lower("name"))
  WHERE "archived_at" IS NULL;

-- The same time zone rule as on organization (organizations_timezone): an unknown IANA name is
-- refused, whoever writes. The function only reads NEW.time_zone.
CREATE TRIGGER location_time_zone_guard
  BEFORE INSERT OR UPDATE OF time_zone ON "organizations"."location"
  FOR EACH ROW EXECUTE FUNCTION organizations.organization_time_zone_guard();

-- An archived location is final: it gave its unit of platform.locations back, so it is never
-- edited or brought back (a new location takes a new unit).
CREATE OR REPLACE FUNCTION organizations.location_archived_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF OLD.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'location % is archived', OLD.id
      USING ERRCODE = '55000', HINT = 'location_archived';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION organizations.location_archived_guard() FROM PUBLIC;

CREATE TRIGGER location_archived_guard
  BEFORE UPDATE ON "organizations"."location"
  FOR EACH ROW EXECUTE FUNCTION organizations.location_archived_guard();

-- RLS: the business in app.organization_id only, for reading and for writing.
ALTER TABLE "organizations"."location" ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_rw_location ON "organizations"."location"
  FOR ALL TO org_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Grants (org_rw only)
REVOKE ALL ON "organizations"."location" FROM org_rw;
GRANT SELECT, INSERT ON "organizations"."location" TO org_rw;
GRANT UPDATE ("name", "address", "time_zone", "archived_at", "updated_at") ON "organizations"."location" TO org_rw;
