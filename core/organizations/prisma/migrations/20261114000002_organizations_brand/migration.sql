-- Brand Kit (S148, aprobat de fondatoare pe 14.11.2026, cu lista exactă din raportul
-- 2026-11-14_1100_brand-kit-propunere-sql.md): aspectul afacerii în Hub, pe pagina publică
-- EasyBook și în e-mailurile către clienți.
--
--   organization_brand → un rând pe afacere, creat la prima salvare: logo-ul pe fundal deschis și
--                        cel opțional pe fundal închis (id-uri de fișiere din core/files, fără FK:
--                        altă schemă, verificate prin contractul @ventora/files la salvare),
--                        culoarea principală și de accent, fontul, tonul, semnătura de e-mail.
--                        Gol = aspectul Ventora Systems. „Revino la aspectul Ventora” e un UPDATE
--                        care golește câmpurile: fără DELETE.
--
-- Trei funcții SECURITY DEFINER (search_path fix, REVOKE FROM PUBLIC, EXECUTE doar org_rw), ca
-- find_public_organization și list_my_memberships_v3:
--   find_public_brand(slug)       → pagina publică, fără sesiune: DOAR id-ul logo-urilor curente,
--                                   culorile, fontul și tonul unei afaceri ACTIVE; niciodată
--                                   semnătura sau altceva din afacere;
--   find_brand_logo(file_id)      → ruta publică /brand/logo/<id>: afacerea, doar dacă fișierul e
--                                   logo-ul CURENT al unei afaceri ACTIVE (un logo înlocuit, golit
--                                   sau al unei afaceri suspendate → niciun rând → 404);
--   list_my_membership_brands()   → selectorul de afacere: id-urile logo-urilor afacerilor în care
--                                   persoana (app.user_id) e membru activ.
--
-- Fără rol nou; GRANT-uri doar către org_rw (rolul propriului modul).

CREATE TABLE "organizations"."organization_brand" (
  "organization_id"    UUID         NOT NULL,
  "logo_light_file_id" UUID,
  "logo_dark_file_id"  UUID,
  "primary_color"      CHAR(7),
  "accent_color"       CHAR(7),
  "font"               VARCHAR(10),
  "tone"               VARCHAR(8)   NOT NULL DEFAULT 'formal',
  "email_signature"    VARCHAR(300),
  "updated_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_by_user_id" UUID,

  CONSTRAINT "organization_brand_pkey" PRIMARY KEY ("organization_id"),
  CONSTRAINT "organization_brand_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "organizations"."organization" ("id") ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT "organization_brand_primary_color_check"
    CHECK ("primary_color" IS NULL OR "primary_color" ~ '^#[0-9a-f]{6}$'),
  CONSTRAINT "organization_brand_accent_color_check"
    CHECK ("accent_color" IS NULL OR "accent_color" ~ '^#[0-9a-f]{6}$'),
  CONSTRAINT "organization_brand_font_check"
    CHECK ("font" IS NULL OR "font" IN ('modern', 'expressive', 'classic', 'rounded')),
  CONSTRAINT "organization_brand_tone_check" CHECK ("tone" IN ('formal', 'friendly', 'short')),
  -- fără logo deschis nu are sens unul închis (placa albă e alternativa)
  CONSTRAINT "organization_brand_dark_logo_check"
    CHECK ("logo_dark_file_id" IS NULL OR "logo_light_file_id" IS NOT NULL),
  CONSTRAINT "organization_brand_signature_check"
    CHECK ("email_signature" IS NULL OR length(btrim("email_signature")) BETWEEN 1 AND 300)
);

-- find_brand_logo caută după id-ul fișierului
CREATE INDEX "organization_brand_logo_light_file_id_idx"
  ON "organizations"."organization_brand" ("logo_light_file_id");
CREATE INDEX "organization_brand_logo_dark_file_id_idx"
  ON "organizations"."organization_brand" ("logo_dark_file_id");

ALTER TABLE "organizations"."organization_brand" ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_rw_organization_brand ON "organizations"."organization_brand"
  TO org_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

REVOKE ALL ON "organizations"."organization_brand" FROM PUBLIC;
-- privilegiile implicite ale schemei ar da org_rw și DELETE: luate înapoi, apoi doar
-- SELECT / INSERT / UPDATE
REVOKE ALL ON "organizations"."organization_brand" FROM org_rw;
GRANT SELECT, INSERT, UPDATE ON "organizations"."organization_brand" TO org_rw;

-- Pagina publică (fără sesiune): doar aspectul, niciodată semnătura.
CREATE OR REPLACE FUNCTION organizations.find_public_brand(p_slug TEXT)
RETURNS TABLE (
  logo_light_file_id UUID,
  logo_dark_file_id  UUID,
  primary_color      CHAR(7),
  accent_color       CHAR(7),
  font               VARCHAR(10),
  tone               VARCHAR(8)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT b.logo_light_file_id, b.logo_dark_file_id, b.primary_color, b.accent_color, b.font, b.tone
    FROM organizations.organization o
    JOIN organizations.organization_brand b ON b.organization_id = o.id
   WHERE o.slug = lower(p_slug)
     AND o.status = 'active'
$$;

REVOKE ALL ON FUNCTION organizations.find_public_brand(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION organizations.find_public_brand(TEXT) TO org_rw;

-- Ruta /brand/logo/<id>: afacerea, doar pentru logo-ul curent al unei afaceri active.
CREATE OR REPLACE FUNCTION organizations.find_brand_logo(p_file_id UUID)
RETURNS TABLE (organization_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT o.id
    FROM organizations.organization_brand b
    JOIN organizations.organization o ON o.id = b.organization_id
   WHERE (b.logo_light_file_id = p_file_id OR b.logo_dark_file_id = p_file_id)
     AND o.status = 'active'
$$;

REVOKE ALL ON FUNCTION organizations.find_brand_logo(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION organizations.find_brand_logo(UUID) TO org_rw;

-- Selectorul de afacere: logo-urile afacerilor persoanei (din sesiune, S1).
CREATE OR REPLACE FUNCTION organizations.list_my_membership_brands()
RETURNS TABLE (
  organization_id    UUID,
  logo_light_file_id UUID,
  logo_dark_file_id  UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT b.organization_id, b.logo_light_file_id, b.logo_dark_file_id
    FROM organizations.membership m
    JOIN organizations.organization_brand b ON b.organization_id = m.organization_id
   WHERE m.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
     AND m.status = 'active'
$$;

REVOKE ALL ON FUNCTION organizations.list_my_membership_brands() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION organizations.list_my_membership_brands() TO org_rw;
