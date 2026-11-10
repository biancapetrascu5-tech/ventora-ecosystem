# modules/booking — reguli pentru Claude Code

Booking (numele afișat EasyBook) e prima aplicație. Planul: `docs/plans/BOOKING.md`. Etapa 1 a început cu Lotul B.1, catalogul de servicii.

## Structura (ARCHITECTURE §3; D-B1-3 = a)
- **`prisma/`:** `schema.prisma`, doar pentru garda de drift, și `migrations/`.
  - CHECK-urile, triggerele, rolul, grant-urile și RLS sunt **doar în migrări**.
  - Nu există un client Prisma generat.
- **`src/contract/`:** API-ul public, singurul import permis din afara modulului (`@ventora/booking`).
- **`src/server/`:**
  - accesul la date: `pg` brut, prin `withBookingTx` (`db.ts`);
  - logica domeniului;
  - validarea.
- **`src/ui/`** (Lotul B.1-UI): ecranele modulului, construite doar din `@ventora/ui`, doar cod de client, importate ca `@ventora/booking/ui`.
  - Componentele primesc doar props: pagina din `apps/platform` și galeria desenează aceleași componente.
  - `services/`: BookingServices (B.1-UI). `team/`: BookingTeamSchedule, „Programul echipei” (B.2-UI). Validarea din `team/team-format.ts` urmează `server/schedule.ts` în aceeași ordine; testul `team-ui-format.test.ts` le compară.
  - `pnpm lint` le verifică (`eslint.config.mjs`): fără texte literale, fără `<select>` nativ, componentele comune doar din `@ventora/ui`.
- **`messages/{ro,en,fr,es,de,it}.json`:** namespace-ul `booking` (ARCHITECTURE §744), legat în `apps/platform/src/i18n/request.ts` și verificat de `pnpm i18n:check`.
  - Cheile `booking.services.*` vin din designul S123; en / fr / es / de / it au textul românesc, netradus (S123-10).
  - Cheile `booking.team.*` vin din designul S124, plus cele 4 aprobate pe 09.11.2026 (`team.day.{1..7}`, `team.businessClosedDay`, `team.err.failed`, `team.err.removed`); tot netraduse în celelalte limbi.
- **`package.json` „exports”:** `.` (contractul), `./ui`, `./messages/*`. O aplicație nu poate importa `src/server`.
  - Garda din `apps/platform/eslint.config.mjs` (decisă 09.11.2026): aplicația importă din modul doar aceste trei intrări (`no-restricted-imports`, `[module-entry-only]`).
- **Importurile interne** sunt fără extensie, ca în `core/*`: Turbopack nu rezolvă `./x.js` spre `x.ts` când modulul e transpilat de platformă.

## Reguli obligatorii
1. **Proprietar unic (§6.4 a).** Doar acest modul scrie în schema `booking`.
2. **Rolul `booking_rw`** e `NOLOGIN NOINHERIT`, acordat doar lui `app_runtime`.
   - Fiecare tranzacție face `SET LOCAL ROLE booking_rw` și `set_config('app.organization_id', …, true)`.
   - Niciodată `SET` la nivel de sesiune, niciodată `withSystemContext` în codul de request.
3. **RLS pe fiecare tabel nou** (D-SEC-1), cu `USING` și `WITH CHECK` pe `app.organization_id`.
   - Testul „every table of the booking schema has RLS on…” pică dacă lipsește.
4. **GRANT-uri explicite pe fiecare tabel și coloană,** în migrarea lui.
   - Fără `DELETE` pe entitățile referibile (§6.4 c): se arhivează (`archived_at`, `archived_by_user_id`).
   - Fără `UPDATE` pe `id`, `organization_id`, `created_*`.
   - Fără `ALTER DEFAULT PRIVILEGES`.
5. **Fiecare contract începe cu `authorize()`.**
   - Citirea cere `booking:read`; catalogul și setările cer `booking:settings` (D-B1-1).
   - Organizația vine doar din sesiune. Un id al altei afaceri dă `ResourceNotFound` (T1).
6. **Auditul** (categoria `booking`, `AuditActions.booking*`) se scrie în aceeași tranzacție cu scrierea, prin `appendAuditEventInTx(exec, …)`.
7. **Evenimentele** se scriu în `booking.outbox_events`, cu `writeOutboxEvent`, în aceeași tranzacție.
   - Tipurile sunt în `packages/contracts/src/event-catalog.ts`.
   - Schema e înregistrată în `apps/platform/src/server/jobs.ts` (`OUTBOX_SOURCES`).
