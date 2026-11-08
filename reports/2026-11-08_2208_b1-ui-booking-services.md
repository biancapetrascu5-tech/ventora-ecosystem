# Lotul B.1-UI: ecranul BookingServices (S123, aliniat la S124)

**Data:** 08.11.2026 · **Sursa:** planul aprobat (`2026-11-08_1758_b1-ui-servicii-plan.md`, deciziile 1–6), apoi decizia S124 (08.11.2026).

| PR | Ramura | Commit | Stare |
|---|---|---|---|
| #94 (iconițele) | `feat/ui-icons-s123` | — | **ÎNCHIS** la cererea fondatoarei; ramura ștearsă, local și pe GitHub |
| #98 (`Sheet`, `packages/ui`) | `fix/ui-sheet-padding` | `953fe61` | pushed, nemergiat |
| PR ecran | `feat/b1-ui-booking-services`, construit peste `fix/ui-sheet-padding` | `92383b2` (S124 docs), `653fe84` (ecranul), commit-ul raportului | pushed, nemergiat |

## 1. Lista de bifat

| Punct cerut | Fișier | Verificare | Stare |
|---|---|---|---|
| Renunță la `feat/ui-icons-s123`, închide PR-ul | #94 | `gh pr view 94` → CLOSED; `git ls-remote` → ramura nu mai există | FĂCUT |
| S124 în `docs/design/system`: BookingServices 1.0.1, BookingTeamSchedule, BookingResources, BookingSettings | `docs/design/system/components/…`, `i18n/booking.json` (+`booking.team.*`, `booking.resources.*`), `CHANGELOG.md` | `diff -rq` față de export: niciuna din cele 4 nu mai diferă | FĂCUT, `92383b2` |
| Ecranul aliniat la S124: arhivarea fără iconiță, restaurarea cu `rotate-ccw`, „Categorie nouă” cu `folder`, „Programul echipei” în file | `modules/booking/src/ui/services/*` | capturile §3 | FĂCUT |
| Shell-ul EasyBook cu Spine | `apps/platform/src/screens/booking/useBookingNav.tsx`, `HubShell.tsx` (sub `/booking`) | typecheck; Spine-ul din galerie e cel din design | FĂCUT. În aplicație nu e verificat cu o sesiune reală (§4) |
| `/booking/settings/services` | `apps/platform/app/(hub)/booking/settings/services/page.tsx` | fără sesiune → `/sign-in` (verificat pe dev) | FĂCUT |
| Intrarea „Servicii” din Spine deschide aceeași pagină (S123-1) | `useBookingNav.tsx` | `/booking/services` → 308 spre pagină; `/booking`, `/booking/settings` → 307 | FĂCUT |
| Doar `booking:settings` (decizia 3) | `booking-services-actions.ts` (`readServicesPage`), pagina | fără drept → 404; „Setări” ascuns din Spine | FĂCUT. Nu e verificat cu un membru real (§4) |
| Intrările neconstruite din Spine și file → 404 (decizia 4) | rutele lipsesc intenționat | `/booking/today` → 404 | FĂCUT |
| Mesajele în `modules/booking/messages`, legate în aplicație | `modules/booking/messages/*.json`, `apps/platform/src/i18n/request.ts` | galeria afișează textele din chei | FĂCUT |
| …și în `i18n:check` | `package.json` (`i18n:check` verifică și `--dir=modules/booking/messages`) | `pnpm i18n:check`: ambele cataloage complete | FĂCUT |
| en / fr / es / de / it = textul românesc, netradus (decizia 5) | `modules/booking/messages/{en,fr,es,de,it}.json` | toate cele 148 de chei sunt identice cu ro | FĂCUT, **netradus** |
| Restaurarea cu nume luat → `err.nameDuplicate` (decizia 6) | `ServicesScreen.tsx` (`restore`) | — | FĂCUT, ca toast de eroare. Nu e desenat |
| Durata maximă 8 ore (decizia 1) | `format.ts` (`FORM_LIMITS.durationMax = 480`), contractul din #86 | `services-ui-format.test.ts` | FĂCUT |
| Moneda afacerii ca valoare implicită (S123-2) | `readServicesPage` (`getCatalogForOrg(...).currency`), `emptyServiceForm` | test unitar | FĂCUT |
| Restaurarea în „Fără categorie” (C1), cu mesajul `restore.toUncategorized` | `ServicesScreen.tsx` | cadrul 13 | FĂCUT |
| Ordinea categoriilor într-o tranzacție (C4) | `reorderCategories` → `reorderServiceCategories` | cadrul 9; integrarea booking din #86 | FĂCUT |
| Cele 60 de perechi `_design` / `_impl` (15 cadre × 1280 / 390 × light / dark) | `reports/2026-11-08_b1-ui-capturi/` | §3 | FĂCUT: toate sub 2%, maxim 0,62%. Plus cele 30 de la 820, pentru informare |
| BookingServices în `enforced` | `scripts/visual-check.config.json` | `visual-check --only BookingServices` → „Toate 4 în prag” | FĂCUT |
| PR și raport, fără merge | — | — | FĂCUT |

