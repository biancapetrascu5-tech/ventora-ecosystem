# BookingHealthAccessLog

EasyBook — the read log of a client's health information (B.8, S125), a completion of BookingHealthFields. Romanian only for now; keys `booking.health.log.*` in `i18n/booking.json`.

**Where.** On the client card, under the health information: "Cine a văzut informațiile" (owner and admins only). It opens a Drawer "Cine a văzut informațiile medicale".

**The log.** Who (name and role), when (date and time), from where ("Fișa clientului" or "Programarea din {date}"). "Jurnalul nu se poate modifica sau șterge." and "Jurnalul îl văd doar proprietarul și adminii." Period: last 30 days (default), 90 days, 12 months, "De la consimțământ", with the count ("5 deschideri"). Empty: "Nimeni nu le-a deschis în perioada aleasă" with "De la consimțământ".

**Members.** A member who doesn't do the appointment sees neither the information nor the log (as in BookingHealthFields).

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S125).**
- **What counts as a read.** Recommendation: opening the health section on the card or on a booking; repeated opens by the same person within 15 minutes are one line.
- **Where.** Recommendation: per client (drawn this way); a salon-wide log and an export later, if the lawyer asks for them.
- **How long the log is kept.** To confirm with the lawyer (proposal: as long as the answers, plus 24 months).
