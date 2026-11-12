# CampaignKitContacts

CampaignKit — Contacte (S138, set 2). Romanian only for now; keys `marketing.ct.*` in `i18n/marketing.json`.

**The register.** CampaignKit's own contacts: name and e-mail, where they come from (badges ClientDesk, EasyBook, Formular, Import), consent per channel (StatusPill "E-mail · da" / "retras" / "necunoscut"), last campaign received. Contacts from ClientDesk and EasyBook appear on their own; those from forms and imports exist only in CampaignKit. Filters: source, consent. Actions: "Lista de suprimare", "Exportă", "Importă", "Adaugă contact".

**A linked contact** (Drawer): "Din ClientDesk", "Din EasyBook"; the basic data read only ("Datele de bază se schimbă în ClientDesk" — notes, deals and bookings never reach CampaignKit), the consent per channel from the shared consent service (the same as in ClientDesk, with its source and date; "Retrage acordul" / "Înregistrează acordul"), the campaigns received (sent, opened, clicked, delivered), the audiences it is in. **A marketing-only contact**: editable name, e-mail, phone; it becomes a ClientDesk lead only if you add it.

**Import** — the ClientDeskImport steps (file, columns, preview, confirmation, result): the file and the destination list; the confirmation with the counts (new, completed, skipped because suppressed) and the legal basis — "Și-au dat acordul" or "Sunt clienți…", "Confirm că am acordul acestor persoane", SMS only where the "acord SMS" column says yes; without both ticks the import doesn't start; no bought lists. **Export** (Dialog): all, an audience or the current filter; CSV / Excel; with the consent date and source; logged, owner and admins only.

**The suppression list**, shared with ClientDesk: address or phone, reason (unsubscribed, bounced, replied STOP, marked as spam), where from, when; an unsubscribed person can't be removed by the business, only by subscribing again. Booking messages continue.

**States.** Empty ("Încă nu ai contacte de marketing").

Shown at 1280, 820 and 390, light and dark.
