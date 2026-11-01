-- Lot 3.4 — commercial_app_setup_direct: D3-24 înlocuiește D3-23 pentru aplicații (decizia
-- fondatoarei, 01.11.2026, după S117 / FounderApps 1.1.0).
--
-- „Direct / La cerere” se alege liber pentru fiecare aplicație, indiferent de costul de
-- implementare. Pe „Direct”, implementarea se plătește la activare, cu cardul.
-- Se scot trigger-ele aplicației din migrarea 008 (application_setup_on_request); cele ale
-- pachetelor (addon_setup_on_request) rămân neschimbate.

DROP TRIGGER IF EXISTS "application_setup_on_request" ON "commercial"."application";
DROP TRIGGER IF EXISTS "application_price_setup_on_request" ON "commercial"."application_price";
DROP FUNCTION IF EXISTS commercial.application_setup_on_request();
