-- Lot 3.5b — commercial_app_quota_snapshot: D3-26 (fondatoarea, 01.11.2026). Ca locurile incluse
-- (D3-25) și ca prețul liniei, limitele incluse ale unei aplicații adăugate la abonament se
-- fotografiază pe linie la creare și nu se mai schimbă singure: un contract semnat nu se modifică
-- automat, nici în sus, nici în jos.
--
--   subscription_application_quota → limitele unei linii (subscription_application), copiate din
--                                    application_quota când linia e creată
--
-- Copierea o face baza de date, la orice cale de creare (Founder adaugă linia, cererea rezolvată,
-- cumpărarea din Hub — Lotul 3.5), printr-un trigger AFTER INSERT (SECURITY DEFINER). Niciun rol
-- nu primește drept de scriere pe tabel; commercial_rw și commercial_founder îl citesc, în
-- contextul afacerii (RLS). Limitele fotografiate nu se mai pot modifica (trigger).
--
-- Liniile existente primesc la migrare valorile de azi din application_quota. O aplicație doar în
-- perioada de probă nu are linie: își citește limitele la zi (nu e încă un contract).

CREATE TABLE "commercial"."subscription_application_quota" (
    "subscription_application_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "quota_key" VARCHAR(128) NOT NULL,
    "limit_value" BIGINT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_application_quota_pkey" PRIMARY KEY ("subscription_application_id","quota_key"),
    CONSTRAINT "subscription_application_quota_limit" CHECK ("limit_value" IS NULL OR "limit_value" >= 0)
);

CREATE INDEX "subscription_application_quota_organization_id_idx"
  ON "commercial"."subscription_application_quota"("organization_id");

ALTER TABLE "commercial"."subscription_application_quota"
  ADD CONSTRAINT "subscription_application_quota_subscription_application_id_fkey"
  FOREIGN KEY ("subscription_application_id") REFERENCES "commercial"."subscription_application"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commercial"."subscription_application_quota"
  ADD CONSTRAINT "subscription_application_quota_quota_key_fkey"
  FOREIGN KEY ("quota_key") REFERENCES "commercial"."quota_key"("key")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Liniile existente: valorile de azi
INSERT INTO "commercial"."subscription_application_quota"
  (subscription_application_id, organization_id, quota_key, limit_value)
SELECT sa.id, sa.organization_id, q.quota_key, q.limit_value
  FROM "commercial"."subscription_application" sa
  JOIN "commercial"."application_quota" q ON q.application_id = sa.application_id;

-- La fiecare linie nouă: limitele aplicației din acel moment
CREATE OR REPLACE FUNCTION commercial.subscription_application_quota_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  INSERT INTO commercial.subscription_application_quota
    (subscription_application_id, organization_id, quota_key, limit_value)
  SELECT NEW.id, NEW.organization_id, q.quota_key, q.limit_value
    FROM commercial.application_quota q
   WHERE q.application_id = NEW.application_id;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION commercial.subscription_application_quota_snapshot() FROM PUBLIC;

CREATE TRIGGER subscription_application_quota_snapshot
  AFTER INSERT ON "commercial"."subscription_application"
  FOR EACH ROW EXECUTE FUNCTION commercial.subscription_application_quota_snapshot();

-- Fotografiate la creare: nu se mai modifică
CREATE OR REPLACE FUNCTION commercial.subscription_application_quota_fixed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = commercial, pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'the limits of subscription_application % are fixed at its creation',
    OLD.subscription_application_id
    USING ERRCODE = 'P0001', HINT = 'line_quota_fixed';
END $$;

CREATE TRIGGER subscription_application_quota_fixed
  BEFORE UPDATE ON "commercial"."subscription_application_quota"
  FOR EACH ROW EXECUTE FUNCTION commercial.subscription_application_quota_fixed();

-- RLS: o afacere pe tranzacție; doar citire pentru rolurile modulului
ALTER TABLE "commercial"."subscription_application_quota" ENABLE ROW LEVEL SECURITY;

CREATE POLICY commercial_rw_subscription_application_quota
  ON "commercial"."subscription_application_quota" FOR SELECT TO commercial_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY commercial_founder_subscription_application_quota
  ON "commercial"."subscription_application_quota" FOR SELECT TO commercial_founder
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

REVOKE ALL ON "commercial"."subscription_application_quota" FROM PUBLIC;
GRANT SELECT ON "commercial"."subscription_application_quota" TO commercial_rw;
GRANT SELECT ON "commercial"."subscription_application_quota" TO commercial_founder;
