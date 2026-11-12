# BookingWaitlist

EasyBook — the waiting list (B.9, S126). Romanian only for now; keys `booking.waitlist.*` in `i18n/booking.json`.

**The list.** Programări · "Listă de așteptare · 4": client and phone, what they want (service and member or "Oricine e liber"), when (days and interval), when added, status ("Așteaptă", "Ofertă trimisă · până la 14:40", "Oferta a expirat", "A acceptat"). "Adaugă pe listă": client, service, member, days (a range), interval (any time, morning, afternoon, evening, custom), note. Empty state.

**A time frees up.** A Notice: "S-a eliberat joi, 19 noiembrie, 14:00, la Ioana Pavel" and the matching clients. "Oferă locul": how long the offer lasts (30 min, 1 h, 2 h), SMS or e-mail, the message they get; the time stays free until the client accepts; if someone else books it, the offer closes. Expired: "Oferă următorului".

**The client.** The link opens "S-a eliberat un loc" with the time held ("până la 14:40"), "Iau locul" / "Nu mai am nevoie"; if it's gone: "Locul nu mai e disponibil", they stay on the list.

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S126).**
- **Who gets the offer.** Recommendation: the team chooses (the list is sorted by date added); no automatic offers for the pilot.
- **One offer at a time.** Recommendation: one client at a time per freed time, so two people never accept the same time.
- **SMS.** Recommendation: the offer SMS counts against the business's SMS, like reminders.
