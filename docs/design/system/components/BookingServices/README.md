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

**S124.** The tab row includes "Programul echipei"; icons that are not in the set were replaced (archive actions have no icon, restore uses `rotate-ccw`, "Categorie nouă" uses `folder`).

**S129 (B.2b, D-B5-6) · who does each service.** The list has a "Cine îl face" column: the members' avatars and a count ("2 membri", "1 membru"), "Toată echipa", or "Nimeni". A service nobody does shows "Nu se poate rezerva" (peach) instead of "Online" / "Doar de echipă", and a peach Notice above the list: "Nimeni din echipă nu face „Curs de automachiaj”" — it is not on the public page and can't be booked from the calendar until someone does it; "Alege cine îl face" opens the form. The form has a "Cine îl face" fieldset before "Se poate rezerva online": "Toată echipa" (including members who join later; the members are then ticked and disabled) or the members ticked one by one; with nobody, a Notice "Nimeni nu face acest serviciu" and the online toggle is off and disabled. A new service starts with the members who already do services in its category ("Am bifat cine face deja servicii din „Păr”."). The member side is the "Servicii" section in BookingTeamSchedule. Keys `booking.services.col.members`, `members.*`, `online.blocked`, `noMember.*`, `form.members*`.

**The effect, drawn here.** In the new booking (BookingNew), "Cu cine" lists "Oricine e liber" and only the members who do the chosen service ("Apar doar cei care fac „Vopsit rădăcină”: Ioana Pavel, Radu Matei."); a service nobody does shows the Notice "Nimeni din echipă nu face „{service}”" with "Deschide serviciul", and the date and time are disabled. On the public page (BookingPublic), "Alegeți cu cine" lists only those members; "Oricine e liber" chooses among them. Keys `booking.cx.new.membersHint`, `booking.cx.new.noMember.*`.

**DE DECIS (S129).**
- **A service nobody does.** Recommendation: it stays in the list with the warning, it's hidden on the public page and the calendar won't book it (drawn this way); saving the form with nobody is allowed, with the Notice.
- **"Toată echipa".** Recommendation: it includes members who join later (drawn this way); ticking everyone one by one does not.
- **A new service.** Recommendation: pre-tick the members who do other services in the same category; "Fără categorie" pre-ticks nobody.
- **Per-member duration and price** (a senior stylist charges more). Recommendation: not for the pilot; the same duration and price for everyone.

**S137 · duration and price per member** (the S129 decision, batch after B.2b). In "Cine îl face", each ticked member gets two optional fields: duration (min) and price (lei or €), with the service's values as placeholders; empty = the service's values. Under the fields: "60 min · 150 lei (serviciul: 45 min · 120 lei)" or "Ca serviciul: 45 min · 120 lei". The lead says it: "Lângă fiecare membru poți pune altă durată sau alt preț. Gol = valorile serviciului." In the list, a service with overrides shows "Diferă pe membru" under its price. A member's price lower than the service's deposit: a peach Notice "Prețul pentru Mara Enache (90 lei) e mai mic decât avansul (100 lei)", the price field in error, and saving is disabled until the price or the deposit changes.

**The effect, drawn here.** In the new booking (BookingNew), "Cu cine" lists each member with their duration and price ("Stilist · 60 min · 150 lei"); choosing one sets the summary's duration and price. "Oricine e liber" shows the range ("45–60 min · 120–150 lei"), and once a time is chosen the person free then sets the price ("La 14:00 e liber Radu Matei: 120 lei."). On the public page (BookingPublic), every member shows their duration and price, "Oricine e liber" shows the range, and the summary says "Prețul depinde de cine e liber: 120–150 lei. Îl vedeți înainte să confirmați." Keys `booking.services.member.*` (Romanian only for now) and `booking.public.anyoneRange` (6 languages, like the rest of the public page).

**DE DECIS (S137).**
- **Variable duration or price ("de la", interval) with an override.** Recommendation: the override is one fixed value (drawn); a member can't have their own range.
- **A member's price under the deposit.** Recommendation: block saving (drawn); never lower the deposit automatically.
- **"Oricine e liber" on the public page.** Recommendation: show the range before choosing the time, and the exact price on the time step and in the summary, before the e-mail code.
- **"Toată echipa" and members who join later.** Recommendation: they get the service's values until someone sets theirs.
- **Discounts and promo codes.** Recommendation: they apply to the member's price, not to the service's.

**S138 · the member's duration and price are as rich as the service's** (B.2c, as in the code). Each ticked member shows a summary line ("75–120 min · 200–300 lei (serviciul: 60–90 min · 150–250 lei)" or "Ca serviciul: …") and "Durată și preț"; opened, the member gets the same controls as the service: duration "Fixă" / "Variabilă" (minimum–maximum) and price "Fix" / "De la" / "Interval", plus "Folosește valorile serviciului". Drawn: Ioana Pavel at "Tuns damă" (60 min · 150 lei), at "Coafat de ocazie" (75–120 min · 200–300 lei) and at "Vopsit rădăcină" (90–120 min · de la 260 lei). The deposit check uses the member's lowest price ("De la" or the start of the interval).

**The effect.** In BookingNew, "Cu cine" lists each member with their duration and price, ranges included ("Stilist · 75–120 min · 200–300 lei"); choosing one puts the range in the summary, with "Prețul final îl stabilește Ioana Pavel la salon, în intervalul de mai sus." and, for a variable duration, "În calendar ocupă durata maximă, 120 min; se poate scurta pe programare." "Oricine e liber" spans everyone: the shortest minimum to the longest maximum and the lowest to the highest price ("60–120 min · 150–300 lei"); with a "De la" price among them it reads "de la 150 lei". On the public page each member shows "75–120 min · 200–300 lei" or "de la 260 lei", and the summary says "Prețul final se stabilește la salon, în intervalul afișat." New keys `booking.services.member.edit`, `boxTitle`, `reset`, `finalNote`, `holdMax`; `booking.public.priceFrom` and `booking.public.priceFinal` in the 6 languages.

**Corrected (S138).** The S137 recommendation "the override is one fixed value" is replaced: a member's override has the same shape as the service's.
