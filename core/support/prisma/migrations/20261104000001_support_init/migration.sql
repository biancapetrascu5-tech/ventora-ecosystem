-- Lot 4.6 (FAZA-4; brief §39; D4-13 = a, D4-14 = b, D4-15 = b; S116-D18): solicitările de suport.
-- Schema `support`, rolurile `support_rw` (Hub, app_runtime) și `support_founder` (Founder,
-- founder_runtime), ambele NOLOGIN NOINHERIT, cu RLS pe app.organization_id (D-SEC-1).
--
--   support_request      → solicitarea: organizația, persoana, aplicația, subiectul, descrierea,
--                          urgența („Normal” / „Mă blochează”), starea, responsabilul (intern,
--                          doar în Founder), referința (VS-AAAA-NNNN), termenele
--   support_message      → firul: mesajele afacerii și ale echipei Ventora Systems
--   support_attachment   → legătura mesaj ↔ fișier; fișierul e în core/files (4.7: PNG / JPEG /
--                          PDF, cel mult 10 MB, verificat pe server), cu proprietarul
--                          (support, request, <id>)
--   support_status_event → istoricul stării („Istoricul stării” din HubSupportThread)
--   outbox_events        → support.reply.posted, support.request.auto_close_warned /
--                          auto_closed (Lot 4.1), cu processed_events
--
-- Starea, o singură valoare în baza de date, afișată diferit (designul S116):
--   status              Founder        Hub
--   open                „Deschisă”     „În lucru”      (așteaptă echipa)
--   in_progress         „În lucru”     „În lucru”      (echipa a marcat-o)
--   awaiting_business   „În lucru”     „Răspuns nou”   (echipa a răspuns, așteaptă afacerea)
--   closed              „Închisă”      „Rezolvat”      (redeschisă din Hub → open)
--
-- Tranzițiile și câmpurile calculate (referința, termenul de răspuns, închiderea automată) le
-- impune triggerul support_request_guard, indiferent de cine scrie. Nicio ștergere.

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'support_rw') THEN
    CREATE ROLE support_rw NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'support_founder') THEN
    CREATE ROLE support_founder NOLOGIN NOINHERIT;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT support_rw TO app_runtime;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    GRANT support_founder TO founder_runtime;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS "support";
GRANT USAGE ON SCHEMA "support" TO support_rw, support_founder;

-- CreateTable
CREATE TABLE "support"."support_request" (
  "id"                     UUID         NOT NULL,
  "organization_id"        UUID         NOT NULL,
  -- VS-AAAA-NNNN, din ref_number (un singur șir, nu se reia anual); pus de trigger
  "ref_number"             BIGSERIAL    NOT NULL,
  "ref"                    VARCHAR(32)  NOT NULL,
  "application_id"         VARCHAR(64)  NOT NULL,
  "requester_user_id"      UUID         NOT NULL,
  "requester_name"         VARCHAR(255) NOT NULL,
  "subject"                VARCHAR(200) NOT NULL,
  "description"            TEXT         NOT NULL,
  "urgency"                VARCHAR(16)  NOT NULL DEFAULT 'normal',
  "status"                 VARCHAR(24)  NOT NULL DEFAULT 'open',
  -- D4-13 = a: responsabilul e intern, doar în Founder (un Founder, cu numele la momentul alegerii)
  "assignee_founder_id"    UUID,
  "assignee_name"          VARCHAR(255),
  -- D4-15 = b: termenul răspunsului echipei („în cel mult o zi lucrătoare”), cât timp așteaptă echipa
  "response_due_at"        TIMESTAMPTZ,
  -- S116-D18: 7 zile fără răspuns de la afacere după răspunsul echipei → închisă automat;
  -- e-mailul cu o zi înainte se marchează în auto_close_warned_at
  "auto_close_at"          TIMESTAMPTZ,
  "auto_close_warned_at"   TIMESTAMPTZ,
  "last_message_at"        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "last_message_by"        VARCHAR(16)  NOT NULL DEFAULT 'business',
  "last_message_name"      VARCHAR(255) NOT NULL,
  "closed_at"              TIMESTAMPTZ,
  "closed_by_type"         VARCHAR(16),
  "created_at"             TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"             TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "support_request_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "support_request_application_check"
    CHECK ("application_id" ~ '^[a-z][a-z0-9_-]{0,63}$'),
  CONSTRAINT "support_request_subject_check"
    CHECK (char_length(btrim("subject")) BETWEEN 1 AND 200),
  CONSTRAINT "support_request_description_check"
    CHECK (char_length(btrim("description")) BETWEEN 1 AND 5000),
  CONSTRAINT "support_request_urgency_check" CHECK ("urgency" IN ('normal', 'blocking')),
  CONSTRAINT "support_request_status_check"
    CHECK ("status" IN ('open', 'in_progress', 'awaiting_business', 'closed')),
  CONSTRAINT "support_request_last_message_by_check"
    CHECK ("last_message_by" IN ('business', 'team')),
  CONSTRAINT "support_request_assignee_check"
    CHECK (("assignee_founder_id" IS NULL) = ("assignee_name" IS NULL)),
  CONSTRAINT "support_request_closed_check" CHECK (
    ("status" = 'closed') = ("closed_at" IS NOT NULL)
    AND ("closed_at" IS NULL) = ("closed_by_type" IS NULL)
  ),
  CONSTRAINT "support_request_closed_by_type_check"
    CHECK ("closed_by_type" IS NULL OR "closed_by_type" IN ('team', 'system')),
  CONSTRAINT "support_request_auto_close_check"
    CHECK (("status" = 'awaiting_business') = ("auto_close_at" IS NOT NULL))
);

