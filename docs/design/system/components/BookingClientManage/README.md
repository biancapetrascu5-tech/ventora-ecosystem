# BookingClientManage

EasyBook — the client's page for moving or cancelling a booking (B.11, S125), opened from "Modificați sau anulați programarea" in the confirmation e-mail (BookingClientEmails), without an account. Same shell as BookingPublic; the client is "dumneavoastră". Romanian only for now; keys `booking.manage.*` in `i18n/booking.json`.

**The booking.** "Programarea dumneavoastră": status, salon and address, service, who, when, price, the deposit paid and what is left to pay at the salon. The policy: "Puteți muta sau anula gratuit până {date}, cu cel puțin 24 de ore înainte. După aceea, salonul poate reține avansul de 50 lei." (or "o taxă de 50 lei" without a deposit) and "Online puteți face schimbări până cu 2 ore înainte." Buttons "Mută programarea" and "Anulează programarea".

**Move.** Another day and time as on BookingPublic (Calendar on desktop, a strip of days on phones, SlotPicker). The chosen time is held 10 minutes ("Păstrăm ora 15:30 pentru dumneavoastră încă 9:42."); the old one stays theirs until they confirm; the deposit moves with the booking. After 10 minutes: "Au trecut cele 10 minute", the booking is unchanged.

**Cancel.** "Anulați programarea?" with what is cancelled, then a Notice: free cancellation with the deposit refunded in 5–10 working days, or (late) "Salonul poate reține avansul de 50 lei" / "o taxă de 50 lei"; the salon's deposit policy (`booking.deposit.policy.*`); "Nu, păstrez programarea" / "Da, anulează programarea".

**States.** Too late for online changes ("Sunați la salon: 0722 123 456"); already cancelled; link expired or invalid; booking over ("Faceți o programare nouă"); the salon stopped online bookings.

**Done.** "Am mutat programarea" (new time, confirmed, "Adaugă în calendar") and "Am anulat programarea" (the refund to the card), both with "V-am trimis un e-mail de confirmare la {email}."

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S125).**
- **Online cut-off.** Recommendation: changes online until 2 hours before (a Settings · Reguli value); between 24 h and 2 h, cancelling is allowed with the late-cancellation warning; after that, only by phone.
- **Moving late.** Recommendation: moving is free until the online cut-off and the deposit moves with the booking; at most one move online per booking, the next one by phone.
- **Moving a service with manual confirmation.** Recommendation: the move becomes a request ("Neconfirmată"); the old time is released only when the salon confirms.
- **The link.** Recommendation: one link per booking, valid while the booking exists (it survives a move); after the time has passed it shows "Programarea a avut loc".
- **The late fee without a deposit.** Recommendation: nothing is charged online; the fee is noted on the client card and asked at the next visit.

**S146 · B.11b.** Three more states (keys `booking.manage.started.*`, `.expired.body`, `.revoked.body`, `.bookAgain`, `.salonPhone`, 6 languages): after the appointment started — only the details (the state "În desfășurare"), no "Mută" / "Anulează", "Programarea a început. Pentru schimbări, sunați salonul." and the salon's phone; 30 days after the appointment the link expires — "Linkul nu mai e valabil", what the booking was, the phone, "Programează din nou"; revoked after the client's data was deleted — the same screen without any detail. DE / IT test.
