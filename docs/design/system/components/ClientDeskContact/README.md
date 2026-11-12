# ClientDeskContact

ClientDesk — the contact card (S130, CR-UI.3). Romanian only for now; keys `crm.contact.*` in `i18n/crm.json`.

**Header.** Name, "EasyBook" when linked, client state, tags, owner; "Sarcină", "Notiță", "E-mail", "Deal nou" (on a phone a row of small buttons under the header).

**One history.** Notes, comments with @mentions, tasks and activities, e-mails, deals, EasyBook bookings, field changes, consent — one list, newest first, filtered with "Ce arată istoricul". It is drawn as a list with icons; the system's `Timeline` is the Gantt of project stages, so it isn't used here.

**Notes and comments.** "Notiță" / "Comentariu"; "@" opens the team members, whoever is mentioned gets a notification. Attachments (PNG, JPG, PDF, 10 MB): as soon as a file is added, a peach Notice "Nu atașa date medicale" — tests, diagnoses, prescriptions or allergies don't go into ClientDesk; health information for a booking stays only in EasyBook.

**The side.** Contact data; the business's own fields ("Data nunții", "Părul", "Buget", "Cum a aflat de noi"; which fields exist is chosen in Settings); birthday with "Amintește-mi de ziua de naștere" (a task for the owner 3 days before); marketing consent per channel (e-mail / SMS): given (when, how, the text accepted), not given ("Înregistrează consimțământul": when, how, proof, "I-am spus că poate retrage oricând"), withdrawn (when, how, who recorded it), "Retrage" (Dialog; the contact leaves e-mail campaigns, including scheduled ones; booking messages continue). Files, with the rule.

**Linked to EasyBook.** Name, phone, e-mail and language are read-only (lock) with "Editează în EasyBook"; tags, owner, company and the business's fields are edited here. "Programări în EasyBook" (the next and the last ones, with status), "Programare nouă", "Deschide în EasyBook" (BookingClientCard). Bookings also appear in the history. The "Risc ridicat" note, the blocked-clients list and health data never appear in ClientDesk — not on the card, in filters, segments, export or search.

**A member** sees only the contacts assigned to them and the unassigned ones; opening another one: "Contactul e atribuit altui membru al echipei".

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S130).**
- **Who owns the basic data of an EasyBook contact.** Recommendation: EasyBook (drawn this way); ClientDesk only reads it.
- **EasyBook consent.** Decided (S134): marketing consent comes ONLY from the separate box, unticked by default, at the online booking — e-mail and SMS each with its own box; the booking alone never gives consent. The card shows "bifa separată de la rezervarea online din EasyBook".
- **Attachments.** Recommendation: the warning on every attachment (drawn this way), no automatic scanning; the owner can delete any file, written to the log.
- **Unassigned contacts.** Recommendation: every member sees them and can "take" them (they become the owner); the owner reassigns.
- **Mentions.** Recommendation: only members who have access to the contact can be mentioned.

**S133.** "E-mail" opens the compose Drawer (ClientDeskEmail); the consent section per channel, with recording, withdrawing and the history, is detailed in ClientDeskConsent; sequences: ClientDeskSequences.