CREATE UNIQUE INDEX "support_request_ref_key" ON "support"."support_request" ("ref");
CREATE UNIQUE INDEX "support_request_ref_number_key" ON "support"."support_request" ("ref_number");
-- Hub: „Solicitările mele”, cele mai noi întâi
CREATE INDEX "support_request_organization_id_requester_idx"
  ON "support"."support_request" ("organization_id", "requester_user_id", "last_message_at");
-- Founder: lista pe stare, cele mai vechi mesaje fără răspuns întâi
CREATE INDEX "support_request_status_last_message_idx"
  ON "support"."support_request" ("status", "last_message_at");
-- Job-ul închiderii automate
CREATE INDEX "support_request_auto_close_idx"
  ON "support"."support_request" ("auto_close_at")
  WHERE "status" = 'awaiting_business';

-- CreateTable
CREATE TABLE "support"."support_message" (
  "id"              UUID         NOT NULL,
  "organization_id" UUID         NOT NULL,
  "request_id"      UUID         NOT NULL,
  -- business: o persoană din afacere (users.id); team: un Founder (founder_identity.users.id)
  "author_type"     VARCHAR(16)  NOT NULL,
  "author_id"       UUID         NOT NULL,
  "author_name"     VARCHAR(255) NOT NULL,
  "body"            TEXT         NOT NULL,
  -- message; reopen = mesajul cu care afacerea redeschide („Ce s-a întâmplat din nou?”)
  "kind"            VARCHAR(16)  NOT NULL DEFAULT 'message',
  "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "support_message_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "support_message_request_id_fkey" FOREIGN KEY ("request_id")
    REFERENCES "support"."support_request" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "support_message_author_type_check" CHECK ("author_type" IN ('business', 'team')),
  CONSTRAINT "support_message_body_check" CHECK (char_length(btrim("body")) BETWEEN 1 AND 5000),
  CONSTRAINT "support_message_kind_check" CHECK (
    "kind" = 'message' OR ("kind" = 'reopen' AND "author_type" = 'business')
  )
);

CREATE INDEX "support_message_request_id_created_at_idx"
  ON "support"."support_message" ("request_id", "created_at");

