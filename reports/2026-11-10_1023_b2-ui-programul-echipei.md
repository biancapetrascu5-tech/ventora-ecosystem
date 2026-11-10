# Lotul B.2-UI: ecranul BookingTeamSchedule („Programul echipei”, S124)

**Data:** 10.11.2026 · **Sursa:** planul aprobat (`2026-11-09_2145_b2-ui-programul-echipei-plan.md`, deciziile 1–5 din 09.11.2026).

| PR | Ramura | Commit | Stare |
|---|---|---|---|
| #102 (C2, `plane`) | `fix/ui-icon-plane` | `9e042b5` | îmbinat |
| #105 (C1, motivul concediului) | `fix/b2-time-off-reason-keep` | `a45aeae` | pushed, nemergiat |
| PR-ul ecranului | `feat/b2-ui-team-schedule`, **peste C1**, către `main` | `1e06617` (ecranul), commit-ul raportului | pushed, nemergiat; **depinde de #105** |

## 1. Lista de bifat

| Punct cerut | Fișier | Verificare | Stare |
|---|---|---|---|
| Componentele din `@ventora/ui`, doar props | `modules/booking/src/ui/team/` (`BookingTeamView`, `StaffScheduleDrawer`, `TeamDialogs`, `TeamParts`, `team-format`, `team-texts`, `team.module.css`) | typecheck, lint-ul modulului; capturile §3 | FĂCUT |
| Ruta în Setări: `/booking/settings/team` | `apps/platform/app/(hub)/booking/settings/team/page.tsx`, `TeamScreen.tsx` | typecheck, build | FĂCUT. Neverificată cu o sesiune reală (§4) |
| `/booking/team` → 308 | `apps/platform/app/(hub)/booking/team/page.tsx` | build | FĂCUT |
| D1: pasul de 5 minute | `TeamParts.tsx` (`step={TEAM_LIMITS.step}`), `team-format.ts` (`timeToMin`) | `team-ui-format.test.ts` („09:07” refuzat) | FĂCUT |
| D2: „Echipa” din Spine deschide tabul | `useBookingNav.tsx` (`angajati` → `/booking/settings/team`) | typecheck; activă rămâne „Setări”, ca în preview | FĂCUT |
| D3: doar `booking:settings`; „Echipa” ascunsă pentru ceilalți | `readTeamPage` (`authorize booking:settings` → 404); `useBookingNav.tsx` (`canSettings === false`) | typecheck | FĂCUT. Neverificat cu un membru real (§4) |
| D4: rolul din Hub sub nume | `team-texts.ts` (`role` → `roles.*`); `readTeamPage` (`listStaff.role`) | galeria arată meseriile din preview (§5) | FĂCUT |
| D4: cele 4 chei noi | `modules/booking/messages/*.json`: `team.day.{1..7}`, `team.businessClosedDay`, `team.err.failed`, `team.err.removed` | `pnpm i18n:check` | FĂCUT |
| D5 / C1: motivul netrimis rămâne; câmpul doar pentru owner și admin | `TeamScreen.tsx` (`reason` trimis doar cu `canSeeReason`), `TeamDialogs.tsx`, `StaffScheduleDrawer.tsx` (coloana „Motiv”) | testul de integrare din #105 | FĂCUT |
| Acțiunile folosite (7) | `apps/platform/src/server/booking-team-actions.ts`: `readTeamPage`, `readMemberSchedule`, `saveWeeklyHours`, `saveDayOverride`, `removeDayOverride`, `saveTimeOff`, `cancelTimeOff` | typecheck; erorile ajung în ecran (`TeamActionResult`) | FĂCUT |
| Validarea client = validarea server | `team-format.ts` (`validateDay`, `validateTimeOff`) | `team-ui-format.test.ts`: 12 zile, comparate cu `validateWorkDay` + `requireWithinBusiness` | FĂCUT |
| i18n `booking.team.*` (81 din S124 + cele noi = 91) | `modules/booking/messages/{6}.json`; en / fr / es / de / it = ro, **netradus** | `pnpm i18n:check` | FĂCUT |
| Cele 40 de perechi `_design` / `_impl` (10 cadre × 1280 / 390 × light / dark) | `reports/2026-11-10_b2-ui-capturi/` | §3 | FĂCUT: toate sub 2%, maxim 0,4%. Plus 20 la 820 |
| BookingTeamSchedule în `enforced` | `scripts/visual-check.config.json` | `visual-check --only BookingTeamSchedule` → „Toate 4 în prag” | FĂCUT |
| PR către `main`, cu nota că depinde de C1 | — | — | FĂCUT |
| Fără merge | — | — | FĂCUT |

## 2. Ce conține PR-ul

- **`modules/booking/src/ui/team/`:**
  - lista, cu Notice-ul pentru cine a plecat cu programări;
  - rândul afacerii;
  - membrii, cu săptămâna grupată („Lun–Vin …”, „Lun, Mie, Vin …”) și „Urmează”;
  - „Nu mai sunt în echipă”;
  - starea goală;
  - Drawer-ul, dialogurile, regulile pure și textele.
- **Antetul Setărilor:**
  - primește descrierea tabului;
  - `ServicesToast` devine `SettingsToast`, iar vechiul nume rămâne ca alias, deci BookingServices nu se schimbă.
- **Aplicația:**
  - acțiunile;
  - `TeamScreen.tsx`;
  - rutele;
  - Spine-ul;
  - `useMode` mutat într-un fișier comun, cu logica din `ServicesScreen` neschimbată.
