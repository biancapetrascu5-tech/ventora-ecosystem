-- Lot MK.2 (plans/CAMPAIGNKIT.md; D-CK-2 = a, fondatoarea 10.11.2026): registrul contactelor de
-- marketing al afacerii, cu legătura opțională spre contactul ClientDesk / clientul EasyBook (doar
-- id-ul, nu o copie a datelor sursă, ca D-CRM-1).
--
--   contact             → numele, e-mailul și telefonul (normalizate în cod, pentru potrivirea
--                         exactă), limba, etichetele, câmpurile proprii simple, sursa, legăturile;
--                         arhivat (archived_at) în loc de șters; îmbinat (merged_into_id)
--   contact_event       → istoricul interacțiunilor (trimis, livrat, deschis, click, dezabonat,
--                         formular): doar adăugare, niciodată modificat sau șters
--   duplicate_dismissal → „Nu sunt duplicate” pentru o pereche (potrivirea exactă, ca D-CRM-8)
--   erase_contact()     → ștergerea GDPR (review #192): golește datele personale și marchează
--                         contactul șters, fără DELETE, pe modelul booking.erase_client
--
-- Legăturile din schemă sunt compuse (afacere + id, review #192): un rând nu poate trimite la un
-- contact al altei afaceri, nici dacă RLS ar fi ocolit.
--
-- Consimțământul NU stă aici: doar prin core/consent (C.5, MK.5). Fără DELETE (§6.4 c); fără UPDATE
-- pe organization_id / id / created_*; RLS pe app.organization_id (D-SEC-1). Fără rol nou: doar
-- marketing_rw (MK.1).

CREATE TABLE "marketing"."contact" (
  "id"                 UUID         NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"    UUID         NOT NULL,
  "name"               VARCHAR(160),
  "email"              VARCHAR(254),
  "phone"              VARCHAR(16),
  "locale"             VARCHAR(2),
  "tags"               TEXT[]       NOT NULL DEFAULT '{}',
  "custom_fields"      JSONB        NOT NULL DEFAULT '{}',
  "source"             VARCHAR(16)  NOT NULL,
  "crm_contact_id"     UUID,
  "booking_client_id"  UUID,
  "archived_at"        TIMESTAMPTZ,
  "merged_into_id"     UUID,
  "erased_at"          TIMESTAMPTZ,
  "erased_by_user_id"  UUID,
  "created_by_user_id" UUID,
  "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "contact_pkey" PRIMARY KEY ("id"),
  -- the composite key every link of the schema points to (business + id)
  CONSTRAINT "contact_organization_id_id_key" UNIQUE ("organization_id", "id"),
  CONSTRAINT "contact_merged_into_id_fkey" FOREIGN KEY ("organization_id", "merged_into_id")
    REFERENCES "marketing"."contact" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  -- a marketing contact is reachable (an e-mail or a phone), unless it was erased (GDPR)
  CONSTRAINT "contact_reachable_check"
    CHECK ("erased_at" IS NOT NULL OR "email" IS NOT NULL OR "phone" IS NOT NULL),
  CONSTRAINT "contact_erased_check" CHECK (
    "erased_at" IS NULL OR ("name" IS NULL AND "email" IS NULL AND "phone" IS NULL
      AND "tags" = '{}' AND "custom_fields" = '{}'::jsonb AND "erased_by_user_id" IS NOT NULL)),
  CONSTRAINT "contact_name_check"
    CHECK ("name" IS NULL OR char_length(btrim("name")) BETWEEN 1 AND 160),
  -- normalized in code (core/consent normalizeAddress): lower case; +<8–15 digits>
  CONSTRAINT "contact_email_check"
    CHECK ("email" IS NULL OR ("email" = lower("email") AND "email" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  CONSTRAINT "contact_phone_check" CHECK ("phone" IS NULL OR "phone" ~ '^\+[0-9]{8,15}$'),
  CONSTRAINT "contact_locale_check"
    CHECK ("locale" IS NULL OR "locale" IN ('ro', 'en', 'fr', 'es', 'de', 'it')),
  CONSTRAINT "contact_tags_check" CHECK (cardinality("tags") <= 50),
  CONSTRAINT "contact_custom_fields_check" CHECK (jsonb_typeof("custom_fields") = 'object'),
  CONSTRAINT "contact_source_check"
    CHECK ("source" IN ('import', 'form', 'manual', 'crm', 'booking')),
  CONSTRAINT "contact_merged_check" CHECK ("merged_into_id" IS NULL OR "merged_into_id" <> "id")
);

-- one marketing contact per ClientDesk contact / EasyBook client (among those not merged)
CREATE UNIQUE INDEX "contact_crm_contact_key" ON "marketing"."contact"
  ("organization_id", "crm_contact_id")
  WHERE "crm_contact_id" IS NOT NULL AND "merged_into_id" IS NULL;
CREATE UNIQUE INDEX "contact_booking_client_key" ON "marketing"."contact"
  ("organization_id", "booking_client_id")
  WHERE "booking_client_id" IS NOT NULL AND "merged_into_id" IS NULL;
-- the exact match of the duplicates (same e-mail or same phone)
CREATE INDEX "contact_email_idx" ON "marketing"."contact" ("organization_id", "email")
  WHERE "email" IS NOT NULL AND "merged_into_id" IS NULL;
CREATE INDEX "contact_phone_idx" ON "marketing"."contact" ("organization_id", "phone")
  WHERE "phone" IS NOT NULL AND "merged_into_id" IS NULL;
CREATE INDEX "contact_list_idx" ON "marketing"."contact" ("organization_id", "created_at" DESC)
  WHERE "merged_into_id" IS NULL;

CREATE TRIGGER contact_touch
  BEFORE UPDATE ON "marketing"."contact"
  FOR EACH ROW EXECUTE FUNCTION marketing.touch_updated_at();

CREATE TABLE "marketing"."contact_event" (
  "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID         NOT NULL,
  "contact_id"      UUID         NOT NULL,
  "kind"            VARCHAR(16)  NOT NULL,
  "channel"         VARCHAR(8),
  "campaign_id"     UUID,
  "occurred_at"     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "contact_event_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contact_event_contact_id_fkey" FOREIGN KEY ("organization_id", "contact_id")
    REFERENCES "marketing"."contact" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "contact_event_kind_check"
    CHECK ("kind" IN ('sent', 'delivered', 'opened', 'clicked', 'unsubscribed', 'form')),
  CONSTRAINT "contact_event_channel_check"
    CHECK ("channel" IS NULL OR "channel" IN ('email', 'sms', 'whatsapp'))
);
CREATE INDEX "contact_event_contact_idx" ON "marketing"."contact_event"
  ("organization_id", "contact_id", "occurred_at" DESC);

CREATE TABLE "marketing"."duplicate_dismissal" (
  "organization_id"      UUID        NOT NULL,
  "contact_a_id"         UUID        NOT NULL,
  "contact_b_id"         UUID        NOT NULL,
  "dismissed_by_user_id" UUID        NOT NULL,
  "dismissed_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "duplicate_dismissal_pkey" PRIMARY KEY ("organization_id", "contact_a_id", "contact_b_id"),
  -- the pair is stored once, in order
  CONSTRAINT "duplicate_dismissal_order_check" CHECK ("contact_a_id" < "contact_b_id"),
  CONSTRAINT "duplicate_dismissal_a_fkey" FOREIGN KEY ("organization_id", "contact_a_id")
    REFERENCES "marketing"."contact" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "duplicate_dismissal_b_fkey" FOREIGN KEY ("organization_id", "contact_b_id")
    REFERENCES "marketing"."contact" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- RLS (D-SEC-1): USING + WITH CHECK on app.organization_id
ALTER TABLE "marketing"."contact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "marketing"."contact_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "marketing"."duplicate_dismissal" ENABLE ROW LEVEL SECURITY;

CREATE POLICY marketing_rw_contact ON "marketing"."contact" TO marketing_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY marketing_rw_contact_event ON "marketing"."contact_event" TO marketing_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY marketing_rw_duplicate_dismissal ON "marketing"."duplicate_dismissal" TO marketing_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Grants: explicit, no DELETE; the history and the dismissals are append-only; on contact no
-- UPDATE of id / organization_id / source / created_*
REVOKE ALL ON "marketing"."contact", "marketing"."contact_event", "marketing"."duplicate_dismissal"
  FROM PUBLIC;
GRANT SELECT, INSERT ON "marketing"."contact" TO marketing_rw;
GRANT UPDATE ("name", "email", "phone", "locale", "tags", "custom_fields", "crm_contact_id",
              "booking_client_id", "archived_at", "merged_into_id", "updated_at")
  ON "marketing"."contact" TO marketing_rw;
GRANT SELECT, INSERT ON "marketing"."contact_event", "marketing"."duplicate_dismissal"
  TO marketing_rw;

-- ── The GDPR erasure (review #192), on the model of booking.erase_client ─────────────────────────
-- Empties the personal data of the contact and of the contacts merged into it (name, e-mail,
-- phone, tags, custom fields, locale, the ClientDesk / EasyBook links) and marks them erased, in
-- the business of the transaction; no DELETE. The history keeps only kinds, channels and dates
-- (no personal data) and stays. The suppression list of core/consent (only the hash) is not
-- touched: an erased person stays unsubscribed. Returns how many contacts were erased (0 if done).
CREATE OR REPLACE FUNCTION marketing.erase_contact(p_contact UUID, p_user UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_org UUID := NULLIF(current_setting('app.organization_id', true), '')::uuid;
  v_erased TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no organization in the transaction' USING ERRCODE = '42501';
  END IF;
  IF p_user IS NULL THEN
    RAISE EXCEPTION 'the user who erases is required' USING ERRCODE = '23502';
  END IF;

  SELECT c.erased_at INTO v_erased
    FROM marketing.contact c
   WHERE c.id = p_contact AND c.organization_id = v_org AND c.merged_into_id IS NULL
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contact % not found', p_contact USING ERRCODE = 'P0002';
  END IF;
  IF v_erased IS NOT NULL THEN
    RETURN 0;
  END IF;

  UPDATE marketing.contact c
     SET name = NULL, email = NULL, phone = NULL, locale = NULL, tags = '{}',
         custom_fields = '{}'::jsonb, crm_contact_id = NULL, booking_client_id = NULL,
         erased_at = now(), erased_by_user_id = p_user,
         archived_at = COALESCE(c.archived_at, now())
   WHERE c.organization_id = v_org
     AND (c.id = p_contact OR c.merged_into_id = p_contact)
     AND c.erased_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION marketing.erase_contact(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marketing.erase_contact(UUID, UUID) TO marketing_rw;

-- An erased contact stays erased: no UPDATE brings the personal data back (whoever writes).
CREATE OR REPLACE FUNCTION marketing.contact_erased_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF OLD.erased_at IS NOT NULL THEN
    RAISE EXCEPTION 'an erased contact cannot be changed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION marketing.contact_erased_guard() FROM PUBLIC;

CREATE TRIGGER contact_erased_guard
  BEFORE UPDATE ON "marketing"."contact"
  FOR EACH ROW EXECUTE FUNCTION marketing.contact_erased_guard();