-- CreateTable
CREATE TABLE "support"."support_attachment" (
  "message_id"      UUID         NOT NULL,
  "file_id"         UUID         NOT NULL,
  "organization_id" UUID         NOT NULL,
  "request_id"      UUID         NOT NULL,
  "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "support_attachment_pkey" PRIMARY KEY ("message_id", "file_id"),
  CONSTRAINT "support_attachment_message_id_fkey" FOREIGN KEY ("message_id")
    REFERENCES "support"."support_message" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- un fișier aparține unui singur mesaj
CREATE UNIQUE INDEX "support_attachment_file_id_key" ON "support"."support_attachment" ("file_id");

-- CreateTable
CREATE TABLE "support"."support_status_event" (
  "id"              UUID         NOT NULL,
  "organization_id" UUID         NOT NULL,
  "request_id"      UUID         NOT NULL,
  -- opened | marked_in_progress | team_reply | business_reply | closed | auto_closed | reopened
  "kind"            VARCHAR(24)  NOT NULL,
  "status_from"     VARCHAR(24),
  "status_to"       VARCHAR(24)  NOT NULL,
  "actor_type"      VARCHAR(16)  NOT NULL,
  "actor_id"        UUID,
  "actor_name"      VARCHAR(255),
  "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "support_status_event_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "support_status_event_request_id_fkey" FOREIGN KEY ("request_id")
    REFERENCES "support"."support_request" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "support_status_event_kind_check" CHECK ("kind" IN (
    'opened', 'marked_in_progress', 'team_reply', 'business_reply', 'closed', 'auto_closed',
    'reopened'
  )),
  CONSTRAINT "support_status_event_actor_check" CHECK (
    ("actor_type" IN ('business', 'team') AND "actor_id" IS NOT NULL AND "actor_name" IS NOT NULL)
    OR ("actor_type" = 'system' AND "actor_id" IS NULL)
  )
);

CREATE INDEX "support_status_event_request_id_created_at_idx"
  ON "support"."support_status_event" ("request_id", "created_at");

-- Termenul răspunsului echipei (D4-15 = b): ziua lucrătoare următoare, la aceeași oră, în
-- Europe/Bucharest; sâmbăta și duminica sar. PROPUS: fără sărbătorile legale (NECESITĂ DECIZIE).
CREATE OR REPLACE FUNCTION support.next_business_day(p_from TIMESTAMPTZ)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_local TIMESTAMP := (p_from AT TIME ZONE 'Europe/Bucharest') + INTERVAL '1 day';
BEGIN
  WHILE extract(isodow FROM v_local) IN (6, 7) LOOP
    v_local := v_local + INTERVAL '1 day';
  END LOOP;
  RETURN v_local AT TIME ZONE 'Europe/Bucharest';
END $$;

-- Pe server, indiferent de interfață: ce se poate pune la creare, ce câmpuri nu se mai schimbă,
-- tranzițiile permise și câmpurile calculate.
CREATE OR REPLACE FUNCTION support.support_request_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.updated_at := now();
    NEW.ref := 'VS-' || to_char(now() AT TIME ZONE 'Europe/Bucharest', 'YYYY') || '-'
               || lpad(NEW.ref_number::text, 4, '0');
    NEW.status := 'open';
    NEW.assignee_founder_id := NULL;
    NEW.assignee_name := NULL;
    NEW.closed_at := NULL;
    NEW.closed_by_type := NULL;
    NEW.auto_close_at := NULL;
    NEW.auto_close_warned_at := NULL;
    NEW.last_message_at := now();
    NEW.last_message_by := 'business';
    NEW.last_message_name := NEW.requester_name;
    NEW.response_due_at := support.next_business_day(now());
    RETURN NEW;
  END IF;

  IF (NEW.id, NEW.organization_id, NEW.ref_number, NEW.ref, NEW.application_id,
      NEW.requester_user_id, NEW.requester_name, NEW.subject, NEW.description, NEW.urgency,
      NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.organization_id, OLD.ref_number, OLD.ref, OLD.application_id,
      OLD.requester_user_id, OLD.requester_name, OLD.subject, OLD.description, OLD.urgency,
      OLD.created_at) THEN
    RAISE EXCEPTION 'support_request %: only the status, the assignee and the thread may change', OLD.id
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'open'              AND NEW.status IN ('in_progress', 'awaiting_business', 'closed'))
    OR (OLD.status = 'in_progress'       AND NEW.status IN ('open', 'awaiting_business', 'closed'))
    OR (OLD.status = 'awaiting_business' AND NEW.status IN ('open', 'in_progress', 'closed'))
    OR (OLD.status = 'closed'            AND NEW.status = 'open')
  ) THEN
    RAISE EXCEPTION 'support_request %: % → % is not allowed', OLD.id, OLD.status, NEW.status
      USING ERRCODE = 'P0001';
  END IF;

  NEW.updated_at := now();

  IF NEW.status = 'closed' THEN
    IF OLD.status <> 'closed' THEN
      NEW.closed_at := now();
    END IF;
  ELSE
    NEW.closed_at := NULL;
    NEW.closed_by_type := NULL;
  END IF;

  -- D4-15 = b: termenul curge doar cât timp solicitarea așteaptă echipa
  IF NEW.status = 'open' THEN
    IF OLD.status <> 'open' THEN
      NEW.response_due_at := support.next_business_day(now());
    END IF;
  ELSE
    NEW.response_due_at := NULL;
  END IF;

  -- S116-D18: 7 zile de la ultimul răspuns al echipei, cât timp așteaptă afacerea
  IF NEW.status = 'awaiting_business' THEN
    IF OLD.status <> 'awaiting_business' OR NEW.last_message_at IS DISTINCT FROM OLD.last_message_at THEN
      NEW.auto_close_at := NEW.last_message_at + INTERVAL '7 days';
      NEW.auto_close_warned_at := NULL;
    END IF;
  ELSE
    NEW.auto_close_at := NULL;
    NEW.auto_close_warned_at := NULL;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER support_request_guard
  BEFORE INSERT OR UPDATE ON "support"."support_request"
  FOR EACH ROW EXECUTE FUNCTION support.support_request_guard();

