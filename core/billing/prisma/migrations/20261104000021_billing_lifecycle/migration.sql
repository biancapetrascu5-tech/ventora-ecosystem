-- Lot 3.8 — billing_lifecycle (FAZA-3 „Lot 3.8”, D-3.6-1, D-3.6-5, D3-11; deciziile fondatoarei
-- din 04.11.2026):
--
--   1. billing_founder (rol nou, NOLOGIN NOINHERIT, membru al founder_runtime): ce scrie echipa în
--      billing, o afacere pe tranzacție (RLS), ca commercial_founder / support_founder.
--   2. billing_profile (D-3.6-1): datele pe care se emit facturile afacerii — persoană juridică
--      (RO: CUI verificat cu cifra de control, Nr. Reg. Com.; din afara României: cod de TVA cu
--      prefixul țării, fără VIES) sau persoană fizică (nume și adresă, fără CNP). Le scrie doar
--      echipa; owner-ul le citește în Hub. Factura își fotografiază cumpărătorul la emitere, deci
--      o schimbare se vede de la următoarea factură.
--   3. Plata manuală prin transfer (D3-11): termenul de plată pe afacere (implicit 14 zile);
--      factura de transfer (emisă întâi, cu scadența; pentru o perioadă a abonamentului sau pentru
--      implementarea unei cereri), încasarea confirmată de echipă (o plată `transfer`, suma
--      întreagă).
--   4. Factura neemisă (D-3.6-5): „Reîncearcă” (din failed înapoi în pending, cu cumpărătorul
--      fotografiat din nou) și „Am emis-o manual” (starea `manual`, seria, numărul, data, motivul).
--   5. Cumpărarea implementării cu cardul (D3-23 p. 3): purchase.kind = 'setup', legată de cerere.
--
-- GRANT-uri noi: billing_founder pe tabelele de mai jos (fără DELETE); billing_rw pe
-- billing_profile (SELECT) și pe două funcții de job; founder_runtime pe o funcție Founder.

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Rolul echipei
-- ════════════════════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'billing_founder') THEN
    CREATE ROLE billing_founder NOLOGIN NOINHERIT;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    GRANT billing_founder TO founder_runtime;
  END IF;
END $$;

