-- Lot 5.1c (FAZA-5 5.1b, designul S146 „Cere acces”; deciziile Biancăi din 12.11): cererea de
-- acces a unei persoane fără nicio aplicație, către owner și admini.
--
--   access_request → un rând pe persoană și afacere (decizia: un rând pe persoană). Retrimisă după
--                    7 zile → aceeași linie, cu data nouă (requested_at) și request_count + 1
--                    („A cerut din nou · {data}”). Cererea dispare din vederea owner-ului când
--                    persoana primește cel puțin o aplicație: filtrul îl face Hub-ul, prin
--                    contractul core/access (aici nu se citește altă schemă).
--
-- Fără DELETE; fără UPDATE pe organization_id / user_id / first_requested_at; RLS pe
-- app.organization_id (D-SEC-1), doar org_rw. Fără rol nou și fără GRANT către alt rol.

CREATE TABLE "organizations"."access_request" (
  "organization_id"    UUID        NOT NULL,
  "user_id"            UUID        NOT NULL,
  "first_requested_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "requested_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "request_count"      INTEGER     NOT NULL DEFAULT 1,

  CONSTRAINT "access_request_pkey" PRIMARY KEY ("organization_id", "user_id"),
  CONSTRAINT "access_request_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "organizations"."organization" ("id") ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT "access_request_count_check" CHECK ("request_count" >= 1),
  CONSTRAINT "access_request_dates_check" CHECK ("requested_at" >= "first_requested_at")
);

ALTER TABLE "organizations"."access_request" ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_rw_access_request ON "organizations"."access_request"
  TO org_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

REVOKE ALL ON "organizations"."access_request" FROM PUBLIC;
-- the schema's default privileges would give org_rw DELETE and UPDATE on every column: taken back,
-- then only SELECT / INSERT and the UPDATE of the two columns the resend changes
REVOKE ALL ON "organizations"."access_request" FROM org_rw;
GRANT SELECT, INSERT ON "organizations"."access_request" TO org_rw;
GRANT UPDATE ("requested_at", "request_count") ON "organizations"."access_request" TO org_rw;
