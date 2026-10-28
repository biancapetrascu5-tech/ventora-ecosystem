-- Lot 2.5c — M4: recuperarea owner-ului prin Founder (R-2F7, plan §4) + contactul pentru
-- e-mailurile trimise din Founder. founder_runtime nu primește drepturi pe tabelele identity;
-- folosește doar aceste funcții (SECURITY DEFINER, search_path fix, GRANT EXECUTE doar lui).
--
-- Verificarea că utilizatorul e owner activ al organizației se face în aceeași tranzacție, de
-- aplicație, cu organizations.founder_get_owner_membership (M3), înainte de apel.

-- Resetează accesul în doi pași al unui utilizator, într-un singur pas atomic:
--   - șterge rândul two_factors (secret + coduri de rezervă + contoarele de blocare);
--   - users.two_factor_enabled = false;
--   - șterge toate sesiunile, provocările 2FA în curs (și contoarele lor) și dispozitivele de încredere;
--   - p_reset_password (D15 varianta B): parola devine NULL, token-urile de resetare vechi se șterg și
--     se scrie unul nou, valabil o oră (același format ca Better Auth: reset-password:<token>).
-- Utilizator inexistent → no_data_found (P0002).
CREATE OR REPLACE FUNCTION identity.founder_reset_owner_access(
  p_user           TEXT,
  p_reset_password BOOLEAN,
  p_reset_token    TEXT
)
RETURNS TABLE (
  email              TEXT,
  name               TEXT,
  two_factor_removed BOOLEAN,
  sessions_deleted   INTEGER,
  challenges_deleted INTEGER,
  password_reset     BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_email      TEXT;
  v_name       TEXT;
  v_two_factor INTEGER;
  v_sessions   INTEGER;
  v_challenges INTEGER;
BEGIN
  SELECT u.email, u.name INTO v_email, v_name
    FROM identity.users u
   WHERE u.id = p_user
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'founder_reset_owner_access: user not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_reset_password AND (p_reset_token IS NULL OR char_length(p_reset_token) < 20) THEN
    RAISE EXCEPTION 'founder_reset_owner_access: reset token required' USING ERRCODE = '22023';
  END IF;

  DELETE FROM identity.two_factors t WHERE t.user_id = p_user;
  GET DIAGNOSTICS v_two_factor = ROW_COUNT;

  UPDATE identity.users u SET two_factor_enabled = false, updated_at = now() WHERE u.id = p_user;

  DELETE FROM identity.sessions s WHERE s.user_id = p_user;
  GET DIAGNOSTICS v_sessions = ROW_COUNT;

  -- Provocarea de la login: identifier = valoarea cookie-ului __two-factor, value = userId;
  -- contorul ei de încercări: identifier = '2fa-attempts-' || identifier-ul provocării.
  WITH challenges AS (
    DELETE FROM identity.verifications v
     WHERE v.identifier LIKE '2fa-%'
       AND v.identifier NOT LIKE '2fa-attempts-%'
       AND v.value = p_user
    RETURNING v.identifier
  ),
  attempts AS (
    DELETE FROM identity.verifications v
     WHERE v.identifier IN (SELECT '2fa-attempts-' || c.identifier FROM challenges c)
  )
  SELECT count(*) INTO v_challenges FROM challenges;

  DELETE FROM identity.verifications v
   WHERE v.identifier LIKE 'trust-device-%'
     AND v.value = p_user;

  IF p_reset_password THEN
    UPDATE identity.accounts a
       SET password = NULL, updated_at = now()
     WHERE a.user_id = p_user
       AND a.provider_id = 'credential';

    DELETE FROM identity.verifications v
     WHERE v.identifier LIKE 'reset-password:%'
       AND v.value = p_user;

    INSERT INTO identity.verifications (id, identifier, value, expires_at, created_at, updated_at)
    VALUES (
      gen_random_uuid()::text, 'reset-password:' || p_reset_token, p_user,
      now() + INTERVAL '1 hour', now(), now()
    );
  END IF;

  RETURN QUERY SELECT v_email, v_name, v_two_factor > 0, v_sessions, v_challenges,
                      COALESCE(p_reset_password, false);
END $$;

-- Adresa și numele unui utilizator, pentru e-mailurile trimise din Founder (sesiunea de suport).
CREATE OR REPLACE FUNCTION identity.founder_get_user_contact(p_user TEXT)
RETURNS TABLE (email TEXT, name TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT u.email, u.name FROM identity.users u WHERE u.id = p_user;
$$;

REVOKE ALL ON FUNCTION identity.founder_reset_owner_access(TEXT, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.founder_get_user_contact(TEXT) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA identity TO founder_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION identity.founder_reset_owner_access(TEXT, BOOLEAN, TEXT) TO founder_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION identity.founder_get_user_contact(TEXT) TO founder_runtime';
  END IF;
END $$;