- **Galeria:**
  - `BookingTeamSchedule`, cu cele 10 cadre și exact datele din preview (azi = 8 nov. 2026);
  - shell-ul EasyBook al galeriilor mutat în `_shared/booking-shell.tsx`, folosit și de BookingServices, al cărui cadru 1 rămâne la 0,01–0,26%.

## 3. Capturile (`reports/2026-11-10_b2-ui-capturi/`)

Fiecare `BookingTeamSchedule_<cadru>_<lățime>_<temă>_pair.png` are designul în stânga și implementarea în dreapta. Diferența e pixelmatch cu pragul 0,1. `results.json` are toate valorile.

| # | Cadrul | 1280 light | 1280 dark | 390 light | 390 dark | 820 light | 820 dark |
|---|---|---|---|---|---|---|---|
| 1 | Lista și cine nu mai e în echipă | 0,29% | 0,32% | 0,04% | 0,04% | 0,03% | 0,02% |
| 2 | Drawer-ul: săptămâna, excepțiile, concediile | 0,29% | 0,28% | 0% | 0% | 0,02% | 0,01% |
| 3 | Erori: în afara programului, suprapuse | 0,26% | 0,25% | 0% | 0% | 0,02% | 0,01% |
| 4 | Excepție: zi liberă, cu programări | 0,4% | 0,38% | 0,02% | 0,02% | 0,03% | 0,02% |
| 5 | Excepție: alt program, cu pauză | 0,39% | 0,38% | 0,02% | 0,02% | 0,03% | 0,02% |
| 6 | Excepție în afara programului | 0,39% | 0,38% | 0,02% | 0,02% | 0,03% | 0,02% |
| 7 | Concediu, cu programări | 0,4% | 0,38% | 0,04% | 0,03% | 0,04% | 0,03% |
| 8 | Concediu: „Până la” înainte de „De la” | 0,4% | 0,38% | 0,03% | 0,03% | 0,04% | 0,03% |
| 9 | Salvat | 0,3% | 0,32% | 0,01% | 0,01% | 0,03% | 0,02% |
| 10 | Starea goală | 0,15% | 0,21% | 0,05% | 0,05% | 0,03% | 0,03% |

- **Prima rulare:** 2–6,4% pe cadrele cu Notice.
  - Cauza: preview-ul are `.v-notice{margin-bottom:var(--space-2)}`.
  - Corectura: clasa `notice` din BookingServices, pusă pe toate Notice-urile ecranului.
- **Diferențe care rămân, deja existente și în galeria BookingServices:**
  - în Spine-ul galeriei lipsesc „EasyBook” de lângă logo și cifrele contorului;
  - apare butonul Next.js dev.
  - Nu le-am atins: shell-ul galeriei e comun cu BookingServices.

## 4. Ce nu am putut verifica

- **NEFĂCUT: pagina reală cu o sesiune.** Nicio afacere de test nu are EasyBook activ, iar serverul local folosește baza de staging.
  - Verificate: build, typecheck, lint, galeria (aceleași componente) și validarea (test unitar).
  - Nu sunt exersate în browser: acțiunile, reîncărcarea după salvare, erorile serverului afișate pe câmp.
- **Membrul fără `booking:settings`** (404, „Echipa” și „Setări” ascunse): logica e pe server și în Spine, dar n-am verificat-o cu un membru real.

## 5. Abateri și observații

- **Rolul sub nume:**
  - **Galeria** arată meseriile din preview („Stilist”…), ca să corespundă designului.
  - **Aplicația** arată rolul din Hub (decizia 4).
  - **La „Nu mai sunt în echipă”:**
    - aplicația arată doar numele, pentru că contractul nu are rol pentru ei;
    - galeria are meseria, ca în preview (`RemovedMemberRow.role`, opțional).
- **B.4 (programările), doar în galerie:**
  - „{n} de programări vechi”;
  - Notice-ul „… are {n} programări viitoare”;
  - Notice-urile din dialogurile de excepție și de concediu.
  - În aplicație nu apar până la B.4.
- **Selectorul de oră** arată doar orele din programul afacerii din ziua aceea (`timeFrom` / `timeTo`). Valorile din afara lui, ca 08:00 în cadrul cu erori, se afișează și se marchează ca eroare.
- **Linkuri spre ecrane neconstruite, care răspund 404 până la loturile lor** (S123-9):
  - „Schimbă-l în General” → `/booking/settings/general`;
  - „Vezi programările” → `/booking/appointments`.
- **„Deschide Echipă și invitații”** → `/admin/team`.
- **Concediul „prea lung”** (peste 366 de zile) nu are cheie în design; arată `err.failed`.
- **Excepția editată pe altă dată:** contractul face upsert pe dată, așa că excepția veche rămâne. Se poate șterge cu „Șterge excepția”. Nu e desenat, deci nu am adăugat o mutare automată.
- **`docs/plans/BOOKING.md`** nu are încă o secțiune B.2-UI, cum are B.1-UI. Deciziile 1–5 sunt în raportul planului; le pot trece în documentație într-un PR separat, dacă vrei.

## 6. Comenzile

- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm i18n:check`:
  - **prima rulare:** exit 1, doar `format:check` pe `reports/2026-11-10_b2-ui-capturi/results.json`;
  - după formatarea lui: **exit 0** (turbo 8/8, 29/29, 23/23, 7/7; i18n complet).
- `pnpm test:integration` → **exit 0**: booking 105/105, billing 79 trecute și 3 sărite, commercial 94/94; restul suitelor trec, fără erori neprinse.
- `node scripts/visual-check.mjs --base http://localhost:3190 --only BookingTeamSchedule` → „Toate 4 în prag” (0,14–0,16%).
- `team-ui-format.test.ts` → 16/16.
