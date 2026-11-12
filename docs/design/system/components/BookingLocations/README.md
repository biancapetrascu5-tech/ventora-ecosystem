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
