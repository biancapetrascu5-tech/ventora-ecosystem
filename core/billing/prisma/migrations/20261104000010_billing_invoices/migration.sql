-- Lot 3.6 (FAZA-3, ARCHITECTURE §8.6): factura pentru fiecare plată (SmartBill), plus citirile
-- Founder pentru „Prezentare” (plățile eșuate, disputele deschise, facturile cu probleme) și
-- termenul de răspuns al disputei (evidence_due_by, din webhook-ul Stripe).
--
--   invoice → o factură pe plată (kind = 'invoice', unică pe payment_id) sau stornarea ei
--             (kind = 'storno', unică pe reverses_invoice_id). Stările: pending (de emis sau de
--             reîncercat), issued (cu seria și numărul de la furnizor), failed (refuzată de
--             furnizor sau cu rezultat incert: o verifică Founder, nu se reîncearcă singură).
--             Liniile și datele clientului se fotografiază la prima încercare, ca o reîncercare
--             să trimită exact aceeași factură.
--
-- Fără roluri noi. GRANT-uri noi: billing_rw pe tabelul invoice (fără DELETE) și pe
-- billing.invoices_due; founder_runtime pe cele trei funcții Founder (doar citire, prin
-- SECURITY DEFINER, ca în commercial / support).

ALTER TABLE "billing"."dispute" ADD COLUMN "evidence_due_by" TIMESTAMPTZ;

CREATE TABLE "billing"."invoice" (
  "id"                  UUID         NOT NULL,
  "organization_id"     UUID         NOT NULL,
  "kind"                VARCHAR(8)   NOT NULL DEFAULT 'invoice',
  "payment_id"          UUID,
  "reverses_invoice_id" UUID,
  "provider"            VARCHAR(16)  NOT NULL,
  "status"              VARCHAR(8)   NOT NULL DEFAULT 'pending',
  "series"              VARCHAR(16),
  "number"              VARCHAR(32),
  "provider_document_id" VARCHAR(64),
  "issue_date"          DATE,
  "amount_minor"        BIGINT       NOT NULL,
  "currency"            VARCHAR(3)   NOT NULL,
  "lines"               JSONB,
  "buyer"               JSONB,
  -- null: nu se aplică (contul nu e conectat la SPV); după §6: pending / sent / accepted / rejected
  "efactura_status"     VARCHAR(16),
  "attempts"            INTEGER      NOT NULL DEFAULT 0,
  "next_attempt_at"     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "claimed_until"       TIMESTAMPTZ,
  "last_error"          VARCHAR(500),
  "failed_at"           TIMESTAMPTZ,
  "issued_at"           TIMESTAMPTZ,
  "emailed_at"          TIMESTAMPTZ,
  "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "invoice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invoice_kind" CHECK (
    ("kind" = 'invoice' AND "payment_id" IS NOT NULL AND "reverses_invoice_id" IS NULL)
    OR ("kind" = 'storno' AND "reverses_invoice_id" IS NOT NULL)
  ),
  CONSTRAINT "invoice_provider" CHECK ("provider" IN ('smartbill', 'test')),
  CONSTRAINT "invoice_status" CHECK ("status" IN ('pending', 'issued', 'failed')),
  CONSTRAINT "invoice_issued" CHECK (
    ("status" = 'issued') = ("series" IS NOT NULL AND "number" IS NOT NULL AND "issued_at" IS NOT NULL)
  ),
  CONSTRAINT "invoice_failed" CHECK (("status" = 'failed') = ("failed_at" IS NOT NULL)),
  CONSTRAINT "invoice_amount" CHECK ("amount_minor" >= 0),
  CONSTRAINT "invoice_currency" CHECK ("currency" IN ('RON', 'EUR')),
  CONSTRAINT "invoice_attempts" CHECK ("attempts" >= 0),
  CONSTRAINT "invoice_efactura_status" CHECK (
    "efactura_status" IS NULL OR "efactura_status" IN ('pending', 'sent', 'accepted', 'rejected')
  )
);
-- O plată = o factură; o factură = cel mult o stornare
CREATE UNIQUE INDEX "invoice_payment_id_key"
  ON "billing"."invoice" ("payment_id") WHERE "kind" = 'invoice';
CREATE UNIQUE INDEX "invoice_reverses_invoice_id_key"
  ON "billing"."invoice" ("reverses_invoice_id");
-- Numărul de la furnizor, o singură dată pe serie
CREATE UNIQUE INDEX "invoice_provider_series_number_key"
  ON "billing"."invoice" ("provider", "series", "number") WHERE "number" IS NOT NULL;
CREATE INDEX "invoice_organization_id_created_at_idx"
  ON "billing"."invoice" ("organization_id", "created_at");
CREATE INDEX "invoice_due_idx"
  ON "billing"."invoice" ("next_attempt_at") WHERE "status" = 'pending';
