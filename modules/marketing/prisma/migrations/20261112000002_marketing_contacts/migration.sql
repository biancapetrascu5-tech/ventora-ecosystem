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
  "created_by_user_id" UUID,
  "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "contact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contact_merged_into_id_fkey" FOREIGN KEY ("merged_into_id")
    REFERENCES "marketing"."contact" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  -- a marketing contact is reachable: an e-mail or a phone
  CONSTRAINT "contact_reachable_check" CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL),
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
  CONSTRAINT "contact_event_contact_id_fkey" FOREIGN KEY ("contact_id")
    REFERENCES "marketing"."contact" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
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
  CONSTRAINT "duplicate_dismissal_a_fkey" FOREIGN KEY ("contact_a_id")
    REFERENCES "marketing"."contact" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "duplicate_dismissal_b_fkey" FOREIGN KEY ("contact_b_id")
    REFERENCES "marketing"."contact" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT
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