-- Un mesaj, un atașament și un eveniment de stare stau în organizația solicitării lor.
CREATE OR REPLACE FUNCTION support.support_child_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_org UUID;
BEGIN
  SELECT r.organization_id INTO v_org FROM support.support_request r WHERE r.id = NEW.request_id;
  IF v_org IS NULL OR v_org <> NEW.organization_id THEN
    RAISE EXCEPTION '%: organization_id differs from the request''s', TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER support_message_guard
  BEFORE INSERT ON "support"."support_message"
  FOR EACH ROW EXECUTE FUNCTION support.support_child_guard();
CREATE TRIGGER support_attachment_guard
  BEFORE INSERT ON "support"."support_attachment"
  FOR EACH ROW EXECUTE FUNCTION support.support_child_guard();
CREATE TRIGGER support_status_event_guard
  BEFORE INSERT ON "support"."support_status_event"
  FOR EACH ROW EXECUTE FUNCTION support.support_child_guard();

-- RLS: T1 / T2, totul doar în contextul organizației (app.organization_id), eșec sigur.
ALTER TABLE "support"."support_request" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support"."support_message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support"."support_attachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support"."support_status_event" ENABLE ROW LEVEL SECURITY;

CREATE POLICY support_rw_support_request ON "support"."support_request"
  TO support_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY support_founder_support_request ON "support"."support_request"
  TO support_founder
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY support_rw_support_message ON "support"."support_message"
  TO support_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY support_founder_support_message ON "support"."support_message"
  TO support_founder
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY support_rw_support_attachment ON "support"."support_attachment"
  TO support_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY support_founder_support_attachment ON "support"."support_attachment"
  TO support_founder
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY support_rw_support_status_event ON "support"."support_status_event"
  TO support_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY support_founder_support_status_event ON "support"."support_status_event"
  TO support_founder
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Grants: nimeni nu șterge. Afacerea creează solicitarea și scrie în fir (răspunsul, redeschiderea:
-- schimbă starea); echipa nu creează solicitări, scrie în fir și schimbă starea și responsabilul.
REVOKE ALL ON "support"."support_request", "support"."support_message",
  "support"."support_attachment", "support"."support_status_event" FROM PUBLIC;

GRANT SELECT, INSERT ON "support"."support_request" TO support_rw;
GRANT UPDATE ("status", "closed_by_type", "last_message_at", "last_message_by", "last_message_name",
  "auto_close_warned_at") ON "support"."support_request" TO support_rw;
GRANT USAGE ON SEQUENCE "support"."support_request_ref_number_seq" TO support_rw;
GRANT SELECT, INSERT ON "support"."support_message", "support"."support_attachment",
  "support"."support_status_event" TO support_rw;

GRANT SELECT ON "support"."support_request" TO support_founder;
GRANT UPDATE ("status", "closed_by_type", "assignee_founder_id", "assignee_name",
  "last_message_at", "last_message_by", "last_message_name") ON "support"."support_request"
  TO support_founder;
GRANT SELECT, INSERT ON "support"."support_message", "support"."support_attachment",
  "support"."support_status_event" TO support_founder;

