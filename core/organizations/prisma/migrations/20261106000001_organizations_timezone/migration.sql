-- Lot C.0 (BOOKING.md; D-B-4 = a): the business's time zone, IANA, default Europe/Bucharest.
-- Per location later (C.1). D-C0-1 = c (06.11.2026): no setter in the pilot, every business stays
-- in Europe/Bucharest; the value is read through getOrganizationTimeZone (core/organizations).
--
-- Additive: one column with a default, so the existing businesses get Europe/Bucharest.
-- No new grants: org_rw already has SELECT / UPDATE on organization (organizations_init), and the
-- org_rw_organization policy (USING + WITH CHECK) covers the new column.

ALTER TABLE "organizations"."organization"
  ADD COLUMN "time_zone" VARCHAR(64) NOT NULL DEFAULT 'Europe/Bucharest';

-- A CHECK cannot read pg_timezone_names: a trigger refuses an unknown name, whoever writes.
CREATE OR REPLACE FUNCTION organizations.organization_time_zone_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = NEW.time_zone) THEN
    RAISE EXCEPTION 'unknown time zone: %', NEW.time_zone
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION organizations.organization_time_zone_guard() FROM PUBLIC;

CREATE TRIGGER organization_time_zone_guard
  BEFORE INSERT OR UPDATE OF time_zone ON "organizations"."organization"
  FOR EACH ROW EXECUTE FUNCTION organizations.organization_time_zone_guard();
