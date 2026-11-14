-- Lot B.21b — „Data încasării” (design BookingMoney, S127: booking.money.date). Decision of the
-- founder (14.11): a payment can be recorded with a day in the past, never in the future, at most
-- 30 days back (the business's zone, checked by the contract). The day of the payment is its own
-- column; recorded_at stays the moment it was written (the audit and the event keep it).
--
-- The rows written before: their day is the day they were recorded, in Europe/Bucharest (the
-- default zone of a business, D-B-4; only test data so far). The CHECK is the outer bound against
-- recorded_at (31 days back, 1 day ahead for the zones east of UTC); the exact rule is the contract's.
-- No new grant: the column is written only by INSERT (booking_rw has INSERT on the table).

ALTER TABLE "booking"."appointment_payment" ADD COLUMN "paid_on" DATE;

UPDATE "booking"."appointment_payment"
   SET "paid_on" = ("recorded_at" AT TIME ZONE 'Europe/Bucharest')::date
 WHERE "paid_on" IS NULL;

ALTER TABLE "booking"."appointment_payment" ALTER COLUMN "paid_on" SET NOT NULL;

ALTER TABLE "booking"."appointment_payment"
  ADD CONSTRAINT "appointment_payment_paid_on_check"
  CHECK ("paid_on" BETWEEN ("recorded_at" AT TIME ZONE 'UTC')::date - 31
                       AND ("recorded_at" AT TIME ZONE 'UTC')::date + 1);
