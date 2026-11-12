# ClientDeskSequences

ClientDesk — sequences (S133, CR.15). Romanian only for now; keys `crm.seq.*` in `i18n/crm.json`.

**The list.** Name, steps, enrolled now, replied, state ("Activă", "Pe pauză", "Ciornă"). Owner and admins create and change sequences; any member enrols their contacts.

**The steps** (at most 10): e-mail (a template; commercial ones marked "Necesită consimțământ"), wait (days), a task for the owner (call, message); order up / down, edit; stats per step (sent, opened, replies; tasks made). "Se oprește singură când": the contact replies, unsubscribes or withdraws consent, the deal is won or lost, they book in EasyBook — always on. Rules: commercial steps skip contacts without consent; e-mails leave Monday–Friday 09:00–18:00; a contact is in one sequence at a time.

**Enrolment.** By hand (from a contact, a lead, or the list in bulk) or from an automation. In bulk: who can't be enrolled and why (no consent for a commercial step, on the suppression list, already in another sequence), when it starts.

**The contacts.** Enrolled, replied, booked, unsubscribed; each contact's current step, next step date, state ("Activ", "Oprit: a răspuns", "Oprit: programare în EasyBook"…); skip a step, remove.

**States.** No steps (start disabled); the whole sequence paused (each contact resumes where it was); a contact already in another sequence (move it, history stays).

Shown at 1280, 820 and 390, light and dark.
