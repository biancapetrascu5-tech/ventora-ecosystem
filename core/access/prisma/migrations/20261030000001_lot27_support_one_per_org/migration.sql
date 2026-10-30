-- Lot 2.7 · B: o singură sesiune de suport deschisă per afacere, nu per (Founder, afacere)
-- („O singură sesiune poate fi deschisă pentru o afacere”). Al doilea Founder primește
-- SupportSessionConflict cu cine are sesiunea și până când.
--
-- Doar index și funcții; niciun rând nu se schimbă. Dacă există deja două sesiuni neînchise în
-- aceeași afacere (posibil cu indexul vechi, de la Founderi diferiți), migrarea se oprește fără
-- să schimbe nimic: datele se lămuresc întâi (vezi raportul Lotului 2.7, planul de staging).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM access.support_session
     WHERE closed_at IS NULL
     GROUP BY organization_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'lot27_support_one_per_org: an organization has more than one unclosed support session'
      USING ERRCODE = '23505';
  END IF;
END $$;

DROP INDEX "access"."support_session_one_open_key";

-- Una expirată, dar încă neînchisă, ține locul până când founder_open_support_session o închide.
CREATE UNIQUE INDEX "support_session_one_open_per_org_key"
  ON "access"."support_session"("organization_id")
  WHERE "closed_at" IS NULL;

-- Deschiderea închide întâi (system) sesiunea expirată a afacerii, a oricărui Founder, ca indexul
-- unic să nu blocheze. Întoarce și Founderii acelor sesiuni (E37 îl scrie aplicația, cu Founderul
-- sesiunii). Tipul întors se schimbă, deci funcția e recreată, cu aceleași drepturi.
DROP FUNCTION access.founder_open_support_session(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER);

CREATE FUNCTION access.founder_open_support_session(
  p_organization_id  UUID,
  p_founder_id       TEXT,
  p_founder_name     TEXT,
  p_reason           TEXT,
  p_ticket_ref       TEXT,
  p_duration_minutes INTEGER
)
RETURNS TABLE (
  id                  UUID,
  opened_at           TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ,
  expired_ids         UUID[],
  expired_founder_ids TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_expired UUID[];
  v_expired_founders TEXT[];
BEGIN
  IF p_duration_minutes IS NULL OR p_duration_minutes < 1 OR p_duration_minutes > 240 THEN
    RAISE EXCEPTION 'founder_open_support_session: duration must be 1..240 minutes'
      USING ERRCODE = '22023';
  END IF;

  WITH closed AS (
    UPDATE access.support_session s
       SET closed_at = now(), closed_by_type = 'system'
     WHERE s.organization_id = p_organization_id
       AND s.closed_at IS NULL
       AND s.expires_at <= now()
    RETURNING s.id, s.founder_id
  )
  SELECT COALESCE(array_agg(closed.id ORDER BY closed.id), '{}'),
         COALESCE(array_agg(closed.founder_id ORDER BY closed.id), '{}')
    INTO v_expired, v_expired_founders
    FROM closed;

  RETURN QUERY
  INSERT INTO access.support_session AS s
    (organization_id, founder_id, founder_name, reason, ticket_ref, opened_at, expires_at)
  VALUES (
    p_organization_id, p_founder_id, left(btrim(p_founder_name), 255), btrim(p_reason),
    btrim(p_ticket_ref), now(), now() + make_interval(mins => p_duration_minutes)
  )
  RETURNING s.id, s.opened_at, s.expires_at, v_expired, v_expired_founders;
END $$;

-- Cine are sesiunea deschisă a afacerii și până când, oricare ar fi Founderul. Înlocuiește
-- varianta din Lotul 2.6 (per Founder), care n-a ajuns pe staging.
DROP FUNCTION access.founder_get_open_support_session(UUID, TEXT);

CREATE FUNCTION access.founder_get_open_support_session(p_org UUID)
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
     AND s.closed_at IS NULL
     AND s.expires_at > now()
   ORDER BY s.opened_at DESC
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION access.founder_open_support_session(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION access.founder_get_open_support_session(UUID) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION access.founder_open_support_session(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER) TO founder_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION access.founder_get_open_support_session(UUID) TO founder_runtime';
  END IF;
END $$;
