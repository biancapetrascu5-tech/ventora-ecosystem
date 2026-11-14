-- Lotul 5.8b / FounderNotifications (S136, P22; D4-29 a, D5-11 a): clopoțelul Founder.
-- Inboxul echipei Ventora, fără afacere: oprirea automată Growth, solicitările de suport noi,
-- facturile neemise, cererile de configurare.
--
--   founder_notification      → câte una pe eveniment (nu pe om), cu dedup; scrisă de Hub și de
--                               job-uri (notifications_rw, DOAR INSERT: o afacere nu poate citi
--                               inboxul Ventora)
--   founder_notification_read → cine din echipă a citit ce (pe fiecare om; „Marchează toate ca
--                               citite” scrie rândurile lui)
--
-- Rolul nou notifications_founder (aprobat de fondatoare pe 13.11.2026, cu lista exactă):
--   NOLOGIN NOINHERIT, membru al founder_runtime; SELECT pe founder_notification; SELECT, INSERT
--   pe founder_notification_read, doar pe rândurile founder-ului curent (app.founder_id, RLS).
--   Fără UPDATE, fără DELETE, fără drepturi PUBLIC. Fără GRANT pe rolul altui modul.

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'notifications_founder') THEN
    CREATE ROLE notifications_founder NOLOGIN NOINHERIT;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    GRANT notifications_founder TO founder_runtime;
  END IF;
END $$;

GRANT USAGE ON SCHEMA "notifications" TO notifications_founder;

CREATE TABLE "notifications"."founder_notification" (
  "id"         UUID         NOT NULL,
  "type"       VARCHAR(64)  NOT NULL,
  "version"    INTEGER      NOT NULL,
  "params"     JSONB        NOT NULL DEFAULT '{}',
  "action_url" VARCHAR(500),
  "dedup_key"  VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "founder_notification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "founder_notification_dedup_key_key"
  ON "notifications"."founder_notification" ("dedup_key");
CREATE INDEX "founder_notification_created_at_idx"
  ON "notifications"."founder_notification" ("created_at");

CREATE TABLE "notifications"."founder_notification_read" (
  "founder_id"      VARCHAR(64) NOT NULL,
  "notification_id" UUID        NOT NULL,
  "read_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "founder_notification_read_pkey" PRIMARY KEY ("founder_id", "notification_id"),
  CONSTRAINT "founder_notification_read_notification_fkey" FOREIGN KEY ("notification_id")
    REFERENCES "notifications"."founder_notification" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "founder_notification_read_notification_id_idx"
  ON "notifications"."founder_notification_read" ("notification_id");

REVOKE ALL ON "notifications"."founder_notification" FROM PUBLIC;
REVOKE ALL ON "notifications"."founder_notification_read" FROM PUBLIC;
REVOKE ALL ON "notifications"."founder_notification" FROM notifications_rw;
REVOKE ALL ON "notifications"."founder_notification_read" FROM notifications_rw;

-- notifications_rw: DOAR INSERT (fără SELECT, fără RETURNING în cod)
GRANT INSERT ON "notifications"."founder_notification" TO notifications_rw;
-- notifications_founder: citește inboxul; citit / necitit doar pentru el
GRANT SELECT ON "notifications"."founder_notification" TO notifications_founder;
GRANT SELECT, INSERT ON "notifications"."founder_notification_read" TO notifications_founder;

ALTER TABLE "notifications"."founder_notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications"."founder_notification_read" ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_rw_founder_notification_insert
  ON "notifications"."founder_notification"
  FOR INSERT TO notifications_rw
  WITH CHECK (true);

CREATE POLICY notifications_founder_notification_select
  ON "notifications"."founder_notification"
  FOR SELECT TO notifications_founder
  USING (true);

CREATE POLICY notifications_founder_read_select
  ON "notifications"."founder_notification_read"
  FOR SELECT TO notifications_founder
  USING (founder_id = NULLIF(current_setting('app.founder_id', true), ''));

CREATE POLICY notifications_founder_read_insert
  ON "notifications"."founder_notification_read"
  FOR INSERT TO notifications_founder
  WITH CHECK (founder_id = NULLIF(current_setting('app.founder_id', true), ''));
