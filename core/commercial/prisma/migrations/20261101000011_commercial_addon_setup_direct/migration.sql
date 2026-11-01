-- Lot 3.5 — commercial_addon_setup_direct: D3-24 înlocuiește D3-23 și pentru pachete (decizia
-- fondatoarei, 01.11.2026), la fel ca migrarea 010 pentru aplicații.
--
-- „Direct / La cerere” se alege liber pentru fiecare pachet, indiferent de costul de
-- implementare. Pe „Direct”, implementarea se plătește la cumpărare, cu cardul (Lotul 3.5).
-- Se scot trigger-ele pachetelor din migrarea 008 (addon_setup_on_request).

DROP TRIGGER IF EXISTS "addon_setup_on_request" ON "commercial"."addon";
DROP TRIGGER IF EXISTS "addon_price_setup_on_request" ON "commercial"."addon_price";
DROP FUNCTION IF EXISTS commercial.addon_setup_on_request();
