-- Lot B.22a — the salon's Stripe account (BOOKING.md B.22, D-B-7; design BookingPayments, S116 d).
-- Decision of the founder (14.11.2026), replacing S116-D13 (Express): direct charges on the salon's
-- own account — Stripe Accounts v2 with the merchant configuration and the full Stripe Dashboard;
-- the salon is the merchant of record, pays Stripe's fees and carries the losses; Ventora Systems
-- never holds the money. Connected by the owner, from Setări · „Plăți și avans”.
--
-- One row per business: the Stripe account id, its status as EasyBook shows it and the name
-- Stripe displays. Nothing about the company or the bank is kept here (Stripe has it). The status
-- is read from Stripe on return from its form, on the settings page and on the account's
-- notifications (the webhook, through booking.organization_of_stripe_account); `ever_active`
-- tells a first onboarding apart from problems later. Disconnecting keeps the account id (the
-- salon owns the Stripe account; connecting again reuses it): disconnected_at, no DELETE.

CREATE TABLE "booking"."stripe_account" (
  "organization_id"      UUID         NOT NULL,
  "stripe_account_id"    VARCHAR(64)  NOT NULL,
  -- onboarding | in_review | active | problems (see core/billing stripe-connect.ts)
  "status"               VARCHAR(12)  NOT NULL DEFAULT 'onboarding',
  "display_name"         VARCHAR(255),
  "ever_active"          BOOLEAN      NOT NULL DEFAULT false,
  "status_checked_at"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "connected_by_user_id" UUID         NOT NULL,
  "disconnected_at"      TIMESTAMPTZ,
  "created_at"           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"           TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "stripe_account_pkey" PRIMARY KEY ("organization_id"),
  CONSTRAINT "stripe_account_status_check"
    CHECK ("status" IN ('onboarding', 'in_review', 'active', 'problems')),
  CONSTRAINT "stripe_account_id_check" CHECK ("stripe_account_id" ~ '^acct_[A-Za-z0-9]+$')
);

CREATE UNIQUE INDEX "stripe_account_stripe_account_id_key"
  ON "booking"."stripe_account" ("stripe_account_id");

ALTER TABLE "booking"."stripe_account" ENABLE ROW LEVEL SECURITY;
CREATE POLICY booking_rw_stripe_account ON "booking"."stripe_account"
  FOR ALL TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

REVOKE ALL ON "booking"."stripe_account" FROM PUBLIC;
GRANT SELECT, INSERT ON "booking"."stripe_account" TO booking_rw;
GRANT UPDATE ("status", "display_name", "ever_active", "status_checked_at", "connected_by_user_id",
              "disconnected_at", "updated_at")
  ON "booking"."stripe_account" TO booking_rw;

-- The webhook comes without a session: the business is found from the Stripe account (only its
-- id), then the account is read again in the business's own context, under RLS.
CREATE OR REPLACE FUNCTION booking.organization_of_stripe_account(p_account VARCHAR)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT s.organization_id FROM booking.stripe_account s WHERE s.stripe_account_id = p_account;
$$;

REVOKE ALL ON FUNCTION booking.organization_of_stripe_account(VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION booking.organization_of_stripe_account(VARCHAR) TO booking_rw;
