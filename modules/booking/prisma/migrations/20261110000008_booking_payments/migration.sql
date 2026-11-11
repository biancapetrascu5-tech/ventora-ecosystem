-- Lot B.21 (BOOKING.md §3 B.21; without a provider): the payments of an appointment — „Încasează”,
-- partial payments, refunds, the outstanding balance, the financial history on the appointment and
-- on the client card, and the event booking.payment.recorded for Finance (C-B-2). No new role, no
-- extension, no DELETE. Records only: no fiscal receipt (the cash register stays the salon's; E-AMEF
-- is B.34).
--
--   appointment_payment → one movement: a payment or a refund, its amount and method; insert only (a
--                         mistake is corrected with a refund, never by changing the row)

-- CreateTable
CREATE TABLE "booking"."appointment_payment" (
  "id"                  UUID         NOT NULL,
  "organization_id"     UUID         NOT NULL,
  "appointment_id"      UUID         NOT NULL,
  -- copied from the appointment, for the client card and the erasure
  "client_id"           UUID         NOT NULL,
  "kind"                VARCHAR(8)   NOT NULL,
  "amount_minor"        INTEGER      NOT NULL,
  "currency"            CHAR(3)      NOT NULL,
  "method"              VARCHAR(8)   NOT NULL,
  "note"                VARCHAR(500),
  -- a refund points to the payment it gives back (optional)
  "refund_of_payment_id" UUID,
  "recorded_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "recorded_by_user_id" UUID         NOT NULL,

  CONSTRAINT "appointment_payment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "appointment_payment_appointment_id_fkey" FOREIGN KEY ("appointment_id")
    REFERENCES "booking"."appointment" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "appointment_payment_client_id_fkey" FOREIGN KEY ("client_id")
    REFERENCES "booking"."client" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "appointment_payment_refund_of_fkey" FOREIGN KEY ("refund_of_payment_id")
    REFERENCES "booking"."appointment_payment" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "appointment_payment_kind_check" CHECK ("kind" IN ('payment', 'refund')),
  CONSTRAINT "appointment_payment_amount_check" CHECK ("amount_minor" BETWEEN 1 AND 10000000),
  CONSTRAINT "appointment_payment_currency_check" CHECK ("currency" IN ('RON', 'EUR')),
  CONSTRAINT "appointment_payment_method_check"
    CHECK ("method" IN ('cash', 'card', 'transfer', 'other')),
  CONSTRAINT "appointment_payment_note_check"
    CHECK ("note" IS NULL OR char_length("note") BETWEEN 1 AND 500),
  CONSTRAINT "appointment_payment_refund_check"
    CHECK ("refund_of_payment_id" IS NULL OR "kind" = 'refund')
);

CREATE INDEX "appointment_payment_appointment_id_idx"
  ON "booking"."appointment_payment" ("appointment_id", "recorded_at");
CREATE INDEX "appointment_payment_client_id_idx"
  ON "booking"."appointment_payment" ("client_id", "recorded_at");

-- The rules that hold whoever writes: the payment belongs to an appointment of the same business,
-- with the appointment's currency and client; a refund never takes more than what was paid
-- (net ≥ 0), counted under a lock of the appointment's row (two refunds wait for each other).
CREATE OR REPLACE FUNCTION booking.appointment_payment_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_currency TEXT;
  v_client UUID;
  v_net BIGINT;
BEGIN
  SELECT a.currency, a.client_id INTO v_currency, v_client
    FROM booking.appointment a
   WHERE a.id = NEW.appointment_id AND a.organization_id = NEW.organization_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'appointment % is not an appointment of the business', NEW.appointment_id
      USING ERRCODE = '23514';
  END IF;
  IF btrim(v_currency) <> NEW.currency OR v_client <> NEW.client_id THEN
    RAISE EXCEPTION 'the payment must have the appointment''s currency and client'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.kind = 'refund' THEN
    SELECT COALESCE(sum(CASE WHEN p.kind = 'payment' THEN p.amount_minor ELSE -p.amount_minor END), 0)
      INTO v_net
      FROM booking.appointment_payment p
     WHERE p.appointment_id = NEW.appointment_id;
    IF NEW.amount_minor > v_net THEN
      RAISE EXCEPTION 'a refund of % is more than the % paid', NEW.amount_minor, v_net
        USING ERRCODE = '23514', HINT = 'refund_exceeds_paid';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION booking.appointment_payment_guard() FROM PUBLIC;

