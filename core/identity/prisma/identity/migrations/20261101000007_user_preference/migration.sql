-- Lot 4.3: UserPreference (ARCHITECTURE §4, identity) — limba aleasă de persoană, ca notificările
-- să plece în limba destinatarului (FAZA-4 §5, D4-8). Doar aditivă: un tabel nou și o funcție nouă.

CREATE TABLE "identity"."user_preference" (
  "user_id"    TEXT        NOT NULL,
  "locale"     VARCHAR(2),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "user_preference_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "user_preference_locale_check"
    CHECK ("locale" IS NULL OR "locale" IN ('ro', 'en', 'fr', 'es', 'de', 'it'))
);

ALTER TABLE "identity"."user_preference"
  ADD CONSTRAINT "user_preference_user_id_fkey" FOREIGN KEY ("user_id")
  REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE ON "identity"."user_preference" TO identity_rw;

-- Varianta Founder a datelor de contact, cu limba (E-6, sesiunea de suport, D4-8). Prima variantă
-- rămâne (o folosește recuperarea proprietarului).
CREATE OR REPLACE FUNCTION identity.founder_get_user_contact_v2(p_user TEXT)
RETURNS TABLE (email TEXT, name TEXT, locale TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT u.email, u.name, p.locale::text
    FROM identity.users u
    LEFT JOIN identity.user_preference p ON p.user_id = u.id
   WHERE u.id = p_user;
$$;

REVOKE ALL ON FUNCTION identity.founder_get_user_contact_v2(TEXT) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION identity.founder_get_user_contact_v2(TEXT) TO founder_runtime';
  END IF;
END $$;
