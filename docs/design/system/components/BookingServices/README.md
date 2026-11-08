# BookingServices

EasyBook · Setări · "Servicii" (S123): the catalogue of services the business offers. It fills the "Servicii" tab of BookingSettings. Romanian only for now; keys `booking.services.*` in `i18n/booking.json`.

**The list.** Services grouped by category, in the categories' order, then "Fără categorie" (always last, "Apar la final, după categorii."). Each category is a SheetSection with its count ("5 servicii") and a menu: "Redenumește", "Arhivează categoria". The table: name, duration ("45 min" or "60–90 min"), price ("120 lei", "de la 220 lei", "150–250 lei", "de la 250 €"), clients at the same time ("1 client", "Până la 6 clienți"), booking ("Online" or "Doar de echipă"); row menu "Editează", "Arhivează". The columns have the same widths in every category, so they line up. On a phone the tables are lists.

**Toolbar.** "Caută un serviciu", "Active · 14" / "Arhivate · 3", "Ordinea categoriilor", "Categorie nouă", "Serviciu nou". On a tablet "Ordinea categoriilor" goes into the menu; on a phone "Categorie nouă" too.

**The service form** (Drawer; full screen on a phone): name (required), category ("Fără categorie", "Categorie nouă…"), description (optional, shown on the online booking page), duration fixed or variable (minimum–maximum, in 5-minute steps, 5 minutes to 8 hours), price fixed / "De la" / "Interval", currency RON (lei) or EUR (€), clients at the same time, "Se poate rezerva online". Editing adds "Arhivează serviciul" in the footer.

**Errors.** "Ai deja un serviciu numit „{name}”, în {category}. Alege alt nume."; a duration not in 5-minute steps; maximum not greater than minimum; outside 5 min – 8 h; "Până la" not greater than "De la"; a summary Notice on top.

**Categories.** "Categorie nouă" and "Redenumește categoria" (Dialog, duplicate name error). "Ordinea categoriilor": a Dialog with move up / move down for each category; "Fără categorie" stays last, locked.

**Archive and restore.** Archiving a service asks first: it no longer appears for new bookings or online; future bookings stay in the calendar. A category with active services can't be archived: "Categoria „Păr” are servicii active" — move or archive its services first. "Arhivate" lists archived services (with their category and date, "Restaurează") and archived categories ("Restaurează categoria"). A service whose category is archived goes back to "Fără categorie". Empty states: no services at all ("Încă nu ai servicii", "Adaugă primul serviciu") and nothing archived.

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S123).**
- **Where the catalogue lives.** Drawn in Setări · "Servicii", as asked; the Spine also has "Servicii" (Gestionare). Recommendation: one page — the Spine entry opens this same page.
- **Currency per service.** The business has one currency (S113). Recommendation: the field starts with the business's currency; a service in the other currency is shown and charged (deposit) in that currency.
- **Variable duration.** Recommendation: online bookings hold the maximum; the team can shorten it on the booking (drawn this way).
- **Unique names.** Recommendation: unique among active services of the business; restoring a service whose name is taken shows the duplicate error.
- **Clients at the same time.** Recommendation: per team member (two clients for one manicurist), not for the whole business.
- **Restoring into an archived category.** Recommendation: it goes to "Fără categorie" (drawn this way), the category stays archived.
