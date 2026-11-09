# BookingResources

EasyBook · Setări · "Resurse" (S124): rooms, spaces and equipment the services need; they are the columns of the calendar's resource view. Romanian only for now; keys `booking.resources.*` in `i18n/booking.json`.

**The list.** "Caută o resursă", "Active · 5" / "Arhivate · 1", "Resursă nouă". Table: name, type (Cameră, Spațiu, Echipament, each with its icon), the services that need it ("Tuns damă, Tuns bărbați și încă 3"), how many bookings at the same time ("3 programări"). Row menu "Editează", "Arhivează".

**The form** (Drawer; full screen on a phone): "Numele resursei" (required), "Tip", "Servicii care o cer" (optional, a multiple Combobox grouped by the services' categories; "O programare pentru aceste servicii are nevoie de un loc liber în resursă."), "Câte programări simultan" (required, at least 1; "de exemplu, 3 pentru un coafor cu 3 posturi"). Editing adds "Arhivează resursa".

**Errors.** "Ai deja o resursă numită „{name}”. Alege alt nume."; "Pune cel puțin 1."; a summary Notice.

**Archive and restore.** A Dialog: it leaves the calendar and can't be chosen for services; the services that need it ("2 servicii o cer: Tratament facial, Pensat") can be booked without it while it is archived and need it again when it's restored; future bookings that use it stay. "Arhivate" lists archived resources with "Restaurează"; Toast "Am restaurat „{name}”. Serviciile care o cereau o cer din nou." Empty states: no resources ("Încă nu ai resurse"), nothing archived.

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S124).**
- **Services that need an archived resource.** Recommendation: while it is archived they can be booked without it; restoring brings the requirement back (drawn this way). Alternative: block archiving while services need it.
- **Types.** Recommendation: the three fixed types (Cameră, Spațiu, Echipament), no custom types for now.
