-- S147 / Brand Kit (aprobat de fondatoare pe 14.11.2026): poza de profil din „Contul tău”. Poza
-- ține de persoană, nu de o afacere, iar files.file cere organization_id (și outbox-ul la fel),
-- deci are tabelul ei, în aceeași schemă, cu același rol files_rw.
--
--   personal_file → un fișier al unei persoane (doar `avatar`): PNG / JPEG, cel mult 5 MB,
--                   aceleași stări ca files.file (pending → ready / rejected; deleted). Poza
--                   curentă se ține în identity.users.image (coloana Better Auth existentă).
--
-- RLS pe persoana curentă (app.user_id, din sesiune, niciodată din client), cu USING și
-- WITH CHECK: nimeni nu vede și nu scrie fișierele altei persoane; fără context, 0 rânduri.
-- Fără DELETE (o poză înlocuită devine `deleted`), fără outbox (nimeni nu ascultă o poză), fără
-- rol nou și fără GRANT către alt rol.

CREATE TABLE "files"."personal_file" (
  "id"                UUID         NOT NULL,
  "user_id"           UUID         NOT NULL,
  "purpose"           VARCHAR(16)  NOT NULL,
  "content_type"      VARCHAR(64)  NOT NULL,
  "size_bytes"        BIGINT       NOT NULL,
  "storage_key"       VARCHAR(512) NOT NULL,
  "status"            VARCHAR(16)  NOT NULL DEFAULT 'pending',
  "upload_expires_at" TIMESTAMPTZ  NOT NULL,
  "ready_at"          TIMESTAMPTZ,
  "deleted_at"        TIMESTAMPTZ,
  "created_at"        TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "personal_file_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "personal_file_storage_key_key" UNIQUE ("storage_key"),
  CONSTRAINT "personal_file_purpose_check" CHECK ("purpose" IN ('avatar')),
  CONSTRAINT "personal_file_content_type_check" CHECK ("content_type" IN ('image/png', 'image/jpeg')),
  CONSTRAINT "personal_file_size_bytes_check" CHECK ("size_bytes" > 0 AND "size_bytes" <= 5242880),
  CONSTRAINT "personal_file_status_check" CHECK ("status" IN ('pending', 'ready', 'rejected', 'deleted'))
);

CREATE INDEX "personal_file_user_id_purpose_idx" ON "files"."personal_file" ("user_id", "purpose");

ALTER TABLE "files"."personal_file" ENABLE ROW LEVEL SECURITY;

CREATE POLICY files_rw_personal_file ON "files"."personal_file"
  TO files_rw
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);

REVOKE ALL ON "files"."personal_file" FROM PUBLIC;
REVOKE ALL ON "files"."personal_file" FROM files_rw;
GRANT SELECT, INSERT ON "files"."personal_file" TO files_rw;
-- doar starea se schimbă după inserare
GRANT UPDATE ("status", "ready_at", "deleted_at") ON "files"."personal_file" TO files_rw;
