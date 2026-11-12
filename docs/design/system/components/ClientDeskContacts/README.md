# ClientDeskContacts

ClientDesk — the contacts list (S130, CR-UI.2). Romanian only for now; keys `crm.contacts.*`, `crm.state.*`, `crm.src.*` in `i18n/crm.json`.

**The list.** Tabs "Toate contactele" / "Segmente" (ClientDeskSegments). Toolbar: "Caută un contact" (name, phone, e-mail), "Filtre", "Coloane", "Importă", "Contact nou" (on a tablet "Coloane" and import go into the menu). DataTable with selection: name (with "EasyBook" for contacts that came from EasyBook, and the company), phone, tags, client state ("Nou", "Recurent", "Inactiv"), owner ("Neatribuit" when nobody), date added. Row menu: open, change owner, tags, delete.

**Filters** (Drawer): tags, source (EasyBook, site form, referral, event, CSV import, manual), owner (anyone, me, unassigned, a member), client state (with what each means), date added (range). Applied filters show as removable pills, "Șterge filtrele", and "Salvează ca segment".

**Columns** (Dialog): the user ticks the columns and their order (move up / down); "Nume" is fixed; kept per user; "Revino la coloanele implicite".

**Bulk actions** (the DataTable bulk bar): "Etichetă" (add or remove), "Responsabil", "Exportă" (CSV; the export goes into the business log), "Îmbină" (only with exactly two selected), "Șterge". Merge: one contact stays; for each field that differs you pick the value; history, notes, deals, tags and files are added together; when one contact comes from EasyBook, its name, phone and e-mail stay (locked, they change only in EasyBook).

**Limit.** 3.000 contacts per business; EasyBook contacts don't count. Near the limit (2.850): a peach Notice. At the limit: a red Notice, "Contact nou" and "Importă" disabled, EasyBook clients keep coming; "Vezi abonamentele". The UsageMeter says how many EasyBook contacts are outside the count.

**States.** No contact for the filters; no contacts yet (with import and the EasyBook note). A member sees only the contacts assigned to them and the unassigned ones — in the list, search and export.

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S130).**
- **Client state.** Recommendation: "Nou" = added in the last 30 days, without a second visit or a won deal; "Recurent" = at least two visits or won deals in 12 months; "Inactiv" = no visit, deal or activity for 90 days. Computed, not set by hand.
- **Merging with an EasyBook contact.** Recommendation: the EasyBook contact always stays and its basic data wins (drawn this way); two EasyBook contacts are merged only in EasyBook.
- **Export.** Recommendation: owner and admins only, written to the business log; a member exports only what they see.
- **The limit.** Recommendation: at 3.000 adding and importing stop, nothing is deleted; EasyBook contacts never count (drawn this way). Notice at 95%.
- **Deleting a contact.** Recommendation: an EasyBook contact can't be deleted in ClientDesk (only its ClientDesk data: notes, tags, deals); other contacts go to a 30-day bin.

**S132.** "Importă" opens the import (ClientDeskImport), "Exportă" the export dialog; Contacte › Duplicate is ClientDeskDuplicates; the columns of the own fields and the days for "Nou" / "Inactiv" come from ClientDeskSettings.