ALTER TABLE "billing"."invoice"
  ADD CONSTRAINT "invoice_payment_id_fkey" FOREIGN KEY ("payment_id")
  REFERENCES "billing"."payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing"."invoice"
  ADD CONSTRAINT "invoice_reverses_invoice_id_fkey" FOREIGN KEY ("reverses_invoice_id")
  REFERENCES "billing"."invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Drepturile lui billing_rw: citire și scriere, fără DELETE (istoricul facturilor rămâne)
GRANT SELECT, INSERT, UPDATE ON "billing"."invoice" TO billing_rw;

ALTER TABLE "billing"."invoice" ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_rw_invoice ON "billing"."invoice" TO billing_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Job-ul de emitere / reîncercare: doar id-ul și organizația facturilor de emis acum (pending,
-- cu termenul ajuns, nerevendicate de altă rulare); fiecare se emite apoi în contextul ei.
CREATE OR REPLACE FUNCTION "billing".invoices_due(p_limit INTEGER)
RETURNS TABLE (id UUID, organization_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT i.id, i.organization_id
    FROM "billing".invoice i
   WHERE i.status = 'pending'
     AND i.next_attempt_at <= now()
     AND (i.claimed_until IS NULL OR i.claimed_until < now())
   ORDER BY i.next_attempt_at, i.created_at, i.id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 100);
$$;

-- Founder · Prezentare: plățile eșuate de încasat. O factură de abonament (Stripe Billing) a
-- cărei ultimă încercare a fost refuzată și care n-a fost plătită între timp; o cumpărare
-- refuzată din Hub nu e aici (nu s-a activat nimic, nu e nimic de încasat).
CREATE OR REPLACE FUNCTION "billing".founder_failed_payments(p_limit INTEGER)
RETURNS TABLE (
  payment_id        UUID,
  organization_id   UUID,
  stripe_invoice_id VARCHAR(255),
  amount_minor      BIGINT,
  currency          VARCHAR(3),
  attempt           INTEGER,
  next_attempt_at   TIMESTAMPTZ,
  failed_at         TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT f.id, f.organization_id, f.stripe_invoice_id, f.amount_minor, f.currency, f.attempt,
         f.next_attempt_at, f.occurred_at
    FROM (
      SELECT DISTINCT ON (p.stripe_invoice_id) p.*
        FROM "billing".payment p
       WHERE p.kind = 'subscription'
         AND p.status = 'failed'
         AND p.stripe_invoice_id IS NOT NULL
       ORDER BY p.stripe_invoice_id, p.attempt DESC, p.occurred_at DESC
    ) f
   WHERE NOT EXISTS (
     SELECT 1 FROM "billing".payment s
      WHERE s.stripe_invoice_id = f.stripe_invoice_id AND s.status = 'succeeded'
   )
   ORDER BY f.occurred_at DESC, f.id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 500);
$$;

-- Founder · Prezentare: disputele deschise (Stripe), cu termenul de răspuns.
CREATE OR REPLACE FUNCTION "billing".founder_open_disputes(p_limit INTEGER)
RETURNS TABLE (
  stripe_dispute_id VARCHAR(255),
  organization_id   UUID,
  amount_minor      BIGINT,
  currency          VARCHAR(3),
  reason            VARCHAR(64),
  status            VARCHAR(32),
  evidence_due_by   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT d.stripe_dispute_id, d.organization_id, d.amount_minor, d.currency, d.reason, d.status,
         d.evidence_due_by, d.created_at
    FROM "billing".dispute d
   WHERE d.status IN ('needs_response', 'warning_needs_response', 'under_review', 'warning_under_review')
   ORDER BY d.evidence_due_by NULLS LAST, d.created_at DESC, d.stripe_dispute_id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 500);
$$;

-- Founder: facturile care cer atenție — refuzate / incerte (failed) sau încă neemise după cel
-- puțin p_min_attempts încercări (alerta din planul 3.6, „SmartBill căzut”).
CREATE OR REPLACE FUNCTION "billing".founder_invoices_attention(p_min_attempts INTEGER, p_limit INTEGER)
RETURNS TABLE (
  id              UUID,
  organization_id UUID,
  kind            VARCHAR(8),
  status          VARCHAR(8),
  amount_minor    BIGINT,
  currency        VARCHAR(3),
  attempts        INTEGER,
  last_error      VARCHAR(500),
  created_at      TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT i.id, i.organization_id, i.kind, i.status, i.amount_minor, i.currency, i.attempts,
         i.last_error, i.created_at
    FROM "billing".invoice i
   WHERE i.status = 'failed'
      OR (i.status = 'pending' AND i.attempts >= GREATEST(COALESCE(p_min_attempts, 1), 1))
   ORDER BY i.created_at DESC, i.id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 500);
$$;

REVOKE ALL ON FUNCTION "billing".invoices_due(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION "billing".founder_failed_payments(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION "billing".founder_open_disputes(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION "billing".founder_invoices_attention(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "billing".invoices_due(INTEGER) TO billing_rw;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA "billing" TO founder_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION "billing".founder_failed_payments(INTEGER) TO founder_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION "billing".founder_open_disputes(INTEGER) TO founder_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION "billing".founder_invoices_attention(INTEGER, INTEGER) TO founder_runtime';
  END IF;
END $$;
