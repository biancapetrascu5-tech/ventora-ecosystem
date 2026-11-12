# ClientDeskCompanies

ClientDesk — companies (S130, CR-UI.2–3). Romanian only for now; keys `crm.companies.*` in `i18n/crm.json`.

**The list.** Search (name or CUI), "Companie nouă"; company with its field, people, open deals (value and count), owner, last activity.

**The company card.** Header: name, field and CUI, tags, owner, "Sarcină", "Notiță", "Deal nou". "Persoane de contact" (role, the main contact marked "Principal", phone, owner; menu: make main, change role, remove from the company), "Leagă un contact". History (the same feed as the contact card). On the side: the company's details and open deals.

**Link a contact** (Dialog): the contact (search), role in the company (optional), "Contact principal". A contact belongs to one company; linking it elsewhere moves it, the history stays.

**New company** (Drawer): name, CUI, field, address, owner, people (existing contacts). Empty: "Încă nu ai companii".

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S130).**
- **One company per contact.** Recommendation: yes for the pilot (drawn this way); several companies later, if asked.
- **Filling in from the CUI.** Recommendation: later, with the public ANAF lookup (name and address from the CUI); for now by hand.
