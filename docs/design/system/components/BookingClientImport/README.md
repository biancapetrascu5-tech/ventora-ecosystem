# BookingClientImport

EasyBook — importing clients at the start (S140). The ClientDeskImport steps, shortened to four. Romanian only for now; keys `onboarding.imp.*` in `i18n/onboarding.json`.

**Where from.** From the phone (vCard or CSV, with how to export on iPhone and Android), from Excel, from another booking app (its client export, with how to find it). **Columns:** each column with an example and the field (name, phone, e-mail, birthday, team notes, "Nu importa"); another app's file is recognised and pre-matched; no health or behaviour data at import. **Preview:** new, already existing (same phone — fill empty fields or skip), without a phone (skipped). **Confirmation:** they land in EasyBook › Clienți with the source "Import" and, when ClientDesk is active, appear there as linked contacts; future bookings from another app can be added (marked "Importată", no messages until confirmed); "Importul nu dă acord pentru mesaje comerciale"; "Sunt clienții salonului meu" (required).

**Done.** Imported, filled, skipped, linked in ClientDesk; "Descarcă rândurile sărite"; "Anulează importul" for 7 days (only new clients without bookings).

Shown at 1280, 820 and 390, light and dark.
