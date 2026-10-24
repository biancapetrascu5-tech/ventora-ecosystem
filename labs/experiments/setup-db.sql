-- E2/E3 setup: creare scheme + roluri izolate
-- Rulat o singură dată ca superuser (postgres) după pornirea containerului.

-- Creare scheme
CREATE SCHEMA IF NOT EXISTS lab_core;
CREATE SCHEMA IF NOT EXISTS lab_booking;
CREATE SCHEMA IF NOT EXISTS lab_crm;

-- ─── lab_core_user ───────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'lab_core_user') THEN
    CREATE ROLE lab_core_user WITH LOGIN PASSWORD 'localpass';
  END IF;
END
$$;
GRANT CONNECT ON DATABASE ventora_labs TO lab_core_user;
GRANT USAGE ON SCHEMA lab_core TO lab_core_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA lab_core TO lab_core_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA lab_core TO lab_core_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA lab_core GRANT ALL ON TABLES TO lab_core_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA lab_core GRANT ALL ON SEQUENCES TO lab_core_user;
-- deliberat: nicio permisiune pe lab_booking sau lab_crm

-- ─── lab_booking_user ────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'lab_booking_user') THEN
    CREATE ROLE lab_booking_user WITH LOGIN PASSWORD 'localpass';
  END IF;
END
$$;
GRANT CONNECT ON DATABASE ventora_labs TO lab_booking_user;
GRANT USAGE ON SCHEMA lab_booking TO lab_booking_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA lab_booking TO lab_booking_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA lab_booking TO lab_booking_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA lab_booking GRANT ALL ON TABLES TO lab_booking_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA lab_booking GRANT ALL ON SEQUENCES TO lab_booking_user;
-- deliberat: nicio permisiune pe lab_core sau lab_crm

-- ─── lab_crm_user ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'lab_crm_user') THEN
    CREATE ROLE lab_crm_user WITH LOGIN PASSWORD 'localpass';
  END IF;
END
$$;
GRANT CONNECT ON DATABASE ventora_labs TO lab_crm_user;
GRANT USAGE ON SCHEMA lab_crm TO lab_crm_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA lab_crm TO lab_crm_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA lab_crm TO lab_crm_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA lab_crm GRANT ALL ON TABLES TO lab_crm_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA lab_crm GRANT ALL ON SEQUENCES TO lab_crm_user;
-- deliberat: nicio permisiune pe lab_core sau lab_booking
