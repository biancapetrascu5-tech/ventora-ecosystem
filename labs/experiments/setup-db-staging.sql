-- E4/E5 setup staging: creare scheme + roluri izolate pe Supabase
-- ─────────────────────────────────────────────────────────────────────────────
-- INSTRUCȚIUNI: înlocuiești <PAROLA_CORE>, <PAROLA_BOOKING>, <PAROLA_CRM>, <PAROLA_MULTI>
-- cu parole puternice și diferite pentru fiecare rol, ÎNAINTE de a rula.
-- Notează parolele în managerul tău de parole — le vei pune și în Vercel.
-- Rulat ca superuser (postgres) în SQL Editor din dashboard-ul Supabase.
-- ─────────────────────────────────────────────────────────────────────────────

-- Creare scheme (dacă nu există deja după migrate deploy)
CREATE SCHEMA IF NOT EXISTS lab_core;
CREATE SCHEMA IF NOT EXISTS lab_booking;
CREATE SCHEMA IF NOT EXISTS lab_crm;

-- ─── lab_core_user ───────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'lab_core_user') THEN
    CREATE ROLE lab_core_user WITH LOGIN PASSWORD '<PAROLA_CORE>';
  ELSE
    ALTER ROLE lab_core_user WITH PASSWORD '<PAROLA_CORE>';
  END IF;
END $$;
GRANT CONNECT ON DATABASE postgres TO lab_core_user;
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
    CREATE ROLE lab_booking_user WITH LOGIN PASSWORD '<PAROLA_BOOKING>';
  ELSE
    ALTER ROLE lab_booking_user WITH PASSWORD '<PAROLA_BOOKING>';
  END IF;
END $$;
GRANT CONNECT ON DATABASE postgres TO lab_booking_user;
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
    CREATE ROLE lab_crm_user WITH LOGIN PASSWORD '<PAROLA_CRM>';
  ELSE
    ALTER ROLE lab_crm_user WITH PASSWORD '<PAROLA_CRM>';
  END IF;
END $$;
GRANT CONNECT ON DATABASE postgres TO lab_crm_user;
GRANT USAGE ON SCHEMA lab_crm TO lab_crm_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA lab_crm TO lab_crm_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA lab_crm TO lab_crm_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA lab_crm GRANT ALL ON TABLES TO lab_crm_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA lab_crm GRANT ALL ON SEQUENCES TO lab_crm_user;
-- deliberat: nicio permisiune pe lab_core sau lab_booking

-- ─── lab_multi_user (Varianta B) ─────────────────────────────────────────────
-- ATENȚIE: acest rol are acces la TOATE cele 3 scheme.
-- Izolarea între module nu mai e garantată de baza de date — numai de cod (lint + wrapper).
-- Acesta este un criteriu de decizie pentru D-DB-1.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'lab_multi_user') THEN
    CREATE ROLE lab_multi_user WITH LOGIN PASSWORD '<PAROLA_MULTI>';
  ELSE
    ALTER ROLE lab_multi_user WITH PASSWORD '<PAROLA_MULTI>';
  END IF;
END $$;
GRANT CONNECT ON DATABASE postgres TO lab_multi_user;
GRANT USAGE ON SCHEMA lab_core, lab_booking, lab_crm TO lab_multi_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA lab_core TO lab_multi_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA lab_booking TO lab_multi_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA lab_crm TO lab_multi_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA lab_core TO lab_multi_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA lab_booking TO lab_multi_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA lab_crm TO lab_multi_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA lab_core GRANT ALL ON TABLES TO lab_multi_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA lab_booking GRANT ALL ON TABLES TO lab_multi_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA lab_crm GRANT ALL ON TABLES TO lab_multi_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA lab_core GRANT ALL ON SEQUENCES TO lab_multi_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA lab_booking GRANT ALL ON SEQUENCES TO lab_multi_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA lab_crm GRANT ALL ON SEQUENCES TO lab_multi_user;

-- ─── Verificare ───────────────────────────────────────────────────────────────
-- Rulezi asta separat pentru a confirma că toate rolurile există:
-- SELECT rolname FROM pg_roles WHERE rolname LIKE 'lab_%' ORDER BY rolname;
