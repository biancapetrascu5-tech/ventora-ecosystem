# Lot B.14b, partea 2: ecranul Setări › „Mesaje” (BookingMessageTemplates, S127)

**Branch:** `feat/b14b-booking-message-templates` (același cu partea 1, backend-ul), peste B.14 (#206).
**Status:** PROPUS. Partea 1: `reports/2026-11-13_1640_lot-b14b-textele-emailurilor-backend.md`.

## Lista de bifat

| Punct | Fișiere | Verificare |
| --- | --- | --- |
| Lista: „Către clienți” (și „Către echipă” când există), fiecare mesaj cu canalele, când pleacă, Pornit | `modules/booking/src/ui/messages/BookingMessagesView.tsx` | capturile, cadrul 1 |
| Confirmarea, mutarea și anularea nu se pot opri: comutatorul e pornit și dezactivat. Reminderul și mulțumirea se pot opri | `BookingMessagesView.tsx` (`locked`), `MessagesScreen.tsx`, `setMessageOn` | typecheck; contractul `setBookingSettings` (testele B.13 / B.14) |
| Editorul: Drawer lat (pe ecran întreg la telefon), cu canalul, subiectul, textul, „Inserează” la cursor, „Când pleacă”, „Revino la textul inițial” și previzualizarea alături | `MessageEditorDrawer.tsx` | cadrele 2–6 |
| Previzualizarea e e-mailul care pleacă: părțile vin de la server (`clientEmailParts`), cu textul nesalvat și programarea de exemplu | `EmailPreview.tsx`, `previewTemplate`, `server/client-emails.ts` (`clientEmailParts`) | integrarea: „the preview…” |
| Variabila greșită: aceeași regulă în browser și pe server, cu „Variabila {var} nu există. Alege una din listă.” | `MessagesScreen.tsx` (`check`, `errorText`), `template-text.ts` | cadrul 3; `template-text.test.ts` |
| Salvat: Toast „Am salvat mesajul…”; revenirea: „Am pus înapoi textul inițial.” | `MessagesScreen.tsx` | cadrul 7 |
| Taburile Setărilor din S127: „Mesaje” în loc de „Reamintiri”, plus „Plăți și avans” și „Promoții” | `BookingSettingsHeader.tsx` (`SETTINGS_TABS_S127`, prop-ul `tabs`) | cadrul 1 |
| Ruta `/booking/settings/messages` (doar `booking:settings`, ceilalți primesc 404); `/booking/settings/reminders` duce aici (308) | `app/(hub)/booking/settings/messages/page.tsx`, `…/reminders/page.tsx`, `booking-messages-actions.ts` | build |
| Textele `booking.msg.*`: cele 60 din S127 (RO) plus 7 ale aplicației (erori, comutatorul blocat, revenirea, „De la” / „Către”), în 6 limbi | `modules/booking/messages/*.json` | `pnpm i18n:check` |
| Galeria: cele 7 cadre din preview, cu datele lui | `apps/platform/app/design/demo/gallery/BookingMessageTemplates/` | capturile |
| BookingMessageTemplates în `enforced` | `scripts/visual-check.config.json` | `visual-check --only BookingMessageTemplates` → „Toate 4 în prag” (0,06–0,11%) |

## Capturile (`reports/2026-11-13_b14b-capturi/`)

- **Ce sunt:** 84 de perechi, adică 7 cadre × 3 lățimi de cadru (1280 / 820 / 390) × light / dark, capturate la ferestre de 1280 și de 390.
- **Rezultat:** toate sub 2%; maximum 1,01%, la fereastra de 390. `results.json` are fiecare valoare.

| # | Cadrul | 1280 light / dark | 820 light / dark | 390 light / dark |
| --- | --- | --- | --- | --- |
| 1 | Mesajele salonului | 0,11% / 0,04% | 0,02% / 0,02% | 0,04% / 0,04% |
| 2 | Mulțumirea, cu variabile și previzualizare | 0,11% / 0,04% | 0,01% / 0,01% | 0,01% / 0,01% |
| 3 | Variabilă greșită | 0,34% / 0,32% | 0,01% / 0,01% | 0,01% / 0,01% |
| 4 | Cererea de recenzie (SMS) | 0,41% / 0,39% | 0,16% / 0,16% | 0,14% / 0,15% |
| 5 | SMS peste 160 de caractere | 0,41% / 0,39% | 0,17% / 0,17% | 0,15% / 0,16% |
| 6 | Notificare pentru echipă | 0,33% / 0,31% | 0% / 0% | 0% / 0% |
| 7 | Salvat | 0,33% / 0,32% | 0,02% / 0,02% | 0% / 0% |

(Valorile din tabel sunt de la fereastra de 1280. La fereastra de 390 ies între 0,7% și 1,01%: apare butonul Next.js dev, ca la galeriile anterioare.)

- **Corecturi după prima rulare:**
  - **3–9%** pe editor, la tabletă și telefon. Cauza: grila „Când pleacă” trecea pe o coloană. În design rămâne pe două, așa că am scos varianta pentru telefon.
  - **Notice-ul la SMS-ul lung:** avea nevoie de clasa `notice` (marginea de jos din preview), ca la B.2-UI.
  - **În scriptul de perechi** (copia locală din `reports/tools`, a agentului UI), cadrele imbricate sunt acum sărite. E-mailul din previzualizare are propriul `data-theme="light"`, care decala perechile.

## Ce face aplicația față de galerie

- **Mesajele din listă:** doar cele 5 e-mailuri care există (B.13 / B.14), toate cu canalul E-mail.
- **Din galerie lipsesc deocamdată:** rândurile pentru echipă (B.15), cererea de recenzie (B.16) și canalul SMS (B.17).
- **„Când pleacă”:** apare fix și dezactivat. **B.14c**, în primul pachet, îl face editabil.
- **`{review}`** nu e printre variabilele aplicației (vine cu B.16).

## NECESITĂ DESIGN

- **Alegerea limbii textului:** S127 nu o desenează. Textul se editează acum în limba Hubului. Clienții din celelalte limbi primesc textul Ventora până există selectorul.

## NECESITĂ DECIZIE

- **Taburile Setărilor:** S127 are 8 taburi („Mesaje”, „Plăți și avans”, „Promoții”, fără „Trimitere SMS”). S123 și S124 le au pe cele vechi.
  - Pagina Mesaje folosește taburile S127. Servicii și Programul echipei păstrează taburile designurilor lor, ca să nu le schimb capturile.
  - De ales: aliniem toate paginile la S127, într-un lot mic de UI, sau rămâne așa.

## Verificări rulate local

- `visual-check --only BookingMessageTemplates`: „Toate 4 în prag”.
- **Lanțul fără Docker** (reluat după oprirea pentru memorie, pe rând): `pnpm format:check` exit 0; `pnpm lint` 0 erori; `pnpm typecheck` 33/33; `pnpm test` 29/29 (booking 105/105); `pnpm i18n:check` cele 6 limbi complete (și pentru booking); `pnpm guards:verify` „all guards confirmed” (gitleaks doar în CI); `pnpm build` 7/7, cu rutele `/booking/settings/messages` și `/booking/settings/reminders`.
- **Rebase pe main** (`a28f5c3`, cu #206, #208, #209, #210 îmbinate): conflicte doar în textele booking (adăugări de ambele părți, rezolvate în trei căi; cheile scoase de main rămân scoase), în `ui/index.ts` și în `visual-check.config.json` (păstrate ambele). Lanțul reluat după rebase: toate cele de mai sus trec din nou.
- **Integrarea** `pnpm test:integration -- --only booking` (după `docker ps` gol): drift booking 0, 40/40 fișiere, 428/428. Containerele s-au oprit.
- **Abatere, test B.13 dependent de oră:** prima rulare a picat pe testul T6 (B.13). Programările „acum + 48…53 de ore”, rulate pe la 19:50, treceau de miezul nopții în Europe/Bucharest, ceea ce o programare nu poate face (`staff_unavailable`). `inHours` din `client-emails.integration.test.ts` mută acum un început de după 23:30 la 23:30 (cel mult 25 de minute; programările unui test sunt la cel puțin o oră una de alta). Același eșec putea apărea în CI seara.
- **Prima rulare a lanțului** a fost oprită de Claude Code pentru memorie puțină, după ce format:check picase pe `MessageEditorDrawer.tsx` (formatat) și pe copia locală `reports/tools/pairs.mjs` (scoasă din repo).
- **Ce nu am verificat:** ecranul cu o sesiune reală în browser (salvarea, comutatoarele). Contractele și acțiunile le acoperă testele de integrare din partea 1 și typecheck-ul.
