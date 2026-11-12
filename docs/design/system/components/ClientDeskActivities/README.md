# ClientDeskActivities

ClientDesk — activities (S131, CR-UI.6). Romanian only for now; keys `crm.activities.*` in `i18n/crm.json`.

**"Activitățile mele".** Tabs "Activitățile mele" / "Calendar"; "Ale mele" / "Toată echipa" / a member, type filter; "Înregistrează un apel", "Activitate nouă". Three groups: overdue (peach due pill), today, this week. Each row: tick, type icon (sarcină, apel, întâlnire, reminder, e-mail), title, what it is linked to (contact, lead, deal, company), due time, menu. A ticked task is struck through, with a Toast; it goes into the history of what it is linked to. Empty: "Nimic de făcut".

**New activity** (Drawer): type, what to do, due date and time (optional), owner, linked to (contacts, leads, deals), reminder (at the due time, 15 minutes, an hour, a day before, none), note.

**Calendar.** A day with Agenda (the "now" line; calls and meetings) and the week with Schedule (Monday–Friday, the "now" line). Tasks without a time don't appear in the calendar. On a phone only the day.

**Logged calls and meetings** (Dialog). A call: result (answered, no answer, voicemail, wrong number), duration, note, "Adaugă pasul următor". A meeting: participants, where (at the client, at the salon, online, by phone), result, note. Both go into the history of the contact, deal and company.

**When something is due.** A notification in ClientDesk ("Acum: sună-l pe Mihai Stanciu") and on the phone, at the reminder time.

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S131).**
- **The calendar's status pills.** Agenda and Schedule show EasyBook's statuses ("Confirmată", "Neconfirmată", "Încheiată"). Recommendation: a `statusLabels` prop on both (1.1.0), so ClientDesk can show "Planificată" / "Făcută"; until then the screens use them as is.
- **Reminder default.** Recommendation: 15 minutes before for calls and meetings, at the due time for tasks; notifications in the app and on the phone, e-mail only for the morning summary.
- **Overdue tasks.** Recommendation: they stay overdue until ticked or moved; never closed automatically.
- **Sync with Google Calendar / Outlook.** Recommendation: only meetings, one way (ClientDesk → calendar), through BookingIntegrations; not for the pilot.