-- Founder: lista din toate afacerile (RLS-ul lui support_founder vede o singură afacere pe
-- tranzacție). Doar câmpurile listei; firul se citește apoi în contextul afacerii.
--   p_group: 'open' (Deschise) | 'progress' (În lucru: in_progress + awaiting_business) | 'closed'
CREATE OR REPLACE FUNCTION support.founder_list_requests(
  p_group           TEXT,
  p_application_id  TEXT,
  p_organization_id UUID,
  p_search          TEXT,
  p_limit           INTEGER
)
RETURNS TABLE (
  id                UUID,
  organization_id   UUID,
  ref               VARCHAR(32),
  application_id    VARCHAR(64),
  subject           VARCHAR(200),
  urgency           VARCHAR(16),
  status            VARCHAR(24),
  requester_name    VARCHAR(255),
  assignee_name     VARCHAR(255),
  last_message_at   TIMESTAMPTZ,
  last_message_by   VARCHAR(16),
  last_message_name VARCHAR(255),
  response_due_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT r.id, r.organization_id, r.ref, r.application_id, r.subject, r.urgency, r.status,
         r.requester_name, r.assignee_name, r.last_message_at, r.last_message_by,
         r.last_message_name, r.response_due_at, r.created_at
    FROM support.support_request r
   WHERE CASE p_group
           WHEN 'open'     THEN r.status = 'open'
           WHEN 'progress' THEN r.status IN ('in_progress', 'awaiting_business')
           WHEN 'closed'   THEN r.status = 'closed'
           ELSE false
         END
     AND (p_application_id IS NULL OR r.application_id = p_application_id)
     AND (p_organization_id IS NULL OR r.organization_id = p_organization_id)
     AND (COALESCE(btrim(p_search), '') = ''
          OR r.ref ILIKE '%' || btrim(p_search) || '%'
          OR r.subject ILIKE '%' || btrim(p_search) || '%')
   -- Deschise: cele care așteaptă de cel mai mult timp, „Mă blochează” întâi
   ORDER BY CASE WHEN p_group = 'open' AND r.urgency = 'blocking' THEN 0 ELSE 1 END,
            CASE WHEN p_group = 'open' THEN r.last_message_at END ASC,
            r.last_message_at DESC, r.id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500);
$$;

