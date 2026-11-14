-- Lot B.11c — the salon's phone (decision of the founder, 14.11: on the location, with the
-- business's as fallback). Shown to the clients on the public pages of EasyBook: „Sună la salon”,
-- „Sunați la salon și vă găsim o oră: {phone}”, the manage page when it is too late to change
-- online or online changes are closed. Optional: nothing is shown without one. The fields where it
-- is written: NECESITĂ DESIGN (the „business” step of the onboarding guide, AppHelp).
--
-- E.164, as the clients' phones of Booking (+ and 7–15 digits). org_rw already has UPDATE on the
-- whole organization table (init); the location has UPDATE by column (C.1): one more column.

ALTER TABLE "organizations"."organization" ADD COLUMN "phone" VARCHAR(16);
ALTER TABLE "organizations"."organization"
  ADD CONSTRAINT "organization_phone_check" CHECK ("phone" IS NULL OR "phone" ~ '^\+[1-9][0-9]{6,14}$');

ALTER TABLE "organizations"."location" ADD COLUMN "phone" VARCHAR(16);
ALTER TABLE "organizations"."location"
  ADD CONSTRAINT "location_phone_check" CHECK ("phone" IS NULL OR "phone" ~ '^\+[1-9][0-9]{6,14}$');
GRANT UPDATE ("phone") ON "organizations"."location" TO org_rw;