## 2. Ce conține PR-ul ecranului

- **`modules/booking/src/ui/services/`**, doar din `@ventora/ui`, doar props:
  - `BookingServicesView`: bara de unelte, lista pe categorii, „Fără categorie”, „Arhivate”, căutarea, stările goale;
  - `ServiceFormDrawer`: formularul cu validarea pe client, care oglindește limitele B.1;
  - dialogurile: categorie nouă / redenumire, ordinea, arhivarea, categoria cu servicii active;
  - `BookingSettingsHeader`: antetul cu cele 7 file din S124, plus toastul;
  - `format.ts`: regulile pure, testate unitar (12 teste).
- **Aplicația:**
  - `apps/platform/src/server/booking-services-actions.ts`: acțiunile de server, doar prin contractele booking;
  - `ServicesScreen.tsx`: starea și acțiunile paginii;
  - rutele `/booking/…`;
  - Spine-ul EasyBook în shell-ul Hub sub `/booking`, cu contorul `booking.appointments` când planul are limită.
- **Galeria:** `apps/platform/app/design/demo/gallery/BookingServices`, cu cele 15 cadre din preview, la 1280, 820 și 390, light și dark, cu exact datele din preview (Salon Aurora). Galeria desenează aceleași componente ca pagina.

## 3. Capturile (`reports/2026-11-08_b1-ui-capturi/`)

Fiecare `BookingServices_<cadru>_<lățime>_<temă>_pair.png` are designul în stânga și implementarea în dreapta. Procentul e diferența pixelmatch, cu pragul 0,1, ca la `visual-check`. `results.json` are toate valorile.

| # | Cadrul | 1280 light | 1280 dark | 390 light | 390 dark | 820 light | 820 dark |
|---|---|---|---|---|---|---|---|
| 1 | Lista | 0,1% | 0,26% | 0,03% | 0,02% | 0,01% | 0,01% |
| 2 | Serviciu nou | 0,3% | 0,29% | 0% | 0% | 0,02% | 0,01% |
| 3 | Editare (variabilă, „de la”, euro) | 0,33% | 0,3% | 0% | 0% | 0,02% | 0,01% |
| 4 | Erori | 0,32% | 0,31% | 0% | 0% | 0,02% | 0,01% |
| 5 | Salvat | 0,3% | 0,32% | 0% | 0% | 0,02% | 0,02% |
| 6 | Categorie nouă | 0,62% | 0,37% | 0% | 0% | 0,02% | 0,01% |
| 7 | Redenumește categoria | 0,39% | 0,37% | 0% | 0% | 0,02% | 0,01% |
| 8 | Categorie cu nume existent | 0,39% | 0,37% | 0% | 0,39% | 0,02% | 0,01% |
| 9 | Ordinea categoriilor | 0,39% | 0,37% | 0% | 0% | 0,02% | 0,01% |
| 10 | Arhivezi un serviciu | 0,39% | 0,37% | 0,01% | 0,01% | 0,03% | 0,02% |
| 11 | Categorie cu servicii active | 0,39% | 0,37% | 0% | 0% | 0,02% | 0,01% |
| 12 | Filtrul „Arhivate” | 0,12% | 0,18% | 0,04% | 0,04% | 0,03% | 0,02% |
| 13 | Restaurat în „Fără categorie” | 0,12% | 0,18% | 0% | 0% | 0,03% | 0,03% |
| 14 | „Arhivate” gol | 0,15% | 0,21% | 0,05% | 0,05% | 0,03% | 0,03% |
| 15 | Starea goală | 0,15% | 0,21% | 0,05% | 0,05% | 0,03% | 0,03% |

- **Cum am capturat:** cu un script din scratchpad, care nu e în commit. Ia cadrul cu același număr din preview (`.scr-d/.scr-t/.scr-m[data-theme]`) și din galerie (`[data-frame][data-theme]`).
- **Ce verifică CI:** `visual-check` (CI) compară doar primul cadru; cu 0,09–0,14% e în prag.
- **Ce am corectat pe parcurs:**
  - `Sheet` pe telefon și tabletă: §5;
  - marginea de sub rezumatul erorilor: `.v-notice{margin-bottom}` din preview;
  - butonul „x” al toastului în galerie.

