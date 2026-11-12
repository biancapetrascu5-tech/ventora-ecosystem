-- Lot B.9e (design BookingPackages, S126; plan reports/2026-11-12_plan-booking-b9.md): the packages
-- of sessions. No new role, no extension, no DELETE. Records only: no fiscal document (D-9e-4, the
-- accounting, NECESITĂ DECIZIE with the accountant); the sale keeps how the client paid.
--
--   package       → the definition (Setări · Servicii · „Pachete de ședințe”): the service, the
--                   number of sessions, the validity (1, 3, 6, 12 months or none), the price
--   package_sale  → a package sold to a client („Vinde un pachet…”): copied from the definition
--                   (the name, the sessions, the price), valid from / until, how they paid
--   package_use   → one session of a sale on an appointment („Din pachet”): reserved at the booking,
--                   used when the appointment is done, a no-show or a late cancellation, given back
--                   by an on-time cancellation (D-9e-1)
--
-- The rules that hold whoever writes: a use belongs to a sale and an appointment of the same
-- business, the same service, the sale's client (or a card merged with it), never more uses than
-- the sale's sessions (counted under a lock of the sale's row), one open use per appointment; the
-- state of a use follows the appointment (appointment_package_settle). The validity in the business
-- time zone is checked by the application (the zone lives in organizations).

-- CreateTable
CREATE TABLE "booking"."package" (
  "id"                  UUID         NOT NULL,
  "organization_id"     UUID         NOT NULL,
  "service_id"          UUID         NOT NULL,
  "name"                VARCHAR(80)  NOT NULL,
  "sessions"            SMALLINT     NOT NULL,
  -- null = „Fără limită”
  "validity_months"     SMALLINT,
  "price_minor"         INTEGER      NOT NULL,
  "currency"            CHAR(3)      NOT NULL,
  "archived_at"         TIMESTAMPTZ,
  "archived_by_user_id" UUID,
  "created_by_user_id"  UUID         NOT NULL,
  "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "package_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "package_service_id_fkey" FOREIGN KEY ("service_id")
    REFERENCES "booking"."service" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "package_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 80),
  CONSTRAINT "package_sessions_check" CHECK ("sessions" BETWEEN 2 AND 100),
  CONSTRAINT "package_validity_check"
    CHECK ("validity_months" IS NULL OR "validity_months" IN (1, 3, 6, 12)),
  CONSTRAINT "package_price_check" CHECK ("price_minor" BETWEEN 0 AND 10000000),
  CONSTRAINT "package_currency_check" CHECK ("currency" IN ('RON', 'EUR')),
  CONSTRAINT "package_archived_check"
    CHECK (("archived_at" IS NULL) = ("archived_by_user_id" IS NULL))
);

CREATE UNIQUE INDEX "package_organization_id_id_key"
  ON "booking"."package" ("organization_id", "id");
CREATE INDEX "package_service_id_idx" ON "booking"."package" ("service_id");

-- CreateTable
CREATE TABLE "booking"."package_sale" (
  "id"                  UUID         NOT NULL,
  "organization_id"     UUID         NOT NULL,
  "package_id"          UUID         NOT NULL,
  "client_id"           UUID         NOT NULL,
  -- copied from the package at the sale: a later edit of the package does not change what was sold
  "service_id"          UUID         NOT NULL,
  "package_name"        VARCHAR(80)  NOT NULL,
  "sessions"            SMALLINT     NOT NULL,
  "price_minor"         INTEGER      NOT NULL,
  "currency"            CHAR(3)      NOT NULL,
  -- how the client paid at the salon (D-9e-3: the payment link is later)
  "method"              VARCHAR(8)   NOT NULL,
  -- local dates in the business time zone; valid_until null = „Fără limită”
  "valid_from"          DATE         NOT NULL,
  "valid_until"         DATE,
  "note"                VARCHAR(500),
  -- D-9e-2: the owner extends a package by hand, with a reason
  "extended_at"         TIMESTAMPTZ,
  "extended_by_user_id" UUID,
  "extension_reason"    VARCHAR(300),
  "sold_by_user_id"     UUID         NOT NULL,
  "sold_at"             TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "package_sale_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "package_sale_package_fkey" FOREIGN KEY ("organization_id", "package_id")
    REFERENCES "booking"."package" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "package_sale_client_id_fkey" FOREIGN KEY ("client_id")
    REFERENCES "booking"."client" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "package_sale_service_id_fkey" FOREIGN KEY ("service_id")
    REFERENCES "booking"."service" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "package_sale_name_check" CHECK (char_length(btrim("package_name")) BETWEEN 1 AND 80),
  CONSTRAINT "package_sale_sessions_check" CHECK ("sessions" BETWEEN 2 AND 100),
  CONSTRAINT "package_sale_price_check" CHECK ("price_minor" BETWEEN 0 AND 10000000),
  CONSTRAINT "package_sale_currency_check" CHECK ("currency" IN ('RON', 'EUR')),
  CONSTRAINT "package_sale_method_check" CHECK ("method" IN ('cash', 'card', 'transfer', 'other')),
  CONSTRAINT "package_sale_dates_check"
    CHECK ("valid_until" IS NULL OR "valid_until" >= "valid_from"),
  CONSTRAINT "package_sale_note_check"
    CHECK ("note" IS NULL OR char_length("note") BETWEEN 1 AND 500),
  CONSTRAINT "package_sale_extension_check"
    CHECK (("extended_at" IS NULL) = ("extended_by_user_id" IS NULL)
           AND ("extended_at" IS NULL) = ("extension_reason" IS NULL))
);