-- Numerele din filtre și din Spine („Suport” cu numărul solicitărilor deschise).
CREATE OR REPLACE FUNCTION support.founder_request_counts()
RETURNS TABLE (open_count BIGINT, progress_count BIGINT, overdue_count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT count(*) FILTER (WHERE r.status = 'open'),
         count(*) FILTER (WHERE r.status IN ('in_progress', 'awaiting_business')),
         count(*) FILTER (WHERE r.status = 'open' AND r.response_due_at <= now())
    FROM support.support_request r
   WHERE r.status <> 'closed';
$$;

-- Job-ul închiderii automate (S116-D18), pe app_runtime ca support_rw: ce e de avertizat (cu o zi
-- înainte) și ce e de închis, în toate organizațiile, doar id-ul și organizația. Job-ul ia apoi
-- fiecare solicitare în contextul organizației ei, sub RLS.
CREATE OR REPLACE FUNCTION support.auto_close_due(p_limit INTEGER)
RETURNS TABLE (id UUID, organization_id UUID, action TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT r.id, r.organization_id,
         CASE WHEN r.auto_close_at <= now() THEN 'close' ELSE 'warn' END
    FROM support.support_request r
   WHERE r.status = 'awaiting_business'
     AND (r.auto_close_at <= now()
          OR (r.auto_close_warned_at IS NULL AND r.auto_close_at - INTERVAL '1 day' <= now()))
   ORDER BY r.auto_close_at, r.id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 100);
$$;

REVOKE ALL ON FUNCTION support.founder_list_requests(TEXT, TEXT, UUID, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION support.founder_request_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION support.auto_close_due(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION support.next_business_day(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION support.next_business_day(TIMESTAMPTZ) TO support_rw, support_founder;
GRANT EXECUTE ON FUNCTION support.auto_close_due(INTEGER) TO support_rw;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA "support" TO founder_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION support.founder_list_requests(TEXT, TEXT, UUID, TEXT, INTEGER) TO founder_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION support.founder_request_counts() TO founder_runtime';
  END IF;
END $$;

-- Outbox (Lot 4.1, ARCHITECTURE §11.2): generat de outboxMigrationSql('support', 'support_rw') din @ventora/db-kit.

CREATE TABLE "support"."outbox_events" (
  "event_id"        UUID         NOT NULL,
  "type"            VARCHAR(128) NOT NULL,
  "version"         INTEGER      NOT NULL,
  "occurred_at"     TIMESTAMPTZ  NOT NULL,
  "organization_id" UUID         NOT NULL,
  "source_app"      VARCHAR(64)  NOT NULL,
  "resource_id"     VARCHAR(255) NOT NULL,
  "correlation_id"  VARCHAR(255),
  "payload"         JSONB        NOT NULL,
  "status"          VARCHAR(16)  NOT NULL DEFAULT 'pending',
  "attempts"        INTEGER      NOT NULL DEFAULT 0,
  "available_at"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "last_error"      TEXT,
  "failed_at"       TIMESTAMPTZ,
  "dispatched_at"   TIMESTAMPTZ,
  "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("event_id"),
  CONSTRAINT "outbox_events_version_check" CHECK ("version" >= 1),
  CONSTRAINT "outbox_events_status_check" CHECK ("status" IN ('pending', 'dispatched', 'dead')),
  CONSTRAINT "outbox_events_attempts_check" CHECK ("attempts" >= 0)
);

CREATE INDEX "outbox_events_pending_idx"
  ON "support"."outbox_events" ("available_at", "occurred_at")
  WHERE "status" = 'pending';

CREATE INDEX "outbox_events_dead_idx"
  ON "support"."outbox_events" ("failed_at")
  WHERE "status" = 'dead';

-- Idempotența consumatorilor (D4-1 = a): un rând per (consumator, eveniment), scris în aceeași
-- tranzacție cu efectul consumatorului.
CREATE TABLE "support"."processed_events" (
  "consumer"        VARCHAR(128) NOT NULL,
  "event_id"        UUID         NOT NULL,
  "organization_id" UUID         NOT NULL,
  "processed_at"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "processed_events_pkey" PRIMARY KEY ("consumer", "event_id")
);

GRANT SELECT, INSERT, UPDATE ON "support"."outbox_events" TO support_rw;
GRANT SELECT, INSERT ON "support"."processed_events" TO support_rw;
REVOKE DELETE ON "support"."outbox_events" FROM support_rw;
REVOKE UPDATE, DELETE ON "support"."processed_events" FROM support_rw;

ALTER TABLE "support"."outbox_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support"."processed_events" ENABLE ROW LEVEL SECURITY;

CREATE POLICY support_rw_outbox_events ON "support"."outbox_events"
  TO support_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY support_rw_processed_events ON "support"."processed_events"
  TO support_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE OR REPLACE FUNCTION "support".outbox_pending(p_limit INTEGER)
RETURNS TABLE (event_id UUID, organization_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT e.event_id, e.organization_id
    FROM "support".outbox_events e
   WHERE e.status = 'pending'
     AND e.available_at <= now()
   ORDER BY e.available_at, e.occurred_at, e.event_id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 100);
$$;

CREATE OR REPLACE FUNCTION "support".outbox_dead_letters(p_limit INTEGER)
RETURNS TABLE (
  event_id        UUID,
  type            VARCHAR(128),
  version         INTEGER,
  organization_id UUID,
  source_app      VARCHAR(64),
  resource_id     VARCHAR(255),
  attempts        INTEGER,
  last_error      TEXT,
  occurred_at     TIMESTAMPTZ,
  failed_at       TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT e.event_id, e.type, e.version, e.organization_id, e.source_app, e.resource_id,
         e.attempts, e.last_error, e.occurred_at, e.failed_at
    FROM "support".outbox_events e
   WHERE e.status = 'dead'
   ORDER BY e.failed_at DESC, e.event_id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 500);
$$;

REVOKE ALL ON FUNCTION "support".outbox_pending(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION "support".outbox_dead_letters(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "support".outbox_pending(INTEGER) TO support_rw;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA "support" TO founder_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION "support".outbox_dead_letters(INTEGER) TO founder_runtime';
  END IF;
END $$;

-- Echipa scrie și ea evenimente (support.reply.posted, din Founder): același outbox, în contextul
-- afacerii; fără UPDATE (starea livrării o schimbă doar dispecerul, ca support_rw).
GRANT INSERT ON "support"."outbox_events" TO support_founder;

CREATE POLICY support_founder_outbox_events ON "support"."outbox_events"
  FOR INSERT TO support_founder
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
