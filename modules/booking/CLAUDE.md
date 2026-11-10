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
- **Rambursarea** unei anulări înainte de început o face consumatorul `bookingQuotaRefundConsumer` al lui `booking.appointment.cancelled` (`quotaRefund: true`); `refundQuota` e idempotent. Aplicația care rulează dispecerul outbox îl înregistrează (`apps/platform/src/server/jobs.ts`, după ce platforma depinde de `@ventora/booking`).
- **Evenimentele** `booking.appointment.created` / `changed` / `cancelled` / `no_show` / `completed` (v1, `packages/contracts`) se scriu în tranzacția schimbării. Doar id-uri, stări și momente: fără datele clientului și fără nota echipei. O corectare scrie evenimentul stării noi, cu `corrected: true`.
- **Numărătorile** (`countUpcomingAppointments`, plus `upcomingAppointments` în `setStaffDayOverride` / `addStaffTimeOff` / `updateStaffTimeOff` și în `listStaff.removed`): doar programările care ocupă, de acum înainte. Nimic nu se anulează (S124).
