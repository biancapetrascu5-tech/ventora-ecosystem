-- Lot 2.5c — M2: sesiunea de suport Founder (D9: în schema "access", citită de authorizeSupport()).
--
-- D10 varianta A: fără acord prealabil; sesiunea e activă imediat și vizibilă organizației.
-- D11: owner-ul o poate închide. D12: doar citire (allow-list în core/access, nu aici).
--
-- Scriere: doar prin funcții SECURITY DEFINER.
--   founder_runtime → founder_open / founder_get / founder_close / founder_expire /
--                     founder_close_support_sessions_of (la revocarea Founder-ului)
--   access_rw       → owner_close_support_session (organizația din app.organization_id)
-- Citire de către organizație: access_rw, SELECT cu RLS pe app.organization_id (eșec sigur).

-- CreateTable
CREATE TABLE "access"."support_session" (
    "id"              UUID          NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID          NOT NULL,
    "founder_id"      TEXT          NOT NULL,
    "founder_name"    VARCHAR(255)  NOT NULL,
    "reason"          VARCHAR(1000) NOT NULL,
    "ticket_ref"      VARCHAR(255)  NOT NULL,
    "opened_at"       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at"      TIMESTAMPTZ   NOT NULL,
    "closed_at"       TIMESTAMPTZ,
    "closed_by_type"  VARCHAR(8),
    "closed_by_id"    TEXT,

    CONSTRAINT "support_session_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "support_session_reason_check" CHECK (char_length(btrim("reason")) >= 10),
    CONSTRAINT "support_session_ticket_ref_check" CHECK (char_length(btrim("ticket_ref")) >= 1),
    -- FAZA-2: maximum 240 de minute
    CONSTRAINT "support_session_duration_check"
      CHECK ("expires_at" > "opened_at" AND "expires_at" <= "opened_at" + INTERVAL '240 minutes'),
    CONSTRAINT "support_session_closed_by_type_check"
      CHECK ("closed_by_type" IS NULL OR "closed_by_type" IN ('founder', 'owner', 'system')),
    CONSTRAINT "support_session_closed_check"
      CHECK (("closed_at" IS NULL) = ("closed_by_type" IS NULL))
);

-- O singură sesiune deschisă per (Founder, organizație). Una expirată, dar încă neînchisă, ține
-- locul până când founder_open_support_session o închide (system).
CREATE UNIQUE INDEX "support_session_one_open_key"
  ON "access"."support_session"("founder_id", "organization_id")
  WHERE "closed_at" IS NULL;

CREATE INDEX "support_session_organization_id_closed_at_idx"
  ON "access"."support_session"("organization_id", "closed_at");

-- Grants: organizația doar citește; nicio scriere directă pentru vreun rol de runtime.
GRANT SELECT ON "access"."support_session" TO access_rw;

ALTER TABLE "access"."support_session" ENABLE ROW LEVEL SECURITY;

CREATE POLICY access_rw_support_session ON "access"."support_session"
  FOR SELECT
  TO access_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- founder_runtime folosește schema doar prin funcțiile de mai jos
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA access TO founder_runtime';
  END IF;
END $$;

