-- Lot C.5 (plans/CAMPAIGNKIT.md; D-CK-1 = a): consimțământul comun, schema `consent`.
-- Rolul `consent_rw` (NOLOGIN NOINHERIT, D-DB-1 C; APROBAT de fondatoare pe 10.11.2026), dat lui
-- app_runtime. RLS pe app.organization_id (D-SEC-1, eșec sigur). Fără acces Founder.
--
--   consent_event → registrul pe persoana vizată (contactul afacerii), canal și scop: dat / retras,
--                   textul și versiunea lui, sursa, motivul, dovada (fișierul, IP-ul trunchiat), cine.
--                   DOAR ADĂUGARE: nici consent_rw, nici altcineva nu modifică sau șterge un rând
--                   (fără GRANT și cu trigger).
--   suppression   → lista de suprimare a afacerii: hash-ul adresei / numărului (nu adresa), ca
--                   dezabonarea să țină și după ștergerea contactului (GDPR art. 17, 21). Afacerea
--                   nu poate scoate o adresă (fără DELETE); o scoate doar persoana, printr-un
--                   consimțământ nou dat de ea (formular confirmat / pagina de preferințe), prin
--                   triggerul de mai jos.
--
-- Starea curentă = ultimul rând pe (afacere, persoană, canal, scop): view-ul consent_state.

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'consent_rw') THEN
    CREATE ROLE consent_rw NOLOGIN NOINHERIT;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT consent_rw TO app_runtime;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS "consent";
GRANT USAGE ON SCHEMA "consent" TO consent_rw;

CREATE TABLE "consent"."consent_event" (
  "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID         NOT NULL,
  -- persoana vizată: id-ul din aplicația care o ține (fără copie a datelor ei)
  "subject_type"    VARCHAR(32)  NOT NULL
    CHECK ("subject_type" IN ('crm_contact', 'marketing_contact', 'booking_client')),
  "subject_id"      UUID         NOT NULL,
  "channel"         VARCHAR(16)  NOT NULL CHECK ("channel" IN ('email', 'sms', 'whatsapp')),
  "purpose"         VARCHAR(16)  NOT NULL DEFAULT 'marketing' CHECK ("purpose" IN ('marketing')),
  "state"           VARCHAR(16)  NOT NULL CHECK ("state" IN ('given', 'withdrawn')),
  -- hash-ul adresei / numărului normalizat (core/consent), pentru legătura cu suprimarea
  "address_hash"    VARCHAR(64)  NOT NULL CHECK ("address_hash" ~ '^[0-9a-f]{64}$'),
  "source"          VARCHAR(24)  NOT NULL CHECK ("source" IN (
                      'form', 'form_confirmed', 'import', 'manual', 'booking', 'crm',
                      'preferences', 'unsubscribe', 'sms_stop', 'bounce', 'spam_report')),
  -- textul acceptat și versiunea lui; obligatorii la „dat”
  "text"            TEXT         CHECK ("text" IS NULL OR length("text") BETWEEN 1 AND 4000),
  "text_version"    VARCHAR(64),
  "reason"          TEXT         CHECK ("reason" IS NULL OR length("reason") BETWEEN 1 AND 1000),
  "proof_file_id"   UUID,
  -- dovada: IP-ul trunchiat (IPv4 /24, IPv6 /48), niciodată întreg
  "ip_truncated"    VARCHAR(64),
  "actor_user_id"   UUID,
  "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "consent_event_pkey" PRIMARY KEY ("id"),
  -- „Dat” cere textul și versiunea; importul și manualul cer și motivul (ClientDeskConsent)
  CONSTRAINT "consent_event_given_text" CHECK (
    "state" <> 'given' OR ("text" IS NOT NULL AND "text_version" IS NOT NULL)),
  CONSTRAINT "consent_event_given_source" CHECK (
    "state" <> 'given' OR "source" IN ('form', 'form_confirmed', 'import', 'manual', 'booking',
                                       'crm', 'preferences')),
  CONSTRAINT "consent_event_given_reason" CHECK (
    "state" <> 'given' OR "source" NOT IN ('import', 'manual') OR "reason" IS NOT NULL),
  CONSTRAINT "consent_event_withdrawn_source" CHECK (
    "state" <> 'withdrawn' OR "source" IN ('manual', 'preferences', 'unsubscribe', 'sms_stop',
                                           'bounce', 'spam_report', 'crm', 'booking'))
);

CREATE INDEX "consent_event_subject_idx" ON "consent"."consent_event"
  ("organization_id", "subject_type", "subject_id", "channel", "purpose", "created_at" DESC);
CREATE INDEX "consent_event_address_idx" ON "consent"."consent_event"
  ("organization_id", "channel", "address_hash", "created_at" DESC);

