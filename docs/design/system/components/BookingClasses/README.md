# BookingClasses

EasyBook — classes and groups (B.9, S126). Romanian only for now; keys `booking.classes.*` in `i18n/booking.json`.

**Calendar.** A session sits in the room's column: "Pilates de grup · 8/10" and "2 locuri libere", "Plin" when full.

**The session.** A Drawer: "Clasă", seats left or "Plin", member and room, a bar "Ocupate · 8/10", the participants with their status (Confirmat, Neconfirmat, A venit, Nu a venit) and the row menu ("Marchează: a venit / nu a venit", "Anulează participarea"), "Adaugă participant" (disabled when full), "Anulează sesiunea…". Full: the waiting list, in order.

**Cancelling one participant.** "Locul se eliberează. Cristina Dobre primește oferta, prima de pe lista de așteptare."

**New session.** Class, member, room, seats (from the catalogue, changeable for this session), date and time, "Se repetă săptămânal".

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S126).**
- **A class is a service.** Recommendation: a class is a service with "Clienți în același timp" above 1 (BookingServices) and its own sessions in the calendar.
- **Waiting list for classes.** Recommendation: automatic — when a seat frees up, the first person gets the offer (unlike the general list).
- **Booking online.** Recommendation: allowed, with the seats left shown; closes when full or at the online cut-off.
