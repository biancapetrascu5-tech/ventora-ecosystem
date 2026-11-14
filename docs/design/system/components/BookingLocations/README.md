# BookingLocations

EasyBook — several locations (B.10, S126). Romanian only for now; keys `booking.locations.*` in `i18n/booking.json`.

**Calendar.** A location picker in the header ("Salon Aurora · Centru"); the columns are the members who work there that day.

**New booking.** "Locație" comes first; the members and free times are those of that location; the summary starts with "Unde".

**Settings · Locații.** The list (name and address, hours, team). A location: name, phone, address, its hours, who works there and on which days ("Lun–Mie aici · Joi–Sâm la Turnișor"). "Același membru nu poate fi în două locații în aceeași zi la aceeași oră."

**Public page.** "Alegeți salonul" is the first step, with the address and today's hours.

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S126).**
- **Billing.** Recommendation: one business with several locations, one subscription; booking limits count for the whole business.
- **Member days per location.** Recommendation: each interval in Programul echipei (BookingTeamSchedule) gets a location.
- **Public link.** Recommendation: one link per business with the location step, plus a direct link per location that skips it.
- **Clients.** Recommendation: shared across locations (one client card).

**S150 · Telefonul și programul pe locație (1.1.0).**

- **Telefonul locației** e opțional, cu prefixul țării. Fără el, pe pagina publică apare telefonul afacerii.
- **Programul locației.** Comutatorul „La fel ca programul afacerii” e pornit implicit; programul afacerii apare doar citire și se schimbă din Setări › General. Oprit, locația primește programul ei, zi cu zi. Eroare: ora de închidere înainte de deschidere.
- **Lista „Locații”** arată sub program „Programul afacerii” sau „Program propriu”.
- **Pagina publică**, la „Alegeți salonul”: „Azi: 09:00–19:00” sau „Închis azi” (după programul locației și zilele libere, BookingClosures).

Zilele libere sunt în BookingClosures. Cheile sunt `booking.locations.*`, în 6 limbi. Desenat la cadrele 7–12, cu test DE / IT.

DE DECIS:

- **Dacă locația cu program propriu urmează automat schimbările programului afacerii.** Recomandare: nu; doar cele cu „La fel ca programul afacerii”.
- **Dacă o locație „Închis azi” se mai poate alege.** Recomandare: da, pentru zilele următoare.
