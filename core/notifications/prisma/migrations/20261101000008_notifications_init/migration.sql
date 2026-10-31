-- Lot 4.3 (FAZA-4, ARCHITECTURE §4, brief §36): modelul notificărilor și livrarea.
-- Schema `notifications`, rolul `notifications_rw` (NOLOGIN NOINHERIT, membru al app_runtime), RLS.
--   notification            → în aplicație, câte una pe destinatar; categoria obligatorie (D4-5)
--   delivery                → livrarea pe un canal (e-mail acum; SMS / WhatsApp mai târziu, D4-7),
--                             cu stare, reîncercări și motiv. Canalul nu are CHECK: un canal nou
--                             nu schimbă modelul.
--   notification_preference → pe persoană, categorie și canal (D4-6)

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'notifications_rw') THEN
    CREATE ROLE notifications_rw NOLOGIN NOINHERIT;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT notifications_rw TO app_runtime;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS "notifications";
GRANT USAGE ON SCHEMA "notifications" TO notifications_rw;

CREATE TABLE "notifications"."notification" (
  "id"                UUID         NOT NULL,
  "organization_id"   UUID,
  "recipient_user_id" UUID         NOT NULL,
  "category"          VARCHAR(16)  NOT NULL,
  "display_group"     VARCHAR(16)  NOT NULL,
  "type"              VARCHAR(128) NOT NULL,
  "version"           INTEGER      NOT NULL,
  "params"            JSONB        NOT NULL DEFAULT '{}',
  "action_url"        VARCHAR(512),
  "dedup_key"         VARCHAR(255) NOT NULL,
  "valid_until"       TIMESTAMPTZ,
  "read_at"           TIMESTAMPTZ,
  "created_at"        TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "notification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_category_check" CHECK ("category" IN ('operational', 'commercial')),
  CONSTRAINT "notification_display_group_check"
    CHECK ("display_group" IN ('operational', 'activity', 'recommendation')),
  CONSTRAINT "notification_version_check" CHECK ("version" >= 1)
);

CREATE UNIQUE INDEX "notification_recipient_user_id_dedup_key_key"
  ON "notifications"."notification" ("recipient_user_id", "dedup_key");
CREATE INDEX "notification_recipient_user_id_created_at_idx"
  ON "notifications"."notification" ("recipient_user_id", "created_at");
CREATE INDEX "notification_recipient_user_id_type_created_at_idx"
  ON "notifications"."notification" ("recipient_user_id", "type", "created_at");

CREATE TABLE "notifications"."delivery" (
  "id"                UUID        NOT NULL,
  "notification_id"   UUID        NOT NULL,
  "organization_id"   UUID,
  "recipient_user_id" UUID        NOT NULL,
  "channel"           VARCHAR(32) NOT NULL,
  "status"            VARCHAR(16) NOT NULL DEFAULT 'pending',
  "attempts"          INTEGER     NOT NULL DEFAULT 0,
  "next_attempt_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "last_error"        TEXT,
  "sent_at"           TIMESTAMPTZ,
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "delivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "delivery_status_check" CHECK ("status" IN ('pending', 'sent', 'failed', 'cancelled')),
  CONSTRAINT "delivery_attempts_check" CHECK ("attempts" >= 0)
);

ALTER TABLE "notifications"."delivery"
  ADD CONSTRAINT "delivery_notification_id_fkey" FOREIGN KEY ("notification_id")
  REFERENCES "notifications"."notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "delivery_notification_id_channel_key"
  ON "notifications"."delivery" ("notification_id", "channel");
CREATE INDEX "delivery_pending_idx"
  ON "notifications"."delivery" ("next_attempt_at") WHERE "status" = 'pending';

CREATE TABLE "notifications"."notification_preference" (
  "user_id"    UUID        NOT NULL,
  "category"   VARCHAR(16) NOT NULL,
  "channel"    VARCHAR(32) NOT NULL,
  "enabled"    BOOLEAN     NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "notification_preference_pkey" PRIMARY KEY ("user_id", "category", "channel"),
  CONSTRAINT "notification_preference_category_check"
    CHECK ("category" IN ('operational', 'commercial'))
);

-- Fără DELETE: notificările și livrările se păstrează (retenția: D4-18).
GRANT SELECT, INSERT, UPDATE ON "notifications"."notification" TO notifications_rw;
GRANT SELECT, INSERT, UPDATE ON "notifications"."delivery" TO notifications_rw;
GRANT SELECT, INSERT, UPDATE ON "notifications"."notification_preference" TO notifications_rw;

ALTER TABLE "notifications"."notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications"."delivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications"."notification_preference" ENABLE ROW LEVEL SECURITY;

-- Destinatarul își vede și își marchează notificările (app.user_id). Cine trimite scrie în
-- contextul organizației (app.organization_id, ca dispecerul din plic); o notificare de cont, fără
-- organizație, doar în afara contextului unei organizații.
CREATE POLICY notifications_rw_notification_read ON "notifications"."notification"
  FOR SELECT TO notifications_rw
  USING (
    recipient_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
    OR organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid
  );
CREATE POLICY notifications_rw_notification_insert ON "notifications"."notification"
  FOR INSERT TO notifications_rw
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid
    OR (organization_id IS NULL
        AND NULLIF(current_setting('app.organization_id', true), '') IS NULL)
  );
CREATE POLICY notifications_rw_notification_update ON "notifications"."notification"
  FOR UPDATE TO notifications_rw
  USING (recipient_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (recipient_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);

-- Livrarea: scrisă cu notificarea (contextul organizației), procesată de job-ul de livrare în
-- contextul destinatarului (app.user_id din rând).
CREATE POLICY notifications_rw_delivery ON "notifications"."delivery"
  TO notifications_rw
  USING (
    recipient_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
    OR organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid
  )
  WITH CHECK (
    recipient_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
    OR organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid
    OR (organization_id IS NULL
        AND NULLIF(current_setting('app.organization_id', true), '') IS NULL)
  );

CREATE POLICY notifications_rw_preference ON "notifications"."notification_preference"
  TO notifications_rw
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);

-- Ce livrări așteaptă, pentru toți destinatarii: doar id-ul și destinatarul (ca outbox_pending);
-- fiecare livrare se procesează apoi sub RLS, în contextul destinatarului.
CREATE OR REPLACE FUNCTION "notifications".pending_deliveries(p_limit INTEGER)
RETURNS TABLE (id UUID, recipient_user_id UUID, organization_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT d.id, d.recipient_user_id, d.organization_id
    FROM "notifications".delivery d
   WHERE d.status = 'pending'
     AND d.next_attempt_at <= now()
   ORDER BY d.next_attempt_at, d.created_at, d.id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 100);
$$;

REVOKE ALL ON FUNCTION "notifications".pending_deliveries(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "notifications".pending_deliveries(INTEGER) TO notifications_rw;
