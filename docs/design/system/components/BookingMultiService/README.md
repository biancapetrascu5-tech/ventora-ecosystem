# BookingMultiService

EasyBook — one booking with several services in a row (B.9, S126): the same client, one or more team members, the total duration and the breaks. Romanian only for now; keys `booking.multi.*` in `i18n/booking.json`.

**Creating.** In BookingNew, "Servicii" is a list of steps: each with service and member and its times ("10:00–11:30"); between steps "Pauză după" (none, 5, 10, 15, 30 min); "Adaugă încă un serviciu". The summary shows the timeline, "Durata totală: 3 h 25 min, cu pauzele" and the total price.

**Conflict.** If one member isn't free when their step starts: the error on that step and a Notice with the first time when all steps fit ("Folosește 11:15") or "Schimbă ordinea serviciilor".

**Calendar and detail.** Each step sits in its member's column with "1/3 · Vopsit rădăcină", "2/3 · …". The detail lists the steps (member, times, price), the total duration, the break and the total.

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S126).**
- **Moving or cancelling.** Recommendation: the whole booking moves or is cancelled together; one step can be changed only from the detail, by the team.
- **Online.** Recommendation: not on the public page for the pilot; later, at most 3 services, in the salon's order.
