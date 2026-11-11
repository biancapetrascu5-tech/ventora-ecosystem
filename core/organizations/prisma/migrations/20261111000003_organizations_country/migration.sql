-- Lot 5.10c (decizia Biancăi din 11.11.2026, 11:59): țara afacerii, în organizations (nu din
-- profilul de facturare), ISO 3166-1 alpha-2, implicit RO. Trimisă în evenimentul
-- organization.created v1, scris în outbox în aceeași tranzacție cu afacerea; Growth (5.10c)
-- își face agregatele din evenimente, fără SQL între module.
--
-- 1. Coloana: aditivă, cu default, deci afacerile existente primesc RO. Fără GRANT nou: org_rw are
--    deja SELECT / UPDATE pe organization (organizations_init), iar politica org_rw_organization
--    (USING + WITH CHECK) acoperă coloana nouă.
-- 2. founder_create_organization (SECURITY DEFINER, singurul drum de creare): primește țara și
--    scrie evenimentul în organizations.outbox_events. founder_runtime nu primește niciun drept
--    nou pe outbox: scrie doar funcția, cu payload-ul construit aici (doar id-ul și țara).
--    Semnătura veche (5 argumente) se șterge, ca să nu rămână un drum de creare fără eveniment.

ALTER TABLE "organizations"."organization"
  ADD COLUMN "country" CHAR(2) NOT NULL DEFAULT 'RO';

ALTER TABLE "organizations"."organization"
  ADD CONSTRAINT "organization_country_check" CHECK ("country" ~ '^[A-Z]{2}$');

DROP FUNCTION organizations.founder_create_organization(TEXT, TEXT, TEXT, TEXT, UUID);

CREATE FUNCTION organizations.founder_create_organization(
  p_name                  TEXT,
  p_slug                  TEXT,
  p_owner_email           TEXT,
  p_invitation_token_hash TEXT,
  p_created_by_founder_id UUID,
  p_country               TEXT
)
RETURNS TABLE (
  organization_id UUID,
  invitation_id   UUID
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = organizations, pg_catalog
AS $$
  WITH new_org AS (
    INSERT INTO "organizations"."organization" (
      name, slug, created_via, created_by_founder_id, country, updated_at
    )
    VALUES (p_name, p_slug, 'founder', p_created_by_founder_id, p_country, NOW())
    RETURNING id, name, country
  ),
  new_inv AS (
    INSERT INTO "organizations"."invitation" (
      organization_id, organization_name, invited_by_user_id, invited_by_name,
      email, role, token_hash, expires_at, updated_at
    )
    VALUES (
      (SELECT id FROM new_org),
      (SELECT name FROM new_org),
      p_created_by_founder_id,
      'Ventora',
      p_owner_email,
      'owner',
      p_invitation_token_hash,
      NOW() + INTERVAL '30 days',
      NOW()
    )
    RETURNING id
  ),
  new_event AS (
    -- organization.created v1 (@ventora/contracts, OrganizationCreatedV1): doar id-ul și țara
    INSERT INTO "organizations"."outbox_events" (
      event_id, type, version, occurred_at, organization_id, source_app, resource_id,
      correlation_id, payload
    )
    SELECT gen_random_uuid(), 'organization.created', 1, NOW(), o.id, 'platform', o.id::text,
           NULL, jsonb_build_object('organizationId', o.id, 'country', o.country)
      FROM new_org o
    RETURNING event_id
  )
  SELECT (SELECT id FROM new_org), (SELECT id FROM new_inv)
   WHERE (SELECT count(*) FROM new_event) = 1;
$$;

REVOKE ALL ON FUNCTION organizations.founder_create_organization(TEXT, TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'founder_runtime') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION organizations.founder_create_organization(TEXT, TEXT, TEXT, TEXT, UUID, TEXT) TO founder_runtime';
  END IF;
END $$;