-- Deschidere. Închide întâi (system) o sesiune expirată a aceleiași perechi, ca indexul unic să
-- nu blocheze; id-urile închise astfel sunt întoarse în expired_ids (E37, scris de aplicație).
-- O sesiune deschisă și neexpirată → unique_violation (23505).
CREATE OR REPLACE FUNCTION access.founder_open_support_session(
  p_organization_id  UUID,
  p_founder_id       TEXT,
  p_founder_name     TEXT,
  p_reason           TEXT,
  p_ticket_ref       TEXT,
  p_duration_minutes INTEGER
)
RETURNS TABLE (
  id          UUID,
  opened_at   TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ,
  expired_ids UUID[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_expired UUID[];
BEGIN
  IF p_duration_minutes IS NULL OR p_duration_minutes < 1 OR p_duration_minutes > 240 THEN
    RAISE EXCEPTION 'founder_open_support_session: duration must be 1..240 minutes'
      USING ERRCODE = '22023';
  END IF;

  WITH closed AS (
    UPDATE access.support_session s
       SET closed_at = now(), closed_by_type = 'system'
     WHERE s.founder_id = p_founder_id
       AND s.organization_id = p_organization_id
       AND s.closed_at IS NULL
       AND s.expires_at <= now()
    RETURNING s.id
  )
  SELECT COALESCE(array_agg(closed.id), '{}') INTO v_expired FROM closed;

  RETURN QUERY
  INSERT INTO access.support_session AS s
    (organization_id, founder_id, founder_name, reason, ticket_ref, opened_at, expires_at)
  VALUES (
    p_organization_id, p_founder_id, left(btrim(p_founder_name), 255), btrim(p_reason),
    btrim(p_ticket_ref), now(), now() + make_interval(mins => p_duration_minutes)
  )
  RETURNING s.id, s.opened_at, s.expires_at, v_expired;
END $$;

-- Citirea unei sesiuni de către Founder-ul care a deschis-o (authorizeSupport, la fiecare apel).
CREATE OR REPLACE FUNCTION access.founder_get_support_session(p_id UUID, p_founder_id TEXT)
RETURNS TABLE (
  id              UUID,
  organization_id UUID,
  founder_id      TEXT,
  founder_name    VARCHAR(255),
  reason          VARCHAR(1000),
  ticket_ref      VARCHAR(255),
  opened_at       TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ,
  closed_by_type  VARCHAR(8),
  is_expired      BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT s.id, s.organization_id, s.founder_id, s.founder_name, s.reason, s.ticket_ref,
         s.opened_at, s.expires_at, s.closed_at, s.closed_by_type, s.expires_at <= now()
    FROM access.support_session s
   WHERE s.id = p_id
     AND s.founder_id = p_founder_id;
$$;

-- Închidere manuală de către Founder (E35). NULL = nimic de închis (alt Founder, deja închisă).
CREATE OR REPLACE FUNCTION access.founder_close_support_session(p_id UUID, p_founder_id TEXT)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  UPDATE access.support_session s
     SET closed_at = now(), closed_by_type = 'founder', closed_by_id = p_founder_id
   WHERE s.id = p_id
     AND s.founder_id = p_founder_id
     AND s.closed_at IS NULL
  RETURNING s.organization_id;
$$;

-- Expirare constatată la folosire (E37). Întoarce organizația doar apelului care a închis-o,
-- deci E37 se scrie o singură dată.
CREATE OR REPLACE FUNCTION access.founder_expire_support_session(p_id UUID, p_founder_id TEXT)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  UPDATE access.support_session s
     SET closed_at = now(), closed_by_type = 'system'
   WHERE s.id = p_id
     AND s.founder_id = p_founder_id
     AND s.closed_at IS NULL
     AND s.expires_at <= now()
  RETURNING s.organization_id;
$$;

-- Revocarea Founder-ului (revokeFounderUser): toate sesiunile lui deschise se închid (system).
CREATE OR REPLACE FUNCTION access.founder_close_support_sessions_of(p_founder_id TEXT)
RETURNS TABLE (id UUID, organization_id UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  UPDATE access.support_session s
     SET closed_at = now(), closed_by_type = 'system'
   WHERE s.founder_id = p_founder_id
     AND s.closed_at IS NULL
  RETURNING s.id, s.organization_id;
$$;

-- Închidere de către owner (D11, E36). Organizația vine din app.organization_id, pus de aplicație
-- după authorize(); fără setare nu se închide nimic. Întoarce founder_id-ul sesiunii închise.
CREATE OR REPLACE FUNCTION access.owner_close_support_session(p_id UUID, p_user_id TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  UPDATE access.support_session s
     SET closed_at = now(), closed_by_type = 'owner', closed_by_id = p_user_id
   WHERE s.id = p_id
     AND s.organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid
     AND s.closed_at IS NULL
  RETURNING s.founder_id;
$$;

REVOKE ALL ON FUNCTION access.founder_open_support_session(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION access.founder_get_support_session(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION access.founder_close_support_session(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION access.founder_expire_support_session(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION access.founder_close_support_sessions_of(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION access.owner_close_support_session(UUID, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION access.owner_close_support_session(UUID, TEXT) TO access_rw;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION access.founder_open_support_session(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER) TO founder_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION access.founder_get_support_session(UUID, TEXT) TO founder_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION access.founder_close_support_session(UUID, TEXT) TO founder_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION access.founder_expire_support_session(UUID, TEXT) TO founder_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION access.founder_close_support_sessions_of(TEXT) TO founder_runtime';
  END IF;
END $$;
