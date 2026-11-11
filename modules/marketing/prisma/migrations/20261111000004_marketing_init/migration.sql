-- Lot MK.1 (plans/CAMPAIGNKIT.md; rolul marketing_rw APROBAT de fondatoare pe 11.11.2026): schema
-- marketing (CampaignKit). The role marketing_rw (NOLOGIN NOINHERIT, granted only to app_runtime),
-- RLS on app.organization_id (D-SEC-1). No Founder access: no founder role reads this schema.
--
--   settings → the CampaignKit settings of a business (CampaignKitSettings, S139), one row, written
--              on the first save (until then the contract answers the defaults):
--     sender_name / reply_to          — „De la” and where the replies go (Expeditorul)
--     cap_messages / cap_days         — the frequency cap (D-CK-15 = a: 2 in 7 days; 1–4 in 7–30)
--     sms_from_minute / sms_to_minute — the SMS window, Romania's time (D-CK-15: 9:00–20:00 at most)
--     skip_sunday / skip_saturday / skip_holidays — the days without sending
--     member_approval                 — members' campaigns go through approval (D-CK-14 = a)
--
-- The consent is never read here: only through core/consent (consent_rw). The company data of the
-- footer comes from the Hub (billing details), read-only. No outbox yet: it comes with the first
-- lot that emits a marketing.* event. No DELETE (§6.4 c); no UPDATE of organization_id / created_at.

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'marketing_rw') THEN
    CREATE ROLE marketing_rw NOLOGIN NOINHERIT;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT marketing_rw TO app_runtime;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS "marketing";
GRANT USAGE ON SCHEMA "marketing" TO marketing_rw;

-- CreateTable
CREATE TABLE "marketing"."settings" (
  "organization_id"    UUID         NOT NULL,
  "sender_name"        VARCHAR(80),
  "reply_to"           VARCHAR(254),
  "cap_messages"       SMALLINT     NOT NULL DEFAULT 2,
  "cap_days"           SMALLINT     NOT NULL DEFAULT 7,
  "sms_from_minute"    SMALLINT     NOT NULL DEFAULT 540,
  "sms_to_minute"      SMALLINT     NOT NULL DEFAULT 1200,
  "skip_sunday"        BOOLEAN      NOT NULL DEFAULT true,
  "skip_saturday"      BOOLEAN      NOT NULL DEFAULT false,
  "skip_holidays"      BOOLEAN      NOT NULL DEFAULT true,
  "member_approval"    BOOLEAN      NOT NULL DEFAULT true,
  "updated_by_user_id" UUID         NOT NULL,
  "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "settings_pkey" PRIMARY KEY ("organization_id"),
  CONSTRAINT "settings_sender_name_check"
    CHECK ("sender_name" IS NULL OR char_length(btrim("sender_name")) BETWEEN 1 AND 80),
  CONSTRAINT "settings_reply_to_check"
    CHECK ("reply_to" IS NULL OR "reply_to" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  CONSTRAINT "settings_cap_messages_check" CHECK ("cap_messages" BETWEEN 1 AND 4),
  CONSTRAINT "settings_cap_days_check" CHECK ("cap_days" BETWEEN 7 AND 30),
  CONSTRAINT "settings_sms_window_check" CHECK (
    "sms_from_minute" >= 540 AND "sms_to_minute" <= 1200 AND "sms_from_minute" < "sms_to_minute")
);

CREATE OR REPLACE FUNCTION marketing.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION marketing.touch_updated_at() FROM PUBLIC;

CREATE TRIGGER settings_touch
  BEFORE UPDATE ON "marketing"."settings"
  FOR EACH ROW EXECUTE FUNCTION marketing.touch_updated_at();

-- RLS (D-SEC-1): USING + WITH CHECK on app.organization_id
ALTER TABLE "marketing"."settings" ENABLE ROW LEVEL SECURITY;

CREATE POLICY marketing_rw_settings ON "marketing"."settings"
  TO marketing_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Grants: explicit per table and per column; no DELETE; no UPDATE of organization_id / created_at.
REVOKE ALL ON "marketing"."settings" FROM PUBLIC;
GRANT SELECT, INSERT ON "marketing"."settings" TO marketing_rw;
GRANT UPDATE ("sender_name", "reply_to", "cap_messages", "cap_days", "sms_from_minute",
              "sms_to_minute", "skip_sunday", "skip_saturday", "skip_holidays", "member_approval",
              "updated_by_user_id", "updated_at")
  ON "marketing"."settings" TO marketing_rw;
