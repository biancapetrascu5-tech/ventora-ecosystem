# BookingStatuses

EasyBook — the 7 states of an appointment (D-B-11) with their StatusPill, and the transitions BookingDetail allows from each one (S116 f). Keys `booking.status.*` and `booking.action.*` in `i18n/booking.json`, 6 languages.

**The states and their pills.** Așteaptă plata (neutral, wallet) · Neconfirmată (neutral, clock) · Confirmată (neutral, check) · În desfășurare (attention, circle-dot) · Încheiată (done, check-check) · Anulată (neutral, x — with who cancelled and how long before, and whether the deposit is kept) · Nu a venit (danger, circle-x). Final: Încheiată, Anulată, Nu a venit.

**Transitions.** Așteaptă plata → Confirmată (automatic, on payment) or Anulată (the hold ends, the client or the salon cancels). Neconfirmată → Confirmată, Anulată, Nu a venit (after the start time). Confirmată → În desfășurare, Anulată, Nu a venit. În desfășurare → Încheiată (with collecting the payment). In the drawer, the footer holds the main allowed action, the "…" menu the others; nothing else is offered. A final state shows "Programează din nou" and, for the owner or an admin, "Corectează starea…".

**Decided (S116, 4 Nov. 2026).**
- S116-D7 · On screen, the glossary labels ("Încheiată", "Nu a venit"); the D-B-11 names stay as technical ids (`completed`, `no_show`).
- S116-D8 · "Nu a venit" uses the `danger` tone.
- S116-D9 · A final state can be corrected within 24 hours by the owner or an admin, with a reason in the log.

The other EasyBook screens (BookingList, BookingToday, BookingDetail) still use the 5 earlier states; on import they take these 7.

Shown at 1280 and 390, in light and dark, plus the pills in all 6 languages.

**S147.** Din „În desfășurare” s-a scos „Anulează programarea”: rămân „Încasează” (duce la „Încheiată”) și „Corectează starea…”.

**S148.** Din „În desfășurare” s-a scos și „Corectează starea…”: corectarea e doar pentru stările finale. Rămâne „Încasează” (→ „Încheiată”); meniul „Mai multe acțiuni” nu mai apare pentru această stare.
