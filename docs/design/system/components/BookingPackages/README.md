# BookingPackages

EasyBook — session packages (B.9, S126). Romanian only for now; keys `booking.packages.*` in `i18n/booking.json`.

**Defining.** Setări · Servicii · "Pachete de ședințe": the list (package, validity, price with "în loc de …", sold). "Pachet nou": name, service, number of sessions, validity (1, 3, 6, 12 months or none), price, with how much the client saves.

**Selling.** "Vinde un pachet…" on the client card: the package, valid from (and when it expires), how they pay (card at the salon, cash, payment link). The button shows the amount.

**On the client card.** "Pachete": the package, status (Activ, Expirat, Folosit), "4 din 10 ședințe rămase", valid until, the dates used. Bookings paid from the package show "Din pachet".

**When booking.** "Plata": "Din pachet" (which package and how many are left after this booking) or "Plată obișnuită".

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S126).**
- **When a session is used.** Recommendation: when the booking is marked done; a no-show or a late cancellation also uses one; an on-time cancellation gives it back.
- **Expired sessions.** Recommendation: they are lost; the owner can extend a package by hand, with a reason in the log.
- **Online.** Recommendation: packages are sold at the salon for the pilot; online sale with Stripe later.
- **Accounting.** To confirm with the accountant: the package is invoiced when sold (an advance), not per session.