CREATE UNIQUE INDEX "package_sale_organization_id_id_key"
  ON "booking"."package_sale" ("organization_id", "id");
CREATE INDEX "package_sale_client_id_idx" ON "booking"."package_sale" ("client_id", "sold_at");
CREATE INDEX "package_sale_package_id_idx" ON "booking"."package_sale" ("package_id");

-- CreateTable
CREATE TABLE "booking"."package_use" (
  "id"                  UUID         NOT NULL,
  "organization_id"     UUID         NOT NULL,
  "sale_id"             UUID         NOT NULL,
  "appointment_id"      UUID         NOT NULL,
  "state"               VARCHAR(8)   NOT NULL DEFAULT 'reserved',
  "created_by_user_id"  UUID,
  "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "settled_at"          TIMESTAMPTZ,

  CONSTRAINT "package_use_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "package_use_sale_fkey" FOREIGN KEY ("organization_id", "sale_id")
    REFERENCES "booking"."package_sale" ("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "package_use_appointment_fkey" FOREIGN KEY ("organization_id", "appointment_id")
    REFERENCES "booking"."appointment" ("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "package_use_state_check" CHECK ("state" IN ('reserved', 'used', 'returned')),
  CONSTRAINT "package_use_settled_check" CHECK (("state" = 'reserved') = ("settled_at" IS NULL))
);

-- one open use per appointment (a returned one may be followed by another)
CREATE UNIQUE INDEX "package_use_open_appointment_key"
  ON "booking"."package_use" ("appointment_id") WHERE "state" <> 'returned';
CREATE INDEX "package_use_sale_id_idx" ON "booking"."package_use" ("sale_id");

-- The package's service and currency belong to the same business; the currency is the service's.
CREATE OR REPLACE FUNCTION booking.package_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_currency TEXT;
BEGIN
  SELECT s.currency INTO v_currency
    FROM booking.service s
   WHERE s.id = NEW.service_id AND s.organization_id = NEW.organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'service % is not a service of the business', NEW.service_id
      USING ERRCODE = '23514';
  END IF;
  IF btrim(v_currency) <> NEW.currency THEN
    RAISE EXCEPTION 'the package must have the service''s currency' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION booking.package_guard() FROM PUBLIC;

CREATE TRIGGER package_guard
  BEFORE INSERT OR UPDATE OF service_id, currency ON "booking"."package"
  FOR EACH ROW EXECUTE FUNCTION booking.package_guard();

-- The sale copies its package (the service, the currency) and its client is of the same business.
CREATE OR REPLACE FUNCTION booking.package_sale_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_service UUID;
  v_currency TEXT;
BEGIN
  SELECT p.service_id, p.currency INTO v_service, v_currency
    FROM booking.package p
   WHERE p.id = NEW.package_id AND p.organization_id = NEW.organization_id;
  IF v_service IS DISTINCT FROM NEW.service_id OR btrim(v_currency) <> NEW.currency THEN
    RAISE EXCEPTION 'the sale must have its package''s service and currency'
      USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM booking.client c
   WHERE c.id = NEW.client_id AND c.organization_id = NEW.organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'client % is not a client of the business', NEW.client_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION booking.package_sale_guard() FROM PUBLIC;

CREATE TRIGGER package_sale_guard
  BEFORE INSERT ON "booking"."package_sale"
  FOR EACH ROW EXECUTE FUNCTION booking.package_sale_guard();

-- A use: the appointment of the same business, open (not cancelled, not final), the sale's service
-- and client (or a card merged with it), and a session still left (under a lock of the sale's row:
-- two bookings from the same package wait for each other). A use only goes from reserved to used or
-- returned, once.
CREATE OR REPLACE FUNCTION booking.package_use_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_sale_client UUID;
  v_sale_service UUID;
  v_sessions INTEGER;
  v_taken INTEGER;
  v_a_client UUID;
  v_a_service UUID;
  v_a_status TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.state <> 'reserved' OR NEW.state = 'reserved'
       OR NEW.sale_id <> OLD.sale_id OR NEW.appointment_id <> OLD.appointment_id THEN
      RAISE EXCEPTION 'a use goes once from reserved to used or returned'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.state <> 'reserved' THEN
    RAISE EXCEPTION 'a use starts reserved' USING ERRCODE = '23514';
  END IF;
  SELECT s.client_id, s.service_id, s.sessions INTO v_sale_client, v_sale_service, v_sessions
    FROM booking.package_sale s
   WHERE s.id = NEW.sale_id AND s.organization_id = NEW.organization_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sale % is not a sale of the business', NEW.sale_id USING ERRCODE = '23514';
  END IF;
  SELECT a.client_id, a.service_id, a.status INTO v_a_client, v_a_service, v_a_status
    FROM booking.appointment a
   WHERE a.id = NEW.appointment_id AND a.organization_id = NEW.organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'appointment % is not an appointment of the business', NEW.appointment_id
      USING ERRCODE = '23514';
  END IF;
  IF v_a_status IN ('cancelled', 'completed', 'no_show') THEN
    RAISE EXCEPTION 'the appointment is no longer open' USING ERRCODE = '23514',
      HINT = 'package_appointment_closed';
  END IF;
  IF v_a_service <> v_sale_service THEN
    RAISE EXCEPTION 'the package is for another service' USING ERRCODE = '23514',
      HINT = 'package_other_service';
  END IF;
  IF v_a_client <> v_sale_client AND NOT EXISTS (
       SELECT 1 FROM booking.client c
        WHERE c.organization_id = NEW.organization_id
          AND ((c.id = v_a_client AND c.merged_into_client_id = v_sale_client)
            OR (c.id = v_sale_client AND c.merged_into_client_id = v_a_client))) THEN
    RAISE EXCEPTION 'the package belongs to another client' USING ERRCODE = '23514',
      HINT = 'package_other_client';
  END IF;
  SELECT count(*) INTO v_taken
    FROM booking.package_use u
   WHERE u.sale_id = NEW.sale_id AND u.state <> 'returned';
  IF v_taken >= v_sessions THEN
    RAISE EXCEPTION 'no session left in the package' USING ERRCODE = '23514',
      HINT = 'package_used_up';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION booking.package_use_guard() FROM PUBLIC;

CREATE TRIGGER package_use_guard
  BEFORE INSERT OR UPDATE ON "booking"."package_use"
  FOR EACH ROW EXECUTE FUNCTION booking.package_use_guard();

-- D-9e-1, whoever changes the appointment (a status, a cancellation, a visit, a series, a class): the
-- session is used when the appointment is done, a no-show or cancelled late; an on-time
-- cancellation gives it back. A correction between done and no-show keeps it used.
CREATE OR REPLACE FUNCTION booking.appointment_package_settle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.status IN ('completed', 'no_show') THEN
    UPDATE booking.package_use u SET state = 'used', settled_at = now()
     WHERE u.appointment_id = NEW.id AND u.organization_id = NEW.organization_id
       AND u.state = 'reserved';
  ELSIF NEW.status = 'cancelled' THEN
    UPDATE booking.package_use u
       SET state = CASE WHEN COALESCE(NEW.cancel_late, false) THEN 'used' ELSE 'returned' END,
           settled_at = now()
     WHERE u.appointment_id = NEW.id AND u.organization_id = NEW.organization_id
       AND u.state = 'reserved';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION booking.appointment_package_settle() FROM PUBLIC;

CREATE TRIGGER appointment_package_settle
  AFTER UPDATE OF status ON "booking"."appointment"
  FOR EACH ROW WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION booking.appointment_package_settle();

-- RLS (D-SEC-1): USING + WITH CHECK on the organization of the transaction
ALTER TABLE "booking"."package" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "booking"."package_sale" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "booking"."package_use" ENABLE ROW LEVEL SECURITY;

CREATE POLICY booking_rw_package ON "booking"."package"
  TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY booking_rw_package_sale ON "booking"."package_sale"
  TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY booking_rw_package_use ON "booking"."package_use"
  TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Grants (only booking_rw), no DELETE: the definition is edited and archived; a sale is changed only
-- by the extension (the note cleared by booking.erase_client); a use only changes its state
REVOKE ALL ON "booking"."package" FROM PUBLIC;
GRANT SELECT, INSERT ON "booking"."package" TO booking_rw;
GRANT UPDATE ("name", "validity_months", "price_minor", "archived_at", "archived_by_user_id",
              "updated_at") ON "booking"."package" TO booking_rw;

REVOKE ALL ON "booking"."package_sale" FROM PUBLIC;
GRANT SELECT, INSERT ON "booking"."package_sale" TO booking_rw;
GRANT UPDATE ("valid_until", "extended_at", "extended_by_user_id", "extension_reason")
  ON "booking"."package_sale" TO booking_rw;

REVOKE ALL ON "booking"."package_use" FROM PUBLIC;
GRANT SELECT, INSERT ON "booking"."package_use" TO booking_rw;
GRANT UPDATE ("state", "settled_at") ON "booking"."package_use" TO booking_rw;

-- ── the GDPR erasure, extended (the founder's rule of 10.11.2026) ────────────────────────────
-- The same function as in booking_waitlist, plus the free texts of the package sales (the note,
-- the reason of an extension). The sales, the sessions and the amounts stay (the business's
-- financial history, without personal data).
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

  -- B.11b: the client's links to their bookings, revoked
  UPDATE booking.manage_token t
     SET revoked_at = now()
   WHERE t.organization_id = v_org AND t.revoked_at IS NULL
     AND t.appointment_id IN (
       SELECT a.id FROM booking.appointment a
        WHERE a.organization_id = v_org AND a.client_id = ANY (v_ids));

  -- B.12: the answers to the salon's questions, wiped; their photos marked (photo_file_id kept,
  -- photo_deleted_at NULL) for the deletion through core/files
  UPDATE booking.appointment_answer q
     SET value = NULL, wiped_at = now()
   WHERE q.organization_id = v_org AND q.wiped_at IS NULL
     AND q.appointment_id IN (
       SELECT a.id FROM booking.appointment a
        WHERE a.organization_id = v_org AND a.client_id = ANY (v_ids));

  -- B.9c: the waiting list — the open offers withdrawn (the link stops working), the note wiped,
  -- the open entries removed
  UPDATE booking.waitlist_offer o
     SET state = 'withdrawn', closed_at = now()
   WHERE o.organization_id = v_org AND o.state = 'pending'
     AND o.entry_id IN (
       SELECT e.id FROM booking.waitlist_entry e
        WHERE e.organization_id = v_org AND e.client_id = ANY (v_ids));

  UPDATE booking.waitlist_entry e
     SET note = NULL,
         status = CASE WHEN e.status IN ('waiting', 'offered') THEN 'removed' ELSE e.status END,
         removed_at = CASE WHEN e.status IN ('waiting', 'offered') THEN now() ELSE e.removed_at END,
         removed_by_user_id = CASE WHEN e.status IN ('waiting', 'offered') THEN p_user
                                   ELSE e.removed_by_user_id END,
         updated_at = now()
   WHERE e.organization_id = v_org AND e.client_id = ANY (v_ids);

  -- B.9e: the free texts of the package sales (the note, the reason of an extension)
  UPDATE booking.package_sale s
     SET note = NULL,
         extension_reason = CASE WHEN s.extension_reason IS NULL THEN NULL
                                 ELSE 'Șters la cererea clientului' END
   WHERE s.organization_id = v_org AND s.client_id = ANY (v_ids)
     AND (s.note IS NOT NULL OR s.extension_reason IS NOT NULL);

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION booking.erase_client(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION booking.erase_client(UUID, UUID) TO booking_rw;
