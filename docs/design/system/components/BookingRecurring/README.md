# BookingRecurring

EasyBook — recurring bookings (B.9, S126). Romanian only for now; keys `booking.recurring.*` in `i18n/booking.json`.

**Creating.** BookingNew gets a "Repetare" section: "Se repetă", "Cât de des" (Săptămânal, La 2 săptămâni, Lunar), "Până când" (a date or a number of bookings) and the rule in words ("În fiecare marți, la 10:00"). The summary shows "8 programări · 17 nov. – 5 ian.", the first dates and "și încă 3"; the button says how many are booked.

**Conflicts.** Found before saving: "2 din 8 date nu sunt libere", each date with the reason (time taken, the member on leave, salon closed) and what to do: skip that date, move it to the nearest free time, or keep the time with another member.

**Editing and cancelling.** BookingDetail shows "Se repetă · 3 din 8" and the series. "Modifică" and "Anulează" ask: "Doar aceasta", "Aceasta și următoarele" (how many, from when) or "Toate din serie" (the ones that took place stay in history). The client gets one e-mail with the change.

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S126).**
- **Longest series.** Recommendation: at most 52 bookings or 12 months, whichever comes first.
- **Monthly.** Recommendation: "the third Tuesday of the month" (same weekday), not "the 17th"; a date that doesn't exist is skipped.
- **Deposit on a series.** Recommendation: a deposit per booking, charged when each one is confirmed, not for the whole series at once.
