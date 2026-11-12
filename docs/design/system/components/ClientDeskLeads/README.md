# ClientDeskLeads

ClientDesk — leads (S131, CR-UI.4). Romanian only for now; keys `crm.leads.*` in `i18n/crm.json`.

**The inbox.** Separate from contacts: leads don't count toward the 3.000-contact limit; they become contacts only when converted (said on the page). Search, "Deschise · 5" / "Calificate · 1" / "Închise · 14", source filter, "Lead nou". DataTable: lead (name and what they asked for), source (formular, telefon, e-mail, recomandare, eveniment, manual), score with its reasons ("+20 a deschis oferta · +20 recomandare"), owner ("Neatribuit"), state ("Nou", "Contactat", "Calificat", "Descalificat", "Convertit"), received. Row menu: open, "Contactat", qualify, convert, disqualify. Empty: "Nicio cerere nouă", with the site form.

**The lead card.** Header: name, the request, source, date; state, "Scor 85", owner; "Sarcină", "Descalifică", "Convertește". The request in their words, the history (the same feed as contacts), the score broken into reasons, the details (phone, e-mail, source with who recommended, budget, event date).

**Convert** (Dialog): the contact (name, phone), "Creează și un deal" (name, estimated value from the declared budget, pipeline and stage), "Ce se păstrează": history, notes and comments, files, source and referrer, owner. The score stays on the lead; the lead goes to "Închise" as "Convertit", linked to the contact. Toast: the contact now counts toward the limit.

**Duplicate at conversion** (Dialog): a contact with the same phone (or e-mail) exists; "Leagă leadul de contactul existent" (recommended: history and deal go onto that card) or "Creează un contact nou" (merge later). If the existing contact comes from EasyBook, its basic data stays.

**Disqualify** (Dialog): reason (budget below the minimum, no reply, we don't offer it, chose someone else, spam or test, other), note; the lead goes to "Închise", can be reopened. The disqualified card shows the reason, who and when, and "Redeschide leadul".

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S131).**
- **The score.** Recommendation: simple rules with points, shown as reasons (drawn this way): +20 opened the offer, +20 referral, +15 asked for the price, +15 has a budget, +10 has a date, +5 left a phone, −10 budget below the minimum; 0–100; the business can switch scoring off. No AI scoring for the pilot.
- **Duplicates.** Recommendation: checked by phone and e-mail at conversion (and shown on the card when the lead arrives); linking is the default.
- **Unanswered leads.** Recommendation: unassigned leads go to the owner after 24 hours with no reply and show in "Au nevoie de tine".
- **Retention.** Recommendation: disqualified leads are deleted automatically after 12 months (they are personal data with no relationship); converted ones stay with the contact.
