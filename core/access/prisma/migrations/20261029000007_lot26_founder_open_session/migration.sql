-- Lot 2.6 · G: „Afacerea are deja o sesiune de suport deschisă” — cine și până când. Doar aditivă:
-- o funcție de citire pentru founder_runtime, ca founder_get_support_session (SECURITY DEFINER,
-- search_path fix, REVOKE FROM PUBLIC, GRANT doar lui founder_runtime).
--
-- Indexul unic support_session_one_open_key e pe (founder_id, organization_id): sesiunea care
-- blochează deschiderea e a aceluiași Founder; o întoarcem doar dacă nu a expirat.

CREATE OR REPLACE FUNCTION access.founder_get_open_support_session(p_org UUID, p_founder_id TEXT)
RETURNS TABLE (
  id           UUID,
  founder_name VARCHAR(255),
  expires_at   TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT s.id, s.founder_name, s.expires_at
    FROM access.support_session s
   WHERE s.organization_id = p_org
     AND s.founder_id = p_founder_id
     AND s.closed_at IS NULL
     AND s.expires_at > now()
   ORDER BY s.opened_at DESC
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION access.founder_get_open_support_session(UUID, TEXT) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION access.founder_get_open_support_session(UUID, TEXT) TO founder_runtime';
  END IF;
END $$;
