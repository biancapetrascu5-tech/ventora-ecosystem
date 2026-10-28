# BookingSmsToday

`page` · Ecrane Booking · versiunea 1.0.0 · nouă

EasyBook — Today with the SMS alerts in "Au nevoie de tine" (SPEC_ECRANE_SMS §4). The approved BookingToday, with the business phone disconnected: the SMS alert comes first, then the approved items; at most 5, then "Vezi toate (7)". Built only from AttentionList (with the new `tone: "neutral"`, S1), Badge, Button, Dialog and Toast.

## Evenimente

—

## Stări

- EasyBook — Azi, cu telefonul afacerii deconectat: alerta SMS e prima în „Au nevoie de tine”
- Gestionare
- Afacere
- Azi
- Calendar
- Programări
- Clienți
- Mai multe
- Alertele SMS din „Au nevoie de tine” · Light · coloana din dreapta (desktop)
- 1 · Telefonul deconectat, cu reamintiri de trimis (peach, singurul)
- 2 · Mesaje care nu au plecat azi (danger, ca „Nu s-a trimis”)
- 3 · 3 mesaje la rând nu au plecat (S5; îl înlocuiește pe 2)
- 4 · Mesaje fără confirmare (neutru, S1)
- 5 · Bateria telefonului (neutru)
- 6 · Mâine, peste capacitatea telefonului (neutru)
- 7 · Aplicația de pe telefon trebuie actualizată (S5, neutru)
- 8 · Toate odată: cel mult 5, apoi „Vezi toate”
- 9 · Membru: fără alertele SMS
- 9b · Managerul EasyBook vede alertele SMS (R-A6), cu acțiunile pe care le are
- 10 · „Vezi ce poți face” deschide același Dialog ca în Setări (S20)
- 11 · Telefonul a revenit: alerta dispare singură (Toast)
- Alertele SMS din „Au nevoie de tine” · Dark · coloana din dreapta (desktop)
- Alertele SMS din „Au nevoie de tine” · Light · telefon (390)
- Alertele SMS din „Au nevoie de tine” · Dark · telefon (390)
- Deutsch · coloana din dreapta, 380
- Italiano · 390

## Note

States are the labelled boards and frames of the preview (Light and Dark; desktop/tablet/phone).

Mai mult: `components/BookingSmsToday/README.md`, exemplele: `components/BookingSmsToday/preview.html`.
