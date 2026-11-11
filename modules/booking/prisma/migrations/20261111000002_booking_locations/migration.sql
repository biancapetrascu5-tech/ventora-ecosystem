-- Lot B.10 (BOOKING.md; D-B-3 = a): the business's locations in Booking. The locations live in
-- core/organizations (C.1); Booking keeps only their id and checks it through getActiveLocation
-- (ARCHITECTURE §6.4 b), so there is no foreign key across the modules.
--
-- Additive: three nullable columns (null = every location / a business with one site, as before)
-- and one index for the calendar of a location. Grants only to booking_rw: UPDATE of the new
-- column on staff_member and resource; appointment.location_id is written by the INSERT (already
-- granted) and never changed (no UPDATE grant: an appointment keeps its location).
-- No new role, no new audit category, no personal data (erase_client is unchanged).

ALTER TABLE "booking"."staff_member" ADD COLUMN "location_id" UUID;
ALTER TABLE "booking"."resource" ADD COLUMN "location_id" UUID;
ALTER TABLE "booking"."appointment" ADD COLUMN "location_id" UUID;

CREATE INDEX "appointment_location_id_starts_idx" ON "booking"."appointment"("location_id", "starts_at");

GRANT UPDATE ("location_id") ON "booking"."staff_member" TO booking_rw;
GRANT UPDATE ("location_id") ON "booking"."resource" TO booking_rw;
