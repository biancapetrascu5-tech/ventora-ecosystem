-- Lot C.4e (fondatoarea, 11.11.2026, varianta a): fișierul de import ClientDesk (CR.11b) se
-- păstrează prin core/files. text/csv se adaugă DOAR pentru proprietarul crm / import; restul
-- fișierelor rămân PNG / JPG / PDF (D4-17), până la 10 MB. Codul verifică același lucru înainte
-- și după încărcare (policy.ts); baza o repetă aici.
--
-- Fără rol nou, fără GRANT, fără schimbări de RLS. files_founder vede doar owner_module =
-- 'support' (politica din 4.6), deci nu poate scrie un CSV.

ALTER TABLE "files"."file" DROP CONSTRAINT "file_content_type_check";

ALTER TABLE "files"."file" ADD CONSTRAINT "file_content_type_check" CHECK (
  "content_type" IN ('image/png', 'image/jpeg', 'application/pdf')
  OR (
    "content_type" = 'text/csv'
    AND "owner_module" = 'crm'
    AND "owner_resource_type" = 'import'
  )
);
