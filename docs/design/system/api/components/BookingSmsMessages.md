# BookingSmsMessages

`page` · Ecrane Booking · versiunea 1.0.0 · nouă

EasyBook — the messages sent to the client, on an appointment's detail (SPEC_ECRANE_SMS §3). A new section "Mesaje către client" in the approved BookingDetail drawer, after the actions and before the team notes. Built only from existing components: StatusPill, Icon, Button, Dialog, Toast, and the drawer's own "Istoric" list.

## Evenimente

—

## Stări

- EasyBook — Detaliul programării, cu secțiunea „Mesaje către client”
- Gestionare
- Afacere
- Azi
- Calendar
- Programări
- Clienți
- Mai multe
- Note pentru echipă
- Stările unui mesaj · Light · desktop și tabletă (drawer de 480)
- 1 · În așteptare · „Pleacă la {ora}”
- 2 · Predat telefonului
- 3 · Trimis (o bifă, lime)
- 4 · Livrat (bifă dublă, lime), doar cu confirmare
- 5 · Nu s-a trimis · fără semnal (se poate retrimite)
- 6 · Nu s-a trimis · fără credit pe SIM
- 7 · Nu s-a trimis · prea târziu (nu se mai retrimite)
- 8 · Fără confirmare (neutru, S9)
- 9 · Anulat (programarea a fost mutată)
- 10 · E-mail: Trimis · Livrat · Nu s-a trimis (S17)
- 11 · Prin Ventora (rezerva) și două telefoane (numele apare, S7)
- 12b · Istoricul deschis după perioada de păstrare (R-M2, §3.8)
- 12 · Istoricul deschis (S16), cu textul trimis
- 13 · Retrimiți un mesaj „Fără confirmare” (confirmare)
- 14 · După „Trimite din nou” (Toast)
- 15 · Niciun mesaj încă
- 16 · SMS-urile sunt dezactivate (S13)
- Stările unui mesaj · Dark · desktop și tabletă (drawer de 480)
- Stările unui mesaj · Light · telefon (390)
- Stările unui mesaj · Dark · telefon (390)
- Deutsch · drawer 480
- Italiano · 390

## Note

States are the labelled boards and frames of the preview (Light and Dark; desktop/tablet/phone).

Mai mult: `components/BookingSmsMessages/README.md`, exemplele: `components/BookingSmsMessages/preview.html`.
