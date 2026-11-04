-- Lot 4.6 (S-5 = b, fondatoarea, 04.11.2026): atașamentele echipei Ventora Systems la solicitările
-- de suport (FounderSupportInbox). Rolul files_founder (NOLOGIN NOINHERIT), membru al
-- founder_runtime, vede și scrie DOAR fișierele cu owner_module = 'support', în organizația din
-- tranzacție (app.organization_id). Fără DELETE; fără acces la fișierele altor module.
--
-- Încărcarea (core/files: requestUpload → confirmUpload) cere:
--   INSERT       → rândul `pending`
--   UPDATE       → doar `status` și `ready_at` (ready / rejected)
--   SELECT       → citirea rândului la confirmare și la descărcare
--   outbox       → INSERT, doar `file.uploaded` al unui fișier `support` (confirmUpload îl scrie
--                  în aceeași tranzacție, ca la files_rw)

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'files_founder') THEN
    CREATE ROLE files_founder NOLOGIN NOINHERIT;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    GRANT files_founder TO founder_runtime;
  END IF;
END $$;

GRANT USAGE ON SCHEMA "files" TO files_founder;

GRANT SELECT, INSERT ON "files"."file" TO files_founder;
GRANT UPDATE ("status", "ready_at") ON "files"."file" TO files_founder;

CREATE POLICY files_founder_file ON "files"."file"
  TO files_founder
  USING (
    organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid
    AND owner_module = 'support'
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid
    AND owner_module = 'support'
  );

GRANT INSERT ON "files"."outbox_events" TO files_founder;

CREATE POLICY files_founder_outbox_events ON "files"."outbox_events"
  FOR INSERT TO files_founder
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid
    AND type = 'file.uploaded'
    AND payload ->> 'ownerModule' = 'support'
  );