8. **Referințele către alte module** se validează prin contractul lor (§6.4 b), niciodată din tabelele lor.
   - Exemplu: fusul orar, prin `getOrganizationTimeZone` din `@ventora/organizations` (C.0).
9. **O migrare nouă** se adaugă în `scripts/test-db-up.mjs` (baza `access`) și se aplică de bucla din `ci.yml` (jobul „access + booking + billing”).
10. **Teste pe fiecare lot:**
    - T1–T2 pe tabelele noi, T3 generat din manifest, T4;
    - T5 unde consumă cote, T6 unde emite evenimente;
    - pe rolul real `app_runtime`.

## Catalogul de servicii (B.1)
- **`service_category`** și **`service`**:
  - durata fixă, sau variabilă cu `duration_max_minutes`;
  - prețul `fixed` / `from` / `range`, în bani;
  - moneda `RON` / `EUR` (D-B1-2), capacitatea 1–100, `bookable_online`.
- **Arhivarea și restaurarea** sunt auditate.
  - O categorie cu servicii active nu se arhivează.
  - Triggerul `service_guard` ține serviciul într-o categorie activă a aceleiași afaceri.
- **`listBookableServices`** (intern) e sursa pentru programarea nouă (B.4 / B.5 / BookingNew).
  - Durata variabilă (S123-3, decis 08.11.2026): online se ține liber maximul; echipa îl poate scurta în programare. Se implementează în B.4 / B.5.
  - „Clienți în același timp” per membru al echipei (S123-6): decis la B.4 (D-B4-3 = a), vezi secțiunea B.4a.

## Membrii în calendar și programul lor (B.2, design S124)
- **Cine e în calendar** (D-B-1, D-B2-1 = a): membrii activi owner / admin / member care au EasyBook, citit prin `getMemberApplicationAccess` (`@ventora/access`, C.2).
  - **Din Hub, nu din EasyBook** (S124): `listStaff` aduce calendarul la zi cu echipa. Nu există „adaugă” sau „scoate” în modul.
  - Un membru plecat rămâne în `staff_member` cu `archived_at` și numele copiat (`keep_snapshot`).
  - B.4 cheamă `staffEligibility()` la fiecare programare nouă (D-B2-6 = a).
- **Timpul:** orele sunt minute locale (0–1440, pași de 5), datele sunt `DATE` locale. Momentele exacte se calculează în Postgres, cu `AT TIME ZONE <fusul afacerii>` (C.0). Niciodată ore UTC stocate pentru program.
- **Programul membrului nu depășește programul afacerii** (S124):
  - la salvare se refuză cu `before_open` / `after_close` / `business_closed`;
  - când se schimbă programul afacerii, intervalele se taie (`setBusinessHours` → `affected`).
- **Nimic din B.2 nu anulează programări** (S124): doar avertismente, din B.4.
- **Motivul concediului** e doar pentru owner și admin. Nu intră în audit.

## Programările și cele 7 stări (B.4a, design BookingStatuses / S116)
- **Stările** (D-B-11): `awaiting_payment`, `unconfirmed`, `confirmed`, `in_progress`, `completed`, `cancelled`, `no_show`. Pe ecran: „Încheiată”, „Nu a venit” (S116-D7). Finale: `completed`, `cancelled`, `no_show`.
  - Tranzițiile permise sunt în `TRANSITIONS` (`server/appointments.ts`) **și** în trigger-ul `appointment_guard`. Le schimbi în ambele locuri, printr-o migrare nouă.
  - „Nu a venit” doar după ora de început. „Corectează starea…” doar owner / admin, în 24 de ore, doar „Încheiată” ↔ „Nu a venit”, cu motiv (S116-D9, D-B4-11 = a).
  - `awaiting_payment` există în model, dar nicio cale din B.4 nu o creează (avansul vine în B.22).
- **Fără suprapuneri, în bază** (D-B4-2 = a): trigger-ul blochează rândul membrului (`booking.lock_active_staff`, `FOR UPDATE`) și numără ce se suprapune pe `[starts_at, ends_at)`. Fără `btree_gist`.
  - **`service.capacity`** = câți clienți are același membru în același timp, **pentru același serviciu** (S123-6, D-B4-3 = a). Copiat pe programare (`capacity`). Un serviciu diferit sau un interval blocat nu se suprapun niciodată.
  - Ocupă doar `awaiting_payment`, `unconfirmed`, `confirmed`, `in_progress`. O anulare eliberează intervalul imediat.
