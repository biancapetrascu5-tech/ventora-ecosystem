# BookingBehaviorNote

EasyBook — Setări › General: the "Nota de comportament" switch (B.7, S139). Completes BookingSettings and BookingClientCard. Romanian only for now; keys `booking.behavior.*` in `i18n/booking.json`.

**Off by default.** No card gets a label and no deposit is asked because of it. Turning it on asks first: only no-shows from now on count, the client isn't told and never sees it, it can be turned off any time (existing labels disappear).

**The labels.** "Risc ridicat" — the client didn't come twice in the last 6 months; online, a deposit is asked for any service; the owner gets an alert. "Fără notă" — everyone else; the note disappears after 6 months without no-shows or when removed with a reason. When on, the rule can be set (2 or 3 no-shows; 3, 6 or 12 months; bookings cancelled in time don't count).

**Who sees it.** Owner, admins and reception; members don't. Removing it: from the client card, with a reason, logged.

**Never for the client.** Not on the public page, in e-mails or SMS, and it never leaves EasyBook: not in ClientDesk or CampaignKit, the API or webhooks.

Shown at 1280, 820 and 390, light and dark.
