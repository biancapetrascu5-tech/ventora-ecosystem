-- Lot C.4g (decizia fondatoarei, 11.11.2026, S127 la B.12): încărcarea anonimă, pentru poza
-- opțională a clientului pe pagina publică de rezervare. Clientul nu are cont, deci fișierul nu are
-- `uploaded_by_user_id`; în locul lui are `anonymous_key`, cheia dată de modulul proprietar (pentru
-- Booking: id-ul holdului public). Protecțiile:
--   * modulul proprietar cere încărcarea doar pentru un hold public existent, în așteptare, al
--     afacerii respective, după Turnstile (verificat în modul, înainte de core/files);
--   * doar PNG / JPEG (verificat și după conținut la confirmare), cel mult 10 MB (CHECK-ul existent);
--   * cel mult un fișier pe proprietar (o întrebare) și cel mult 5 pe cheie (un hold), în cod;
--   * pozele unui hold expirat sau refuzat sunt șterse de sistem (deleteAnonymousFiles), apelat de
--     jobul de curățare al modulului.
--
-- Aditiv: o coloană, `uploaded_by_user_id` devine opțională, două CHECK-uri, un index. Fără rol
-- nou, fără GRANT nou: files_rw are deja SELECT / INSERT / UPDATE pe tabel (nu pe coloane), iar
-- files_founder vede tot doar `support`. Fără schimbări de RLS.

ALTER TABLE "files"."file" ADD COLUMN "anonymous_key" UUID;
ALTER TABLE "files"."file" ALTER COLUMN "uploaded_by_user_id" DROP NOT NULL;

-- exact unul: o persoană din organizație sau o cheie anonimă
ALTER TABLE "files"."file" ADD CONSTRAINT "file_uploader_check"
  CHECK (("uploaded_by_user_id" IS NULL) <> ("anonymous_key" IS NULL));

-- anonim: doar imagini PNG / JPEG
ALTER TABLE "files"."file" ADD CONSTRAINT "file_anonymous_content_type_check"
  CHECK ("anonymous_key" IS NULL OR "content_type" IN ('image/png', 'image/jpeg'));

CREATE INDEX "file_organization_id_anonymous_key_idx"
  ON "files"."file" ("organization_id", "anonymous_key");
