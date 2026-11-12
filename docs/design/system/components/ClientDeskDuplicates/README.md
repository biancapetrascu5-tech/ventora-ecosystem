# ClientDeskDuplicates

ClientDesk — duplicates (S132, CR-UI.7). Romanian only for now; keys `crm.dups.*` in `i18n/crm.json`.

**The pairs.** Contacte › Duplicate: pairs found by phone (without prefix and spaces), e-mail and normalised name (without diacritics, case, hyphens and titles), each with its reasons as badges ("Același telefon", "Același e-mail", "Nume asemănător"); filter by reason (a Select on a phone); "Verificat azi la 06:00". Actions: "Nu sunt duplicate", "Îmbină". Two EasyBook contacts: "Îmbină în EasyBook" (they are merged only there).

**Merge field by field** (Drawer): for each field that differs you pick the value (radio); equal fields show "La fel". When one contact comes from EasyBook, it is the one that stays and its name, phone, e-mail and language are locked (Notice). "Se adună": history, notes, deals, tags (union), files, consent (the most recent stays; a withdrawn consent stays withdrawn). The second contact disappears; searching by its data leads to the one that stays. Undo for 30 days from the business log.

**"Nu sunt duplicate".** The pair no longer comes back (written to the log, can be undone). Empty: "Niciun duplicat — verificăm în fiecare noapte și după fiecare import."

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S132).**
- **When we look for duplicates.** Recommendation: every night, after each import and when a contact or lead is created (a warning on the spot).
- **Consent when merging.** Recommendation: per channel, the most recent explicit state; a withdrawal always wins (drawn this way).
- **Undo.** Recommendation: 30 days, owner and admins only, from the business log.
