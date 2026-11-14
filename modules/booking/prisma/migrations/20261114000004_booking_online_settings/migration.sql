-- Lot B.11d — Setări › Rezervări online (design BookingOnlineSettings, S146). Decisions of the
-- founder (14.11): the settings the screen shows are applied, not only stored:
--   * the booking page on / off: off refuses new online bookings (B.11a: the free times, the hold
--     and the code); the page itself still answers, with the salon's phone. NULL = on; the moment
--     it was turned off is kept for „Rezervările online sunt oprite din {date}”. Bookings already
--     made stay, and their page (B.11b) keeps working;
--   * until how many hours before the client can move or cancel from their link (B.11b), 2 by
--     default (S125), between 1 and 72; after that, „Sunați la salon”;
--   * the message after booking (optional, at most 300 characters, plain text): shown on the
--     confirmation of the public page.
-- Existing businesses keep what they had: the page on, 2 hours, no message.

ALTER TABLE "booking"."settings"
  ADD COLUMN "online_off_since"      TIMESTAMPTZ,
  ADD COLUMN "manage_cutoff_hours"   SMALLINT NOT NULL DEFAULT 2,
  ADD COLUMN "after_booking_message" VARCHAR(300);
ALTER TABLE "booking"."settings"
  ADD CONSTRAINT "settings_manage_cutoff_hours_check" CHECK ("manage_cutoff_hours" BETWEEN 1 AND 72),
  ADD CONSTRAINT "settings_after_booking_message_check"
    CHECK ("after_booking_message" IS NULL OR btrim("after_booking_message") <> '');
GRANT UPDATE ("online_off_since", "manage_cutoff_hours", "after_booking_message")
  ON "booking"."settings" TO booking_rw;
