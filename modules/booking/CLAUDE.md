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
  - `pnpm lint` le verifică (`eslint.config.mjs`): fără texte literale, fără `<select>` nativ, componentele comune doar din `@ventora/ui`.
- **`messages/{ro,en,fr,es,de,it}.json`:** namespace-ul `booking` (ARCHITECTURE §744), legat în `apps/platform/src/i18n/request.ts` și verificat de `pnpm i18n:check`.
  - Cheile `booking.services.*` vin din designul S123; en / fr / es / de / it au textul românesc, netradus (S123-10).
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
  - „Clienți în același timp” per membru al echipei (S123-6): se decide la B.4.

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
