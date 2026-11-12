# BookingTeamSchedule

EasyBook · Setări · "Programul echipei" (S124, for the pilot): who is in the calendar and when each member takes bookings. Romanian only for now; keys `booking.team.*` in `i18n/booking.json`.

**The list.** "Programul afacerii: Lun–Mie 09:00–19:00 · …" with "Schimbă-l în General", then the members in the calendar: name and role, the weekly schedule in one line, what comes next ("Concediu 16–20 nov.", "Liber sâm., 14 nov.", "vin., 13 nov.: 12:00–20:00", "Nimic programat"). Row menu: "Editează programul", "Adaugă o excepție", "Adaugă un concediu".

**No longer in the team.** A separate section: "Scos din calendar pe {date}" and how many past bookings stay ("56 de programări vechi"). They don't appear in the calendar and get no new bookings; past bookings stay in history and reports. Members join and leave from Hub · Echipă și invitații. If someone left with future bookings, a peach Notice on top: "Cristian Dobre nu mai e în echipă, dar are 4 programări viitoare" — they are not cancelled; "Vezi programările".

**A member's schedule** (Drawer; full screen on a phone):
- **Program săptămânal:** one row per day, a toggle and at most two intervals ("Al doilea interval"; "Scoate al doilea interval"). Under each day: "Pauză 13:00–14:00 · Afacerea: 09:00–19:00". A day the business is closed is off and disabled ("Afacerea e închisă").
- **Errors:** an interval before opening or after closing ("Afacerea deschide joi la 09:00. Intervalul poate începe cel mai devreme la 09:00."), overlapping intervals, end before start, and a summary Notice.
- **Excepții pe o dată:** the list, "Adaugă o excepție".
- **Concedii:** the list with the days and the reason, "Adaugă un concediu", "Anulează concediul".

**Exception** (Dialog): the date, "Zi liberă" or "Alt program" (up to two intervals, within that day's business hours). If the member has bookings that day, a peach Notice says so; they are not cancelled.

**Leave** (Dialog): "De la", "Până la" (the number of days under them), "Motiv" (optional; only the owner and admins see it, the calendar shows "Concediu"). Bookings in the period: the same Notice. Error: "„Până la” nu poate fi înainte de „De la”."

Saved: Toast "Am salvat programul. Calendarul arată de acum noile intervale." Empty: "Încă nu e nimeni în calendar" with "Deschide Echipă și invitații".

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S124).**
- **Where it lives.** Drawn as a new Setări tab, "Programul echipei", after "Servicii" (BookingServices and BookingResources show it). Recommendation: keep it here; the Spine's "Echipa" opens this tab. BookingSettings gets the tab at import.
- **Bookings in an exception, a leave, or after someone leaves.** Recommendation: never cancel them automatically; warn and link to them (drawn this way).
- **Changing the business hours later.** Recommendation: members' intervals outside the new hours are cut to the new hours, and the owner sees which members were affected.
- **Leave reason.** Recommendation: visible only to the owner and admins (drawn this way).

**S129 (B.2b, D-B5-6) · the services each member does.** The members table has a "Servicii" column ("6 din 14", "Toate", "Niciunul"). The schedule Drawer has a "Servicii" section after "Program săptămânal" (subtitle "Program săptămânal, servicii, excepții și concedii"): "Toate serviciile" on top (including services added later; partly ticked shows the minus and "6 din 14"), then each category with its own tick ("Toate", "1 din 2", "Niciunul") and its services in two columns. The new booking and the public page show the member only for the services ticked. The same link is edited from the service side in BookingServices ("Cine îl face").
- **A new member** does all services by default: a Notice on the list ("Elena Rusu a intrat în echipă și face toate serviciile", "Alege serviciile"), the row shows "Toate" with the badge "Nou", and the section has everything ticked with "Membrii noi fac implicit toate serviciile. Debifați ce nu face."
- **Unticking the last member of a service:** a peach Notice "„Tratament cu keratină” rămâne fără nimeni care să-l facă" — it can't be booked online or from the calendar; the member's future bookings for it stay ("Ioana Pavel are 3 programări viitoare…"), "Vezi programările".
- **A member who does no service:** "Radu Matei nu face niciun serviciu" — not offered in new bookings or online; stays in the calendar with the schedule.
- Saved: "Am salvat serviciile pentru {name}". Keys `booking.team.col.services`, `booking.team.services.*`.

**DE DECIS (S129).**
- **A new member.** Recommendation: all services by default, with the Notice so the owner checks (drawn this way, as asked).
- **"Toate serviciile".** Recommendation: it includes services added later; otherwise a new service starts with the members of its category (BookingServices).
- **Future bookings when a member stops doing a service.** Recommendation: they stay, with the warning and the link (drawn this way); never moved or cancelled automatically.
- **A member with no services.** Recommendation: allowed (e.g. reception), with the Notice.

