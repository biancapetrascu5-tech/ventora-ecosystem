# ClientDeskImport

ClientDesk — import and export (S132, CR-UI.8). Romanian only for now; keys `crm.import.*`, `crm.export.*` in `i18n/crm.json`.

**Import, in 5 steps** (ProgressBar "Pasul 2 din 5 · Coloanele"):
1. **The file:** FileUpload for CSV, XLSX or XLS (10 MB, 5.000 rows, first row = column names), "Descarcă modelul"; a file that can't be read shows the error on the file.
2. **The columns:** each column with an example and the field it goes into (basic data, the business's own fields, "Nu importa", "Câmp nou al afacerii…"); known names are matched automatically; a note not to import medical data.
3. **The preview:** new / already exist / rows with errors; the first 5 rows with what happens to each; for the existing ones: skip, "Completează contactele existente" (only empty fields are filled — recommended) or create new ones (they appear in Duplicate). EasyBook contacts don't change at import.
4. **The confirmation:** what will happen, the tag put on all ("Import noiembrie 2026"), the owner, the count after import with the UsageMeter; "Temeiul legal": "Confirm că am un temei legal pentru aceste contacte" (customers, suppliers or people who contacted us — no bought lists, no addresses collected from the internet) is required before the import can start; marketing consent only with proof.
5. **The progress:** it can continue in the background, with a notification when done.

**The report:** added, filled in, skipped, with errors; the errors by row (short phone, incomplete e-mail, no name, a date that doesn't exist, a value not in a list); "Descarcă rândurile cu erori" to fix and import again without duplicating.

**The limit.** Over 3.000: "Fișierul are 371 de contacte noi; mai ai loc pentru 150" — the first ones in file order are imported up to the limit, the rest appear in the report. EasyBook clients don't count.

**Export** (Dialog): CSV or Excel; the current filter, a segment, or all; which fields (basic, tags, owner, company, own fields, consent, dates, source). "Exportul intră în jurnalul afacerii: cine, când, ce contacte și ce câmpuri." A member exports only what they see.

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S132).**
- **The legal-basis confirmation.** Recommendation: required at every import, saved in the log with the text accepted (drawn this way).
- **Consent at import.** Recommendation: imported contacts come in without marketing consent, unless the business ticks that it has proof; then it is recorded "din import, {data}".
- **Duplicates at import.** Recommendation: "Completează" by default; never overwrite filled fields.
- **Export.** Recommendation: owner and admins; the "Risc ridicat" note, blocked clients and health data are never in an export, because they are never in ClientDesk.

**S140.** The same steps, shortened to four, import clients into EasyBook at the start (BookingClientImport): from the phone (vCard / CSV), Excel or another booking app; they appear in ClientDesk as linked contacts.