- **Programul** (D-B4-4 = a): o programare trebuie să încapă într-un interval de lucru al membrului în ziua locală (`staffDayIntervals`). Altfel `Conflict('staff_unavailable')`; echipa adaugă întâi „Alt program” (B.2).
- **Membrul** e verificat la fiecare programare nouă (`staffEligibility`, D-B2-6 = a). Programările unui membru scos rămân și își schimbă starea (S124).
- **Cine ce face** (D-B4-6 = a): `booking:read` citește tot calendarul; `booking:write` creează și modifică, un `member` doar programările lui; cu `booking:admin` toate.
- **Id-ul programării** îl dă apelantul: un retry cu același id întoarce aceeași programare (B.4b: e și `operationId`-ul cotei). Numărul uman vine din `appointment_counter`, fără goluri (D-B4-8).
- **Copiile** (`keep_snapshot`): numele serviciului, al membrului, al clientului, prețul. Nu se actualizează când se schimbă originalul.
- **Date personale:** clientul (nume, telefon, e-mail) și nota echipei **nu intră în audit**. Pe staging doar date de test, până la avizul avocatului și la handler-ul GDPR (B.7).
- **Istoricul** din `BookingDetail` e `appointment_history` (doar INSERT), nu auditul (D-B4-7).

## Cota, evenimentele și numărătorile (B.4b)
- **Cota `booking.appointments`** (saga, ARCHITECTURE §8.3): `reserveQuota` cu id-ul programării ca `operationId` → tranzacția → `commitQuota`; `releaseQuota` dacă tranzacția eșuează. Un pas 2 eșuat se doar jurnalizează: reconcilierea (resolverul `appointmentExists`, înregistrat la încărcarea contractului) decide din existența programării.
- **Rambursarea** unei anulări înainte de început o face consumatorul `bookingQuotaRefundConsumer` al lui `booking.appointment.cancelled` (`quotaRefund: true`); `refundQuota` e idempotent. Înregistrat în `platformConsumers` (`apps/platform/src/server/jobs.ts`, Lotul B.4c).
- **Evenimentele** `booking.appointment.created` / `changed` / `cancelled` / `no_show` / `completed` (v1, `packages/contracts`) se scriu în tranzacția schimbării. Doar id-uri, stări și momente: fără datele clientului și fără nota echipei. O corectare scrie evenimentul stării noi, cu `corrected: true`.
- **Numărătorile** (`countUpcomingAppointments`, plus `upcomingAppointments` în `setStaffDayOverride` / `addStaffTimeOff` / `updateStaffTimeOff` și în `listStaff.removed`): doar programările care ocupă, de acum înainte. Nimic nu se anulează (S124).

## Locurile libere (B.5, design BookingNew / BookingCalendar / BookingPublic)
- **Calculul** e funcția pură `server/slots.ts`, în minute locale pe fiecare dată, ca B.2. `server/availability.ts` citește totul într-o tranzacție `readOnly`:
  - fusul afacerii;
  - serviciul, membrii din calendar încă eligibili (D-B2-6) și zilele lor (`staffLocalDays`, aceeași regulă ca `createAppointment`, D-B4-4);
  - programările care ocupă și intervalele blocate;
  - `notice_min` și `buffer_min`.
  - Minutele locale devin momente în Postgres (`AT TIME ZONE`). O oră care nu există (primăvara) nu se oferă; una dublă (toamna) se oferă o dată.
- **Un loc liber** pentru membrul M:
  - încape într-un interval al zilei;
  - nu atinge un interval blocat și nicio programare la alt serviciu;
  - la același serviciu: mai puține suprapuneri decât `capacity`. Se numără orice suprapunere, ca în trigger;
  - păstrează pauza (`buffer_min`, D-B5-2) față de orice programare pe care nu o împarte; la marginile programului nu se cere pauză;
  - nu e în trecut, iar online respectă preavizul (D-B5-3).
- **Grila** (D-B5-1 = a): din durată în durată, de la începutul fiecărui interval și imediat după fiecare programare sau interval blocat (plus pauza). Orele ocupate de pe grilă rămân în listă, `available: false`, doar la un singur membru.
- **„Oricine e liber”** (D-B5-4 = a): reuniunea orelor libere. `staffMemberIds` e în ordinea alegerii: cele mai puține programări în acea zi, apoi ordinea din echipă.
  - `createAppointment({ staffMemberId: 'any' })` îi încearcă pe rând, fiecare cu un savepoint, în aceeași tranzacție și cu aceeași rezervare de cotă. O cerere paralelă care a luat ora (23P01) trece la următorul. Nimeni → `Conflict('appointment_overlap')`.
  - Un `member` (scope `own`) nu poate folosi `'any'`.
