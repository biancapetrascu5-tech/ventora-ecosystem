# BookingMoney

EasyBook — complete payments (B.16, B.21, S127). Romanian only for now; keys `booking.money.*` in `i18n/booking.json`.

**On the booking.** The detail gets "Plată": price, paid, "De încasat" (or "Achitat") and "Istoricul plăților" (deposit, rest, refund, fee — each with its method and time; row menu "Rambursează…"). The main button is "Încasează · 300 lei".

**Recording a payment.** A Dialog: the amount (prefilled with what's due; a part is allowed), the method (cash, card at the location, bank transfer, payment link), the date, a note. A payment link sends a Stripe link by e-mail; it counts as paid once the client pays. Partly paid: "Sold restant 100 lei" on the booking and on the client card, with "Încasează".

**Refunds.** Card: back to the card in 5–10 working days through Stripe. Cash: the salon gives the money back, the refund is only noted. Amount (at most what was paid) and a required reason, written to the log.

**Fees (Stripe Connect).** Setări · "Plăți și avans": late cancellation and no-show fees (fixed amount or a percentage of the price), "Cere cardul la rezervarea online, ca garanție" (nothing is charged until needed). When a booking is marked "Nu a venit", the team chooses: from the deposit and the rest from the card, leave it as a balance, or no fee. A declined card leaves the fee as a balance. On the public page, "Card pentru garanție" explains when the fee is charged.

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S127).**
- **Charging the fee.** Recommendation: never automatic; the team confirms each time (drawn this way).
- **Card as guarantee.** Recommendation: only when the salon turns fees on; Stripe keeps the card, Ventora Systems never sees it. To confirm with the lawyer: the consumer notice for charging a saved card.
- **Receipts.** Recommendation: EasyBook records payments but doesn't issue fiscal receipts; the salon keeps using its cash register (casa de marcat) for cash and card at the location. To confirm with the accountant.
- **Who can refund.** Recommendation: the owner and admins; reception can record payments, not refund.

**S128.** The fiscal receipt at "Finalizează programarea", through EasyBook Punte, drawn in BookingFiscal; it replaces the S127 recommendation on receipts when the salon turns it on.