CREATE TRIGGER appointment_payment_guard
  BEFORE INSERT ON "booking"."appointment_payment"
  FOR EACH ROW EXECUTE FUNCTION booking.appointment_payment_guard();

-- RLS (D-SEC-1): USING + WITH CHECK on the organization of the transaction
ALTER TABLE "booking"."appointment_payment" ENABLE ROW LEVEL SECURITY;

CREATE POLICY booking_rw_appointment_payment ON "booking"."appointment_payment"
  TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Grants (only booking_rw): insert only; the note is cleared only by booking.erase_client
REVOKE ALL ON "booking"."appointment_payment" FROM PUBLIC;
GRANT SELECT, INSERT ON "booking"."appointment_payment" TO booking_rw;

-- ── the GDPR erasure, extended (the founder's rule of 10.11.2026) ────────────────────────────
-- The same function as in booking_medical, plus the notes of the payments. The amounts stay (the
-- business's financial history, without personal data).
CREATE OR REPLACE FUNCTION booking.erase_client(p_client UUID, p_user UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_org UUID := NULLIF(current_setting('app.organization_id', true), '')::uuid;
  v_erased TIMESTAMPTZ;
  v_ids UUID[];
  v_count INTEGER;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no organization in the transaction' USING ERRCODE = '42501';
  END IF;
  IF p_user IS NULL THEN
    RAISE EXCEPTION 'the user who erases is required' USING ERRCODE = '23502';
  END IF;

  SELECT c.erased_at INTO v_erased
    FROM booking.client c
   WHERE c.id = p_client AND c.organization_id = v_org
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'client % not found', p_client USING ERRCODE = 'P0002';
  END IF;
  IF v_erased IS NOT NULL THEN
    RETURN 0;
  END IF;

  SELECT array_agg(c.id) INTO v_ids
    FROM booking.client c
   WHERE c.organization_id = v_org
     AND (c.id = p_client OR c.merged_into_client_id = p_client);

  UPDATE booking.client c
     SET name = 'Client șters', phone = NULL, email = NULL,
         erased_at = now(), erased_by_user_id = p_user,
         archived_at = COALESCE(c.archived_at, now()),
         archived_by_user_id = COALESCE(c.archived_by_user_id, p_user),
         updated_at = now()
   WHERE c.organization_id = v_org AND c.id = ANY (v_ids);

  UPDATE booking.appointment a
     SET client_name = 'Client șters', team_note = NULL
   WHERE a.organization_id = v_org AND a.client_id = ANY (v_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE booking.client_block b
     SET reason = 'Șters la cererea clientului'
   WHERE b.organization_id = v_org AND b.client_id = ANY (v_ids);

  UPDATE booking.client_note_removal r
     SET reason = 'Șters la cererea clientului'
   WHERE r.organization_id = v_org AND r.client_id = ANY (v_ids);

  -- B.8: the health answers wiped, the consents withdrawn by the business
  UPDATE booking.medical_answer m
     SET value_encrypted = NULL, wiped_at = now(), updated_by_user_id = p_user
   WHERE m.organization_id = v_org AND m.client_id = ANY (v_ids) AND m.wiped_at IS NULL;

  UPDATE booking.medical_consent k
     SET withdrawn_at = now(), withdrawn_by = 'business', withdrawn_by_user_id = p_user
   WHERE k.organization_id = v_org AND k.client_id = ANY (v_ids) AND k.withdrawn_at IS NULL;

  -- B.21: the notes of the payments (free text, may hold personal data)
  UPDATE booking.appointment_payment p
     SET note = NULL
   WHERE p.organization_id = v_org AND p.client_id = ANY (v_ids) AND p.note IS NOT NULL;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION booking.erase_client(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION booking.erase_client(UUID, UUID) TO booking_rw;
