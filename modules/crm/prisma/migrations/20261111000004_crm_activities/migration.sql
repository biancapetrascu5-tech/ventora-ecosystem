-- Lot CR.7 (plans/CRM.md §3; design S131 ClientDeskActivities): the activities of ClientDesk —
-- tasks („Next Action”), logged calls and meetings, logged e-mails, reminders — with the due date,
-- the owner, the priority, the record they belong to, and the reminder time.
--
--   activity → kind (task | call | meeting | email | reminder), title, note; due_on (the day) and,
--              optionally, due_at (the time: only timed activities show in the calendar);
--              remind_at (due_at minus the chosen lead time; sent by the reminders job once the
--              notification templates exist in core/notifications); open → done; the bin.
--   A call keeps its result and duration; a meeting its participants (members), the place and the
--   outcome. The record (contact | company | lead | deal) is optional: a task may stand alone.

-- CreateTable
CREATE TABLE "crm"."activity" (
  "id"                    UUID         NOT NULL,
  "organization_id"       UUID         NOT NULL,
  "kind"                  VARCHAR(8)   NOT NULL,
  "title"                 VARCHAR(200) NOT NULL,
  "note"                  VARCHAR(2000),
  "priority"              VARCHAR(6)   NOT NULL DEFAULT 'normal',
  "subject_type"          VARCHAR(7),
  "subject_id"            UUID,
  "owner_user_id"         UUID         NOT NULL,
  "due_on"                DATE,
  "due_at"                TIMESTAMPTZ,
  "duration_minutes"      INTEGER,
  "remind_before_minutes" INTEGER,
  "remind_at"             TIMESTAMPTZ,
  "reminded_at"           TIMESTAMPTZ,
  -- a call: answered | no_answer | voicemail | wrong_number
  "call_result"           VARCHAR(12),
  -- a meeting: client | salon | online | phone
  "meeting_place"         VARCHAR(6),
  "participant_user_ids"  UUID[]       NOT NULL DEFAULT '{}',
  "outcome"               VARCHAR(500),
  "status"                VARCHAR(4)   NOT NULL DEFAULT 'open',
  "done_at"               TIMESTAMPTZ,
  "done_by_user_id"       UUID,
  "deleted_at"            TIMESTAMPTZ,
  "deleted_by_user_id"    UUID,
  "created_by_user_id"    UUID         NOT NULL,
  "created_at"            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"            TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "activity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "activity_kind_check" CHECK ("kind" IN ('task', 'call', 'meeting', 'email', 'reminder')),
  CONSTRAINT "activity_title_check" CHECK (char_length(btrim("title")) >= 1),
  CONSTRAINT "activity_priority_check" CHECK ("priority" IN ('low', 'normal', 'high')),
  CONSTRAINT "activity_subject_check" CHECK (
    ("subject_type" IS NULL AND "subject_id" IS NULL)
    OR ("subject_type" IN ('contact', 'company', 'lead', 'deal') AND "subject_id" IS NOT NULL)
  ),
  -- a time needs its day
  CONSTRAINT "activity_due_check" CHECK ("due_at" IS NULL OR "due_on" IS NOT NULL),
  CONSTRAINT "activity_duration_check" CHECK ("duration_minutes" IS NULL OR "duration_minutes" BETWEEN 0 AND 1440),
  -- a reminder needs a time: at it, 15 minutes, an hour or a day before (S131)
  CONSTRAINT "activity_remind_check" CHECK (
    ("remind_before_minutes" IS NULL AND "remind_at" IS NULL)
    OR ("remind_before_minutes" IN (0, 15, 60, 1440) AND "due_at" IS NOT NULL AND "remind_at" IS NOT NULL)
  ),
  CONSTRAINT "activity_call_check" CHECK (
    "call_result" IS NULL OR ("kind" = 'call' AND "call_result" IN ('answered', 'no_answer', 'voicemail', 'wrong_number'))
  ),
  CONSTRAINT "activity_meeting_check" CHECK (
    "meeting_place" IS NULL OR ("kind" = 'meeting' AND "meeting_place" IN ('client', 'salon', 'online', 'phone'))
  ),
  CONSTRAINT "activity_participants_check" CHECK (cardinality("participant_user_ids") <= 20),
  CONSTRAINT "activity_status_check" CHECK (
    ("status" = 'open' AND "done_at" IS NULL AND "done_by_user_id" IS NULL)
    OR ("status" = 'done' AND "done_at" IS NOT NULL AND "done_by_user_id" IS NOT NULL)
  ),
  CONSTRAINT "activity_deleted_check" CHECK (("deleted_at" IS NULL) = ("deleted_by_user_id" IS NULL))
);

-- „Activitățile mele” / the team, by due date
CREATE INDEX "activity_owner_due_idx"
  ON "crm"."activity" ("organization_id", "owner_user_id", "status", "due_on");
-- the calendar (timed only)
CREATE INDEX "activity_due_at_idx" ON "crm"."activity" ("organization_id", "due_at");
-- the history of a record
CREATE INDEX "activity_subject_idx"
  ON "crm"."activity" ("organization_id", "subject_type", "subject_id");
-- the reminders job: what is due and not sent yet
CREATE INDEX "activity_remind_idx" ON "crm"."activity" ("remind_at");

CREATE TRIGGER activity_touch
  BEFORE UPDATE ON "crm"."activity"
  FOR EACH ROW EXECUTE FUNCTION crm.touch_updated_at();

-- RLS (D-SEC-1): USING + WITH CHECK on app.organization_id
ALTER TABLE "crm"."activity" ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_rw_activity ON "crm"."activity"
  TO crm_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Grants: only crm_rw; no DELETE (§6.4 c); no UPDATE of id / organization_id / kind /
-- subject_type / created_*. subject_id: only the merge of two contacts (CR.5) moves the activities
-- of the merged contact onto the one that stayed.
REVOKE ALL ON "crm"."activity" FROM PUBLIC;
GRANT SELECT, INSERT ON "crm"."activity" TO crm_rw;
GRANT UPDATE (
  "subject_id", "title", "note", "priority", "owner_user_id", "due_on", "due_at", "duration_minutes",
  "remind_before_minutes", "remind_at", "reminded_at", "call_result", "meeting_place",
  "participant_user_ids", "outcome", "status", "done_at", "done_by_user_id", "deleted_at",
  "deleted_by_user_id", "updated_at"
) ON "crm"."activity" TO crm_rw;