## 4. Ce nu am putut verifica

- **Pagina reală cu o sesiune:** nicio afacere nu are EasyBook activ, iar serverul de dev local folosește baza de staging.
  - Am verificat redirecturile și 404-urile fără sesiune, typecheck-ul și lint-ul.
  - Logica paginii (`ServicesScreen`) nu e exersată în browser. Componentele ei sunt aceleași cu cele din galerie, iar contractele au integrarea lor.
  - **NEFĂCUT:** testul cap-coadă cu o afacere care are EasyBook activ. Propun să-l facem pe staging, după activarea EasyBook pe afacerea de test.
- **Membrul fără `booking:settings`** (404 și „Setări” ascuns): logica e pe server (`readServicesPage`, `readBookingShell`), dar n-am verificat-o cu un membru real.

## 5. Abateri și observații

- **NECESITĂ DECIZIE: garda `boundaries` din `apps/platform/eslint.config.mjs`.** Regula permitea aplicației importuri doar din `packages/*`.
  - Am adăugat o regulă: aplicația → modul.
  - Intrările unui modul rămân cele din `exports`: `.` (contractul), `./ui`, `./messages/*`, deci `src/server` nu se poate importa.
  - Altfel, ecranele din `modules/<app>/src/ui` (ARCHITECTURE §3) nu pot fi folosite.
- **PR separat pentru `Sheet` (`packages/ui`).** `.v-sheet--padded` din `bundle.css` are `padding: space-4` pe telefon și `space-5` pe tabletă; `Sheet.module.css` nu le avea.
  - Fără reparație, cadrul 1 la 390 era 3,25–6,51%.
  - Reparația era pe ramura iconițelor închisă; acum e singură, în PR-ul ei, conform regulii pachetelor comune.
  - Lanțul pre-push și integrarea au exit 0, iar `visual-check` complet pe toate componentele din `enforced`: „Toate 444 în prag”.
- **`order` → `order.label`:** în next-intl, o cheie nu poate fi și text, și grup (`order` + `order.title`…). E singura cheie S123 cu altă cale.
- **Chei în plus față de design:**
  - `booking.services.money.{RON,EUR}`: „{amount} lei” și „{amount} €”, din `money()` din preview;
  - `booking.nav.*` și `booking.settings.*`: Spine-ul, antetul și filele, cu textele din preview.
- **Importurile interne ale modulului sunt acum fără extensie** (`./contract/index`, ca în `core/*`). Turbopack nu rezolva `./x.js` spre `x.ts` când platforma transpilează modulul. Fără schimbare de comportament: testele booking au trecut.
- **Lint propriu în `modules/booking`** (`eslint.config.mjs`), pentru `src/ui`: texte literale, `<select>` nativ, componentele comune doar din `@ventora/ui`. Dependențele noi ale modulului (`@ventora/ui`, `next-intl`, `react` ca peer, `eslint`, tipurile React) sunt versiunile deja din workspace; niciun pachet nou.
- **„Are {n} programări viitoare”** din dialogul de arhivare apare doar în galerie (`n = 3`, ca în preview). În aplicație se leagă la B.4.
- **Nedesenat, făcut după decizia 6:** restaurarea cu nume luat arată un toast de eroare cu `err.nameDuplicate`.
- Fișierul `docs/design/system/README.md` nu menționează încă BookingServices (nici în exportul Design).

## 6. Comenzile

- **PR-ul ecranului:**
  - `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm i18n:check` → **exit 0**;
  - `pnpm test:integration` → **exit 0**: 15 suite, booking 53/53, billing 79 trecute și 3 sărite, commercial 94/94;
  - `node scripts/visual-check.mjs --base http://localhost:3190 --only BookingServices` → „Toate 4 în prag” (0,09–0,1% după S124).
- **Ramura `fix/ui-sheet-padding`:** lanțul pre-push → exit 0; `pnpm test:integration` → exit 0. `visual-check` complet → „Toate 444 în prag” (Sheet 0%, PageHeader 0–0,06%, AppShell 0,03–0,13%).
- **#94, înainte de închidere:** prima rulare a integrării a picat într-un test billing („dunning cannot start in the future”), adică ceasul VM-ului Docker față de cel din Node. A doua rulare a trecut. Nu s-a repetat pe ramurile de acum.