- **Contractele** (`booking:read`): `getFreeSlots` (cel mult 7 zile) și `findFirstFreeSlot` (până la 62 de zile; `null` dacă nu e nimic).
  - Regulile echipei: de acum înainte, fără preaviz, durata între minim și maxim.
  - **Online** (`mode: 'online'`, pentru B.11, din contextul paginii publice): preavizul, doar servicii și membri `bookable_online`, durata maximă (S123-3), 30 de zile (D-B5-5).
- **Pauza și preavizul nu se impun la salvarea echipei** (D-B5-2, D-B5-3): doar în listare. Pagina publică le verifică la salvare (B.11).
- **Ce urmează:**
  - B.3b adaugă resursele ca „ocupări” în plus (D-B5-8);
  - B.2b filtrează membrii după serviciile pe care le fac (D-B5-6). Până atunci, orice membru face orice serviciu;
  - B.10 dă fusul locației.

## Resursele (B.3a, design S124 BookingResources)
- **`resource`:** o cameră, un spațiu sau un echipament (`kind`: `room` / `space` / `equipment`, cele trei tipuri fixe din S124). `units` = „Câte programări simultan” (1–50). Numele e unic între resursele active, fără diferență de majuscule.
- **`service_resource`:** „Servicii care o cer”. O programare pentru un astfel de serviciu are nevoie de o unitate liberă din resursă (B.3b). Contractul primește lista completă (`serviceIds`): adaugă ce lipsește, arhivează ce a fost scos. O legătură nu se șterge.
- **Arhivarea** (S124, recomandarea din design): resursa iese din calendar și nu mai poate fi aleasă pentru servicii. Serviciile care o cer rămân legate și se programează fără ea cât e arhivată; după restaurare o cer din nou.
- **Triggerul `service_resource_guard`:** o legătură nouă sau readusă unește un serviciu activ și o resursă activă ale aceleiași afaceri, oricine scrie.
- **Drepturile:** citire cu `booking:read`, scriere cu `booking:settings`. Auditul: `booking.resource_*` (C.0e), ținta `booking_resource`.
- **Ce nu intră:**
  - oamenii de pe resursă (D-B3-1): designul S124 nu-i mai are, iar cine face ce vine cu B.2b;
  - unitățile cerute pe serviciu: o programare ia mereu o unitate.

## Resursa pe programare (B.3b)
- **`appointment_resource`** (doar INSERT): o programare ia o unitate din fiecare resursă activă pe care o cere serviciul ei (`requiredResources`), în aceeași tranzacție. O resursă arhivată nu se cere (S124).
- **„Două programări nu folosesc aceeași resursă în același timp, nici la cereri paralele”** e o regulă a bazei, fără `btree_gist` (D-B4-2 = a). `booking.check_resource_free` blochează rândul resursei (`FOR UPDATE`) și numără programările care ocupă, o folosesc și se suprapun, față de `units`.
  - **La o folosire nouă:** triggerul `appointment_resource_guard`.
  - **La o mutare:** triggerul `appointment_resource_recheck`, AFTER UPDATE, după blocarea membrului.
  - **Refuzul:** 23P01 cu hint `resource` → `Conflict('resource_unavailable')`. „Oricine e liber” nu trece la alt membru pentru o resursă plină.
- **O programare anulată sau încheiată** nu mai ține unitatea, fiindcă se numără după stare.
- **Locurile libere** (D-B5-8 = a): `rules.resources` din `slots.ts`, o oră cere o unitate liberă în fiecare resursă. `getAppointment` întoarce `resourceIds`.

## Cine face fiecare serviciu (B.2b, design S129)
- **Un membru M face serviciul S** dacă:
  - `S.all_staff` („Toată echipa”, inclusiv membrii care intră mai târziu), sau
  - `M.all_services` („Toate serviciile”, inclusiv serviciile adăugate mai târziu), sau
  - există un rând activ `staff_service` (M, S), bifat individual.
  - Condiția SQL comună e `DOES_SERVICE` (`server/staff-services.ts`).