GRANT USAGE ON SCHEMA "billing" TO billing_founder;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 2. Profilul de facturare (D-3.6-1)
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- CUI-ul românesc: 2–10 cifre, opțional cu „RO” în față (plătitor de TVA), fără zero la început;
-- cifra de control cu cheia 753217532 (suma produselor × 10, modulo 11; 10 → 0).
CREATE OR REPLACE FUNCTION billing.ro_cui_valid(p_cui TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
DECLARE
  digits TEXT;
  body TEXT;
  weights CONSTANT TEXT := '753217532';
  total INTEGER := 0;
  control INTEGER;
BEGIN
  IF p_cui !~ '^(RO)?[1-9][0-9]{1,9}$' THEN
    RETURN false;
  END IF;
  digits := regexp_replace(p_cui, '^RO', '');
  body := lpad(left(digits, length(digits) - 1), 9, '0');
  FOR i IN 1..9 LOOP
    total := total + substr(body, i, 1)::int * substr(weights, i, 1)::int;
  END LOOP;
  control := (total * 10) % 11;
  IF control = 10 THEN control := 0; END IF;
  RETURN control = right(digits, 1)::int;
END $$;

REVOKE ALL ON FUNCTION billing.ro_cui_valid(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION billing.ro_cui_valid(TEXT) TO billing_founder;

CREATE TABLE "billing"."billing_profile" (
  "organization_id"       UUID         NOT NULL,
  "entity_type"           VARCHAR(8)   NOT NULL,
  "name"                  VARCHAR(255) NOT NULL,
  "country"               VARCHAR(2)   NOT NULL DEFAULT 'RO',
  "tax_id"                VARCHAR(20),
  "reg_com"            VARCHAR(32),
  "street"                VARCHAR(255) NOT NULL,
  "city"                  VARCHAR(128) NOT NULL,
  "county"                VARCHAR(128),
  "email"                 VARCHAR(255) NOT NULL,
  "created_by_founder_id" UUID         NOT NULL,
  "updated_by_founder_id" UUID         NOT NULL,
  "created_at"            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"            TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "billing_profile_pkey" PRIMARY KEY ("organization_id"),
  CONSTRAINT "billing_profile_entity_type" CHECK ("entity_type" IN ('company', 'person')),
  CONSTRAINT "billing_profile_name" CHECK (char_length(btrim("name")) BETWEEN 2 AND 255),
  CONSTRAINT "billing_profile_country" CHECK ("country" ~ '^[A-Z]{2}$'),
  CONSTRAINT "billing_profile_address" CHECK (
    char_length(btrim("street")) > 0 AND char_length(btrim("city")) > 0
    AND ("county" IS NULL OR char_length(btrim("county")) > 0)
  ),
  -- În România, județul e obligatoriu; în afara ei „Regiune” e opțională
  CONSTRAINT "billing_profile_county" CHECK ("country" <> 'RO' OR "county" IS NOT NULL),
  CONSTRAINT "billing_profile_email" CHECK ("email" ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- persoana fizică: doar nume și adresă (fără CNP, fără CUI); firma din România: CUI valid și
  -- Nr. Reg. Com.; firma din afara României: cod de TVA cu prefixul țării (nu RO), nr. opțional
  CONSTRAINT "billing_profile_identity" CHECK (
    ("entity_type" = 'person' AND "tax_id" IS NULL AND "reg_com" IS NULL)
    OR ("entity_type" = 'company' AND "country" = 'RO' AND "tax_id" IS NOT NULL
      AND billing.ro_cui_valid("tax_id") AND "reg_com" IS NOT NULL
      -- N12 (05.11.2026): forma clasică J32/1234/2019 sau cea unică, de după 2024 (J2024012345320);
      -- aceeași regulă ca checkRegCom din core/billing (valoarea vine fără spații, cu majuscule)
      AND ("reg_com" ~ '^[JFC](0?[1-9]|[1-4][0-9]|5[0-2])/[0-9]{1,7}/(19|20)[0-9]{2}$'
        OR "reg_com" ~ '^[JFC](19|20)[0-9]{2}[0-9]{6,9}$'))
    OR ("entity_type" = 'company' AND "country" <> 'RO'
      AND "tax_id" ~ '^[A-Z]{2}[0-9A-Z+*.]{2,13}$' AND left("tax_id", 2) <> 'RO')
  ),
  CONSTRAINT "billing_profile_reg_com" CHECK (
    "reg_com" IS NULL OR "reg_com" ~ '^[0-9A-Z][0-9A-Z/.\- ]{1,31}$'
  )
);

-- Momentele și autorul creării le pune serverul și rămân; autorul ultimei schimbări e obligatoriu
CREATE OR REPLACE FUNCTION billing.billing_profile_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = billing, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.updated_at := now();
    NEW.updated_by_founder_id := NEW.created_by_founder_id;
    RETURN NEW;
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by_founder_id IS DISTINCT FROM OLD.created_by_founder_id THEN
    RAISE EXCEPTION 'billing profile %: the creation stays as it was', OLD.organization_id
      USING ERRCODE = 'P0001';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER billing_profile_guard
  BEFORE INSERT OR UPDATE ON "billing"."billing_profile"
  FOR EACH ROW EXECUTE FUNCTION billing.billing_profile_guard();

ALTER TABLE "billing"."billing_profile" ENABLE ROW LEVEL SECURITY;

-- Hub-ul (owner-ul) și emiterea facturii citesc; doar echipa scrie
CREATE POLICY billing_rw_billing_profile ON "billing"."billing_profile"
  FOR SELECT TO billing_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY billing_founder_billing_profile ON "billing"."billing_profile" TO billing_founder
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

REVOKE ALL ON "billing"."billing_profile" FROM PUBLIC;
GRANT SELECT ON "billing"."billing_profile" TO billing_rw;
GRANT SELECT, INSERT, UPDATE ON "billing"."billing_profile" TO billing_founder;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 3. Plata manuală prin transfer (D3-11)
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- 3a. Termenul de plată pe afacere (scadența = data emiterii + termenul)
ALTER TABLE "billing"."billing_subscription"
  ADD COLUMN "payment_terms_days" SMALLINT NOT NULL DEFAULT 14;
ALTER TABLE "billing"."billing_subscription"
  ADD CONSTRAINT "billing_subscription_payment_terms" CHECK ("payment_terms_days" BETWEEN 1 AND 90);

-- Echipa marchează plata manuală și schimbă termenul; legătura cu Stripe rămâne a lui billing_rw
CREATE POLICY billing_founder_billing_subscription ON "billing"."billing_subscription" TO billing_founder
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
GRANT SELECT ON "billing"."billing_subscription" TO billing_founder;
GRANT INSERT ("organization_id", "subscription_id", "payment_method", "payment_terms_days")
  ON "billing"."billing_subscription" TO billing_founder;
GRANT UPDATE ("payment_method", "payment_terms_days", "updated_at")
  ON "billing"."billing_subscription" TO billing_founder;

-- 3b. Plata prin transfer: confirmată de echipă, întotdeauna reușită, fără Stripe
ALTER TABLE "billing"."payment" ADD COLUMN "received_on" DATE;
ALTER TABLE "billing"."payment" ADD COLUMN "confirmed_by_founder_id" UUID;
ALTER TABLE "billing"."payment" DROP CONSTRAINT "payment_kind";
ALTER TABLE "billing"."payment" ADD CONSTRAINT "payment_kind"
  CHECK ("kind" IN ('purchase', 'subscription', 'transfer'));
ALTER TABLE "billing"."payment" ADD CONSTRAINT "payment_transfer" CHECK (
  ("kind" = 'transfer') = ("received_on" IS NOT NULL)
  AND ("kind" = 'transfer') = ("confirmed_by_founder_id" IS NOT NULL)
  AND ("kind" <> 'transfer' OR (
    "status" = 'succeeded' AND "purchase_id" IS NULL
    AND "stripe_payment_intent_id" IS NULL AND "stripe_invoice_id" IS NULL
  ))
);

CREATE POLICY billing_founder_payment_select ON "billing"."payment"
  FOR SELECT TO billing_founder
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY billing_founder_payment_insert ON "billing"."payment"
  FOR INSERT TO billing_founder
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid
    AND "kind" = 'transfer'
  );
GRANT SELECT, INSERT ON "billing"."payment" TO billing_founder;

-- 3c. Factura de transfer: emisă întâi, cu scadența; plătită când echipa confirmă încasarea
ALTER TABLE "billing"."invoice" ADD COLUMN "collection" VARCHAR(8) NOT NULL DEFAULT 'charge';
ALTER TABLE "billing"."invoice" ADD COLUMN "due_on" DATE;
ALTER TABLE "billing"."invoice" ADD COLUMN "period_start" DATE;
ALTER TABLE "billing"."invoice" ADD COLUMN "setup_request_id" UUID;
ALTER TABLE "billing"."invoice" ADD COLUMN "paid_on" DATE;
ALTER TABLE "billing"."invoice" ADD COLUMN "paid_confirmed_by_founder_id" UUID;

-- 4. Factura neemisă: emisă manual / reîncercată de echipă
ALTER TABLE "billing"."invoice" ADD COLUMN "manual_reason" TEXT;
ALTER TABLE "billing"."invoice" ADD COLUMN "manual_by_founder_id" UUID;
ALTER TABLE "billing"."invoice" ADD COLUMN "retried_at" TIMESTAMPTZ;
ALTER TABLE "billing"."invoice" ADD COLUMN "retried_by_founder_id" UUID;

ALTER TABLE "billing"."invoice" ADD CONSTRAINT "invoice_collection"
  CHECK ("collection" IN ('charge', 'transfer'));

-- charge: plata a trecut întâi (card), factura vine după ea; transfer: factura întâi, cu
-- scadența, pentru o perioadă a abonamentului sau pentru implementarea unei cereri
ALTER TABLE "billing"."invoice" DROP CONSTRAINT "invoice_kind";
ALTER TABLE "billing"."invoice" ADD CONSTRAINT "invoice_kind" CHECK (
  ("kind" = 'invoice' AND "reverses_invoice_id" IS NULL AND (
    ("collection" = 'charge' AND "payment_id" IS NOT NULL AND "due_on" IS NULL
      AND "period_start" IS NULL AND "setup_request_id" IS NULL)
    OR ("collection" = 'transfer' AND "due_on" IS NOT NULL
      AND (("period_start" IS NOT NULL) <> ("setup_request_id" IS NOT NULL)))
  ))
  OR ("kind" = 'storno' AND "reverses_invoice_id" IS NOT NULL AND "collection" = 'charge'
    AND "due_on" IS NULL AND "period_start" IS NULL AND "setup_request_id" IS NULL)
);
-- Încasarea prin transfer: data, plata și cine a confirmat, împreună
ALTER TABLE "billing"."invoice" ADD CONSTRAINT "invoice_transfer_paid" CHECK (
  ("collection" = 'transfer'
    AND ("paid_on" IS NULL) = ("payment_id" IS NULL)
    AND ("paid_on" IS NULL) = ("paid_confirmed_by_founder_id" IS NULL)
    AND ("paid_on" IS NULL OR "status" IN ('issued', 'manual')))
  OR ("collection" = 'charge' AND "paid_on" IS NULL AND "paid_confirmed_by_founder_id" IS NULL)
);

ALTER TABLE "billing"."invoice" DROP CONSTRAINT "invoice_status";
ALTER TABLE "billing"."invoice" ADD CONSTRAINT "invoice_status"
  CHECK ("status" IN ('pending', 'issued', 'failed', 'manual'));
ALTER TABLE "billing"."invoice" DROP CONSTRAINT "invoice_issued";
ALTER TABLE "billing"."invoice" ADD CONSTRAINT "invoice_issued" CHECK (
  ("status" IN ('issued', 'manual'))
  = ("series" IS NOT NULL AND "number" IS NOT NULL AND "issued_at" IS NOT NULL)
);
ALTER TABLE "billing"."invoice" ADD CONSTRAINT "invoice_manual" CHECK (
  ("status" = 'manual' AND "manual_by_founder_id" IS NOT NULL AND "issue_date" IS NOT NULL
    AND char_length(btrim("manual_reason")) BETWEEN 10 AND 1000)
  OR ("status" <> 'manual' AND "manual_by_founder_id" IS NULL AND "manual_reason" IS NULL)
);
ALTER TABLE "billing"."invoice" ADD CONSTRAINT "invoice_retried" CHECK (
  ("retried_at" IS NULL) = ("retried_by_founder_id" IS NULL)
);

-- O factură de transfer pe perioada abonamentului și una pe cererea cu implementare
CREATE UNIQUE INDEX "invoice_transfer_period_key"
  ON "billing"."invoice" ("organization_id", "period_start")
  WHERE "kind" = 'invoice' AND "period_start" IS NOT NULL;
CREATE UNIQUE INDEX "invoice_setup_request_key"
  ON "billing"."invoice" ("setup_request_id")
  WHERE "kind" = 'invoice' AND "setup_request_id" IS NOT NULL;
-- Facturile de transfer neîncasate (scadente / restante)
CREATE INDEX "invoice_transfer_unpaid_idx"
  ON "billing"."invoice" ("due_on")
  WHERE "collection" = 'transfer' AND "kind" = 'invoice' AND "paid_on" IS NULL;

-- Pe server, pe rol: echipa (billing_founder) doar creează facturi de transfer, le confirmă
-- încasarea, reîncearcă o factură refuzată și trece o factură ca emisă manual; billing_rw (job-ul,
-- webhook-ul, dispecerul) nu poate atinge niciunul din aceste câmpuri. Restul rândului rămâne.
CREATE OR REPLACE FUNCTION billing.invoice_lifecycle_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = billing, pg_catalog
AS $$
DECLARE
  is_founder BOOLEAN := current_user = 'billing_founder';
  is_rw BOOLEAN := current_user = 'billing_rw';
  writable TEXT[];
  pay RECORD;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (is_founder OR is_rw) AND (
         NEW.paid_on IS NOT NULL OR NEW.paid_confirmed_by_founder_id IS NOT NULL
         OR NEW.manual_reason IS NOT NULL OR NEW.manual_by_founder_id IS NOT NULL
         OR NEW.retried_at IS NOT NULL OR NEW.retried_by_founder_id IS NOT NULL
         OR NEW.status <> 'pending') THEN
      RAISE EXCEPTION 'an invoice starts pending, unpaid, never retried'
        USING ERRCODE = 'P0001', HINT = 'invoice_insert';
    END IF;
    IF is_founder AND NOT (NEW.kind = 'invoice' AND NEW.collection = 'transfer') THEN
      RAISE EXCEPTION 'Founder creates only transfer invoices' USING ERRCODE = 'P0001', HINT = 'invoice_insert';
    END IF;
    RETURN NEW;
  END IF;

  IF is_rw THEN
    IF OLD.status = 'manual' OR NEW.status = 'manual'
       OR NEW.paid_on IS DISTINCT FROM OLD.paid_on
       OR NEW.paid_confirmed_by_founder_id IS DISTINCT FROM OLD.paid_confirmed_by_founder_id
       OR NEW.manual_reason IS DISTINCT FROM OLD.manual_reason
       OR NEW.manual_by_founder_id IS DISTINCT FROM OLD.manual_by_founder_id
       OR NEW.retried_at IS DISTINCT FROM OLD.retried_at
       OR NEW.retried_by_founder_id IS DISTINCT FROM OLD.retried_by_founder_id
       OR NEW.collection IS DISTINCT FROM OLD.collection
       OR NEW.due_on IS DISTINCT FROM OLD.due_on
       OR NEW.period_start IS DISTINCT FROM OLD.period_start
       OR NEW.setup_request_id IS DISTINCT FROM OLD.setup_request_id
       OR (OLD.collection = 'transfer' AND NEW.payment_id IS DISTINCT FROM OLD.payment_id) THEN
      RAISE EXCEPTION 'invoice %: only Founder retries, issues manually or confirms a transfer', OLD.id
        USING ERRCODE = 'P0001', HINT = 'invoice_founder_only';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT is_founder THEN
    RETURN NEW; -- migrarea și fixturile de test (rolul de administrare)
  END IF;

  -- „Reîncearcă”: refuzată → de emis acum, cu cumpărătorul fotografiat din nou (datele corectate)
  IF OLD.status = 'failed' AND NEW.status = 'pending' THEN
    IF NEW.retried_by_founder_id IS NULL THEN
      RAISE EXCEPTION 'invoice %: who retries it?', OLD.id USING ERRCODE = 'P0001';
    END IF;
    writable := ARRAY['status', 'failed_at', 'next_attempt_at', 'claimed_until', 'buyer',
                      'retried_at', 'retried_by_founder_id', 'updated_at'];
    NEW.failed_at := NULL;
    NEW.next_attempt_at := now();
    NEW.claimed_until := NULL;
    NEW.buyer := NULL;
    NEW.retried_at := now();
  -- „Am emis-o manual”: refuzată sau încă neemisă (nerevendicată de o încercare în curs)
  ELSIF OLD.status IN ('failed', 'pending') AND NEW.status = 'manual' THEN
    IF OLD.claimed_until IS NOT NULL AND OLD.claimed_until >= now() THEN
      RAISE EXCEPTION 'invoice % is being issued right now', OLD.id
        USING ERRCODE = 'P0001', HINT = 'invoice_claimed';
    END IF;
    writable := ARRAY['status', 'series', 'number', 'issue_date', 'issued_at', 'failed_at',
                      'manual_reason', 'manual_by_founder_id', 'updated_at'];
    NEW.issued_at := now();
    NEW.failed_at := NULL;
  -- „Confirmă încasarea”: o factură de transfer emisă, cu plata ei `transfer`, suma întreagă
  ELSIF OLD.collection = 'transfer' AND OLD.paid_on IS NULL AND NEW.paid_on IS NOT NULL
        AND NEW.status = OLD.status THEN
    SELECT p.kind, p.amount_minor, p.currency, p.organization_id INTO pay
      FROM billing.payment p WHERE p.id = NEW.payment_id;
    IF pay IS NULL OR pay.kind <> 'transfer' OR pay.organization_id <> OLD.organization_id THEN
      RAISE EXCEPTION 'invoice %: the receipt needs its transfer payment', OLD.id
        USING ERRCODE = 'P0001', HINT = 'invoice_transfer_payment';
    END IF;
    IF pay.amount_minor <> OLD.amount_minor OR pay.currency <> OLD.currency THEN
      RAISE EXCEPTION 'invoice %: only the whole amount is confirmed', OLD.id
        USING ERRCODE = 'P0001', HINT = 'invoice_transfer_amount';
    END IF;
    IF NEW.paid_on > (now() AT TIME ZONE 'Europe/Bucharest')::date THEN
      RAISE EXCEPTION 'invoice %: the receipt date is in the future', OLD.id
        USING ERRCODE = 'P0001', HINT = 'invoice_transfer_date';
    END IF;
    writable := ARRAY['paid_on', 'payment_id', 'paid_confirmed_by_founder_id', 'updated_at'];
  ELSE
    RAISE EXCEPTION 'invoice %: this change is not allowed for Founder', OLD.id
      USING ERRCODE = 'P0001', HINT = 'invoice_transition';
  END IF;

  IF (to_jsonb(NEW) - writable) IS DISTINCT FROM (to_jsonb(OLD) - writable) THEN
    RAISE EXCEPTION 'invoice %: the change touches other fields', OLD.id
      USING ERRCODE = 'P0001', HINT = 'invoice_fields';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER invoice_lifecycle_guard
  BEFORE INSERT OR UPDATE ON "billing"."invoice"
  FOR EACH ROW EXECUTE FUNCTION billing.invoice_lifecycle_guard();

CREATE POLICY billing_founder_invoice ON "billing"."invoice" TO billing_founder
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON "billing"."invoice" TO billing_founder;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 5. Implementarea plătită cu cardul (cererea cu implementare, D3-23 p. 3)
-- ════════════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE "billing"."purchase" ADD COLUMN "setup_request_id" UUID;
ALTER TABLE "billing"."purchase" DROP CONSTRAINT "purchase_kind";
ALTER TABLE "billing"."purchase" ADD CONSTRAINT "purchase_kind" CHECK (
  ("kind" = 'addon' AND "addon_id" IS NOT NULL AND "application_id" IS NULL AND "setup_request_id" IS NULL)
  OR ("kind" = 'application' AND "application_id" IS NOT NULL AND "addon_id" IS NULL
    AND "setup_request_id" IS NULL)
  OR ("kind" = 'setup' AND "application_id" IS NOT NULL AND "addon_id" IS NULL
    AND "setup_request_id" IS NOT NULL AND NOT "recurring" AND "price_minor" = 0 AND "setup_minor" > 0)
);
-- O singură plată în curs sau reușită pe aceeași cerere
CREATE UNIQUE INDEX "purchase_setup_request_live_key"
  ON "billing"."purchase" ("setup_request_id")
  WHERE "setup_request_id" IS NOT NULL AND "status" NOT IN ('failed', 'canceled');

-- Echipa vede cumpărările și cardul (rambursarea: „pe cardul ···· 4242”), fără să le scrie
CREATE POLICY billing_founder_purchase ON "billing"."purchase"
  FOR SELECT TO billing_founder
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY billing_founder_payment_method_ref ON "billing"."payment_method_ref"
  FOR SELECT TO billing_founder
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
GRANT SELECT ON "billing"."purchase", "billing"."payment_method_ref" TO billing_founder;

-- Echipa scrie evenimentul (factura emisă manual, încasarea confirmată) în aceeași tranzacție
CREATE POLICY billing_founder_outbox_events ON "billing"."outbox_events"
  FOR INSERT TO billing_founder
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
GRANT INSERT ON "billing"."outbox_events" TO billing_founder;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 6. Funcțiile job-urilor și ale Founder (SECURITY DEFINER, doar id-uri și sume)
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- Job-ul facturilor lunare de transfer: afacerile pe plată manuală
CREATE OR REPLACE FUNCTION billing.manual_billing_organizations(p_limit INTEGER)
RETURNS TABLE (organization_id UUID, subscription_id UUID, payment_terms_days SMALLINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT s.organization_id, s.subscription_id, s.payment_terms_days
    FROM billing.billing_subscription s
   WHERE s.payment_method = 'manual'
   ORDER BY s.organization_id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 1000);
$$;

-- Job-ul de neplată: facturile de transfer emise, neîncasate, cu scadența trecută (ora României)
CREATE OR REPLACE FUNCTION billing.transfer_invoices_overdue(p_limit INTEGER)
RETURNS TABLE (
  id              UUID,
  organization_id UUID,
  due_on          DATE,
  amount_minor    BIGINT,
  currency        VARCHAR(3)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT i.id, i.organization_id, i.due_on, i.amount_minor, i.currency
    FROM billing.invoice i
   WHERE i.kind = 'invoice'
     AND i.collection = 'transfer'
     AND i.paid_on IS NULL
     AND i.status IN ('issued', 'manual')
     AND i.due_on < (now() AT TIME ZONE 'Europe/Bucharest')::date
     AND NOT EXISTS (SELECT 1 FROM billing.invoice s WHERE s.reverses_invoice_id = i.id)
   ORDER BY i.due_on, i.id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 500);
$$;

-- Founder · Prezentare / Plăți și facturi: facturile de transfer care așteaptă plata
CREATE OR REPLACE FUNCTION billing.founder_transfer_invoices_open(p_limit INTEGER)
RETURNS TABLE (
  id               UUID,
  organization_id  UUID,
  status           VARCHAR(8),
  series           VARCHAR(16),
  number           VARCHAR(32),
  issue_date       DATE,
  due_on           DATE,
  amount_minor     BIGINT,
  currency         VARCHAR(3),
  period_start     DATE,
  setup_request_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT i.id, i.organization_id, i.status, i.series, i.number, i.issue_date, i.due_on,
         i.amount_minor, i.currency, i.period_start, i.setup_request_id
    FROM billing.invoice i
   WHERE i.kind = 'invoice'
     AND i.collection = 'transfer'
     AND i.paid_on IS NULL
     AND NOT EXISTS (SELECT 1 FROM billing.invoice s WHERE s.reverses_invoice_id = i.id)
   ORDER BY i.due_on, i.id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 500);
$$;

REVOKE ALL ON FUNCTION billing.manual_billing_organizations(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION billing.transfer_invoices_overdue(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION billing.founder_transfer_invoices_open(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION billing.manual_billing_organizations(INTEGER) TO billing_rw;
GRANT EXECUTE ON FUNCTION billing.transfer_invoices_overdue(INTEGER) TO billing_rw;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION billing.founder_transfer_invoices_open(INTEGER) TO founder_runtime';
  END IF;
END $$;