CREATE TABLE "consent"."suppression" (
  "organization_id" UUID         NOT NULL,
  "channel"         VARCHAR(16)  NOT NULL CHECK ("channel" IN ('email', 'sms', 'whatsapp')),
  "address_hash"    VARCHAR(64)  NOT NULL CHECK ("address_hash" ~ '^[0-9a-f]{64}$'),
  "reason"          VARCHAR(16)  NOT NULL
    CHECK ("reason" IN ('unsubscribed', 'bounced', 'spam_report')),
  -- de unde a venit: aplicația (crm / marketing / booking) sau pagina publică
  "origin"          VARCHAR(32)  NOT NULL,
  "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "suppression_pkey" PRIMARY KEY ("organization_id", "channel", "address_hash")
);

-- ── Doar adăugare ────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION consent.append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'consent: % is append-only', TG_TABLE_NAME USING ERRCODE = '42501';
END $$;

CREATE TRIGGER consent_event_append_only
  BEFORE UPDATE OR DELETE ON "consent"."consent_event"
  FOR EACH ROW EXECUTE FUNCTION consent.append_only();

-- Suprimarea: rândul nu se schimbă; se scoate doar prin triggerul de mai jos (persoana, din nou)
CREATE TRIGGER suppression_no_update
  BEFORE UPDATE ON "consent"."suppression"
  FOR EACH ROW EXECUTE FUNCTION consent.append_only();

-- ── Un consimțământ nou, dat de persoana însăși, scoate adresa din suprimare ────────────────────
-- Doar sursele în care persoana acționează singură: formularul confirmat din e-mail (dublu opt-in)
-- și pagina de preferințe. Importul, manualul, EasyBook sau ClientDesk nu o scot (afacerea nu poate
-- reabona pe cineva care s-a dezabonat). SECURITY DEFINER: consent_rw nu are DELETE pe suppression.
CREATE OR REPLACE FUNCTION consent.release_suppression()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.state = 'given' AND NEW.source IN ('form_confirmed', 'preferences') THEN
    DELETE FROM "consent"."suppression"
     WHERE organization_id = NEW.organization_id
       AND channel = NEW.channel
       AND address_hash = NEW.address_hash
       AND reason = 'unsubscribed';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION consent.release_suppression() FROM PUBLIC;

CREATE TRIGGER consent_event_release_suppression
  AFTER INSERT ON "consent"."consent_event"
  FOR EACH ROW EXECUTE FUNCTION consent.release_suppression();

-- „Dat” pe o adresă suprimată, din altă sursă decât persoana: refuzat în baza de date
CREATE OR REPLACE FUNCTION consent.given_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  -- clock_timestamp: două rânduri în aceeași tranzacție au ordinea lor (starea curentă)
  NEW.created_at := clock_timestamp();
  IF NEW.state = 'given' AND NEW.source NOT IN ('form_confirmed', 'preferences') AND EXISTS (
    SELECT 1 FROM "consent"."suppression"
     WHERE organization_id = NEW.organization_id
       AND channel = NEW.channel
       AND address_hash = NEW.address_hash) THEN
    RAISE EXCEPTION 'consent: the address is suppressed; only the person can subscribe again'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION consent.given_guard() FROM PUBLIC;

CREATE TRIGGER consent_event_given_guard
  BEFORE INSERT ON "consent"."consent_event"
  FOR EACH ROW EXECUTE FUNCTION consent.given_guard();

-- ── Starea curentă ──────────────────────────────────────────────────────────────────────────────
-- security_invoker: view-ul respectă RLS-ul celui care citește (consent_rw), nu al proprietarului
CREATE VIEW "consent"."consent_state" WITH (security_invoker = true) AS
  SELECT DISTINCT ON (organization_id, subject_type, subject_id, channel, purpose)
         organization_id, subject_type, subject_id, channel, purpose, state, address_hash,
         source, text_version, created_at
    FROM "consent"."consent_event"
   ORDER BY organization_id, subject_type, subject_id, channel, purpose, created_at DESC, id DESC;

-- ── RLS: T1 / T2 ─────────────────────────────────────────────────────────────────────────────────
ALTER TABLE "consent"."consent_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "consent"."suppression" ENABLE ROW LEVEL SECURITY;

CREATE POLICY consent_rw_event ON "consent"."consent_event" TO consent_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY consent_rw_suppression ON "consent"."suppression" TO consent_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- ── Grants: doar citire și adăugare ─────────────────────────────────────────────────────────────
GRANT SELECT, INSERT ON "consent"."consent_event" TO consent_rw;
GRANT SELECT, INSERT ON "consent"."suppression" TO consent_rw;
GRANT SELECT ON "consent"."consent_state" TO consent_rw;