- **Implicit, toți fac tot:** ambele flag-uri pornesc `true`, iar un membru nou primește toate serviciile (S129, cu Notice în ecran).
- **Un serviciu nou** primește bifați pe cei care fac deja servicii din categoria lui (`addDefaultStaffInTx`); „Fără categorie” nu bifează pe nimeni. Completarea implicită doar adaugă bife, nu ia nimănui „Toate serviciile”.
- **Ambele părți editează aceeași legătură** (`setServiceStaff`, `setStaffServices`, sau `doneBy` în `createService` / `updateService`). O pereche debifată dintr-un flag transformă flag-ul în bife pentru tot restul, ca să nu se schimbe nimic altceva.
- **Răspunsul** listează perechile oprite, cu programările viitoare (`stopped`); programările rămân (S129).
- **Efectele:**
  - `createAppointment` refuză un membru care nu face serviciul (`staff_not_for_service`) și un serviciu pe care nu-l face nimeni (`service_unassigned`);
  - `moveAppointment` spre alt membru verifică la fel; același membru își poate muta în timp programările păstrate;
  - locurile libere și „Oricine e liber” iau doar membrii care fac serviciul.
- **Un membru fără niciun serviciu** (recepția) e permis.

## Durata și prețul pe membru (B.2c)
- **`staff_service_terms`:** pentru o pereche (membru, serviciu), durata (minimă și maximă) și / sau prețul (fel, sumă, sumă maximă). O coloană NULL păstrează valoarea serviciului. Moneda, capacitatea și resursele rămân ale serviciului.
- **Termenii efectivi** (`server/terms.ts`, `effective`):
  - durata minimă = a membrului ?? a serviciului;
  - durata maximă = a membrului ?? maximul serviciului ?? minimul;
  - prețul = al membrului, dacă e pus întreg, altfel al serviciului.
- **Programarea** (`createAppointment`) ia durata implicită și copia prețului de la membrul ales. O durată cerută în afara limitelor lui → `InvalidInput('durationMinutes')`. La „Oricine e liber”, un membru care nu permite durata cerută e sărit.
- **Locurile libere:** fiecare membru are durata lui. Pentru un membru anume, `durationMinutes` din răspuns e a lui; la „Oricine e liber” e a serviciului.
- **Contractele:** `listStaffServiceTerms` (`booking:read`) și `setStaffServiceTerms` (`booking:settings`); totul NULL înseamnă înapoi la valorile serviciului. Membrul trebuie să facă serviciul (B.2b). Auditul: `booking.staff_updated`, cu `serviceId` și `terms`.
- **Ecranele lipsesc din S129** (BOOKING.md §5.2): prețul și durata pe membru în `BookingServices`, `BookingTeamSchedule`, `BookingNew`, `BookingPublic`.

## Fișa clientului, blocații, îmbinarea, ștergerea GDPR (B.7a)
- **Fișa** (`getClientCard`): clientul, statisticile pe 12 luni, ultimele programări (și ale clienților îmbinați în el, marcate `fromClientId`) și blocarea deschisă. Motivul blocării îl văd doar owner-ul, adminii și application_manager (S125).
- **Blocarea** (`client_block`, `booking:admin`, D-B7-3 = a):
  - motivul are 10–500 de caractere și rămâne după deblocare (jurnalul afacerii); auditul ține doar lungimea lui;
  - o singură blocare deschisă pe client;
  - echipa poate programa un client blocat (D-B7-4 = a); online e refuzat (B.11).
- **Îmbinarea** (`mergeClients`, S139, D-B7-2 = a):
  - dublura se arhivează cu `merged_into_client_id`; programările ei își păstrează `client_id` (protejat) și apar pe fișa clientului păstrat;
  - blocarea câștigă;
  - `fillEmpty` completează doar câmpurile goale.
  - Consimțământul de marketing („cel mai strict”) intră odată cu câmpul lui.
- **Ștergerea GDPR** (`eraseClient` → `booking.erase_client`, `SECURITY DEFINER`, `EXECUTE` doar pentru `booking_rw`, D-B7-1 = a): e singura cale de a schimba copia numelui de pe programări. Anonimizează clientul și clienții îmbinați în el, copiile numelui, notele echipei de pe programările lor și motivele blocărilor. Programările rămân.
- **REGULĂ (fondatoarea, 10.11.2026):** orice lot care adaugă date personale ale clientului (B.8 câmpurile medicale, B.12 răspunsurile la formulare, încasările, mesajele, nota de comportament) extinde `booking.erase_client` și testul de ștergere (`clients-migration.integration.test.ts`), ca după „Client șters” să nu rămână nimic.
- **Evenimentele pentru ClientDesk** (D-CRM-9): `booking.client.created` / `updated` / `merged` / `erased`, doar cu id-uri și momente.
