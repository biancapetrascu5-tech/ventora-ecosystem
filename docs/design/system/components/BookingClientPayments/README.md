# BookingClientPayments

EasyBook — the client card gets "Încasări" (B.7, S125), a tab next to "Programări" on BookingClientCard. Romanian only for now; keys `booking.client.pay.*` in `i18n/booking.json`.

**The list.** Every payment of the client, per booking: service (and what happened: "anulată târziu", "nu a venit"), date, method ("Card, online", "Card, la salon", "Numerar", "Transfer bancar"), what it was ("Avans", "Rest", "Integral", "Taxă de anulare târzie"), with "Rambursat 50 lei" or "Reținut de salon", and the amount. Under it: "Încasat", "Rambursat", "Total" (the same figure as "Încasat în total" in the stats). Empty: "Nicio încasare încă".

**Who sees it.** The owner, admins and reception, like the note "Risc ridicat"; a member sees neither the tab nor the stats.

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S125).**
- **Who sees the payments.** Recommendation: owner, admins and reception, as for "Risc ridicat" (drawn this way).
- **Refunded deposits in the total.** Recommendation: the total is net (collected minus refunded); a deposit kept by the salon counts as collected.

**S127 (B.16).** The outstanding balance ("Sold restant") and "Încasează" on the client card, drawn in BookingMoney.
