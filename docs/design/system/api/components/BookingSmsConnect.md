# BookingSmsConnect

`page` · Ecrane Booking · versiunea 1.0.0 · nouă

EasyBook — connecting the business phone (SPEC_ECRANE_SMS §2). Opens from Settings · "Trimitere SMS" → "Conectează telefonul" (owner and admin only, S12). A wide Dialog (720) on desktop and tablet; the same Dialog as a bottom sheet (`v-dialog--sheet`) on phone. Built only from existing components: Dialog, ProgressBar, SegmentedControl / Select, Checkbox, FormField, Input, Button, IconButton, StatusDot, StatusPill, Spinner, Notice.

## Evenimente

—

## Stări

- EasyBook — Conectarea telefonului (pasul 3, peste Setări · Trimitere SMS)
- Gestionare
- Afacere
- Azi
- Calendar
- Programări
- Clienți
- Mai multe
- SMS-urile pleacă între
- Reamintirile cu o zi înainte pleacă între
- Pașii 1–7 · Light · desktop și tabletă (Dialog lat, 720)
- 1 · Ce îți trebuie
- 2 · Instalează aplicația pe telefon
- Marca telefonului
- 3 · Scanează codul
- 4 · Setările telefonului
- 5 · Declarația ta · TEXT JURIDIC DE VALIDAT (D-SMS-7)
- 6 · Trimite un SMS de probă
- Trimite proba pe numărul
- 7 · Telefonul e conectat
- Numele telefonului
- Pașii 1–7 · Dark · desktop și tabletă (Dialog lat, 720)
- Pașii 1–7 · Light · telefon (Dialog ca sheet)
- Pașii 1–7 · Dark · telefon (Dialog ca sheet)
- Stări · Light · desktop și tabletă
- 3a · Codul a expirat
- 3b · Telefonul nu se conectează în timpul așteptat (după 3 minute)
- 3c · Telefonul e conectat deja la altă afacere
- 2 · Altă marcă de telefon (Xiaomi)
- 4 · Bifele făcute
- 5 · Declarația bifată (abia acum merge „Continuă”) · TEXT JURIDIC DE VALIDAT (D-SMS-7)
- 6a · Proba: predată telefonului
- 6b · Proba: trimisă, așteptăm livrarea
- 6c · Proba: livrată
- 6d · Proba nu s-a trimis (motivul)
- 6e · Proba fără confirmare (după 2 minute)
- Ieși înainte de final · PROPUNERE P-C2
- Stări · Dark · desktop și tabletă
- Stări · Light · telefon
- Stări · Dark · telefon
- Deutsch · desktop · pașii 1 și 3
- Italiano · 390 · pașii 4 și 6
- Marca del telefono
- Invia la prova al numero

## Note

States are the labelled boards and frames of the preview (Light and Dark; desktop/tablet/phone).

Mai mult: `components/BookingSmsConnect/README.md`, exemplele: `components/BookingSmsConnect/preview.html`.
