# Lotul B.FK — aceeași afacere pe toate legăturile din Booking (doar baza de date)

Data: 2026-11-12.
- **Ramura:** `feat/bfk-booking-composite-fks`.
- **Baza:** `main` `64fd239`. B.FK nu depinde de #197 (B.9d2), iar migrarea are numărul următor (`…000009`).
- **Main e roșu** din cauza fișierelor de tokenuri de după #194, nu din booking. Reparația e #198.

**Planul:** `reports/2026-11-12_plan-booking-b9.md`, secțiunea „B.FK” (cerut de fondatoare pe 12.11).

**SQL de revizuit:** `modules/booking/prisma/migrations/20261112000009_booking_composite_fks/migration.sql`

## Ce face

- **Până acum:** legăturile spre `client`, `service`, `staff_member`, `resource` și câteva altele erau FK simple, pe `id`. Afacerea o păstrau RLS-ul și trigger-ele, dar baza de date accepta id-ul unui rând din altă afacere.
- **De acum:** orice legătură din schema `booking` e un FK compus `(organization_id, <coloana>) → (organization_id, id)`. Un rând poate arăta doar spre un rând al aceleiași afaceri.
- **`UNIQUE (organization_id, id)`** adăugat pe cele 7 tabele care nu îl aveau: `client`, `service`, `staff_member`, `resource`, `service_category`, `medical_field`, `appointment_payment`.
- **41 de FK simple** șterse și create din nou ca FK compuse:
  - aceleași `ON DELETE RESTRICT ON UPDATE RESTRICT`;
  - nume noi, după modelul `<tabel>_<coloana>_org_fkey`;
  - se aplică tuturor tabelelor (`appointment`, `appointment_series`, `waitlist_entry`, `waitlist_offer`, `class_session`, `public_hold`, `package`, `package_sale`, `staff_*`, `medical_*`, `client_*`, `appointment_payment`, `appointment_resource`, `appointment_history`, `service_resource`, `service`, `client`) și legăturilor spre `appointment` care erau încă simple.
- **Inventarul** a fost generat din toate migrările, cu un script care ține cont de constrângerile șterse între timp.
- **Testul din catalog** verifică pe baza reală că nu a rămas niciun FK simplu.
- **Neschimbate:** coloanele, tabelele, rolurile, GRANT-urile, politicile și funcțiile. Codul nu depinde de numele vechi ale FK-urilor.

**La aplicare:** FK-urile noi se validează când se creează. Dacă un rând arată deja spre altă afacere, migrarea se oprește și nu schimbă nimic. Verificarea dinainte, pentru staging (un exemplu; aceeași formă pentru fiecare legătură):

```sql
SELECT count(*) FROM booking.appointment a JOIN booking.client c ON c.id = a.client_id
 WHERE c.organization_id <> a.organization_id;
```

## Lista de bifat (planul B.FK)

| Punct | Fișier | Test (`composite-fks.integration.test.ts`) |
|---|---|---|
| `UNIQUE (organization_id, id)` pe `client`, `service`, `staff_member`, `resource` (și unde mai lipsea) | migrarea, `schema.prisma` | garda de drift; „the catalogue…” (`refcols = organization_id, id`) |
| FK compuse în tabelele noi (`appointment_series`, `waitlist_entry`, `waitlist_offer`, `class_session`) | migrarea, `schema.prisma` | „the catalogue…”; „the rows…” (`class_session.*`, `waitlist_entry.*`, `appointment_series.*`) |
| FK compuse în tabelele vechi (`appointment`, `appointment_resource` și celelalte) | migrarea, `schema.prisma` | „the catalogue…”; „the rows…” (`appointment.*`, `appointment_resource.resource_id`, `service_resource.*`, `staff_service.*`, `time_block.*`, `client_block.*` etc.) |
| Și coloanele din B.9e (`package.service_id`, `package_sale.client_id` / `service_id`) | migrarea | „the rows…” |
| Un test care refuză, în baza de date, id-urile altei afaceri pe fiecare legătură | testul nou | **Catalogul:** toate FK-urile. **Pe rânduri:** fiecare legătură cu un rând în fixture e mutată spre un rând existent al afacerii B, iar FK-ul compus răspunde cu 23503. Trigger-ele sunt oprite într-o tranzacție anulată la final. Testul cere cel puțin 25 de legături și lista de bază de 21 |

**Abatere, marcată:** testul pe rânduri nu încearcă toate legăturile. Unele n-au rând în fixture: pagina publică, linkurile clientului, câmpurile medicale (au nevoie de funcția plătită), formularele, ședințele din pachete. La altele, un CHECK sau o cheie unică a rândului răspunde înaintea FK-ului. Testul le enumeră (`UNTRIED`); pentru ele, garanția vine din testul de catalog.

## Verificări rulate local

- **`docker ps`**, separat, înaintea fiecărei rulări: niciun container.
- **Toată suita de integrare booking**, `b-files.mjs` cu `FILES="integration"`: 26 de fișiere, **301/301**, cu garda de drift („No difference detected”).
- **După ultimele ajustări ale testului** (fixture-ul și ordinea rândurilor): `FILES="composite-fks staff.integration series appointments.integration"`, **68/68**.
- **Lanțul de verificări:** `pnpm format:check`, `lint`, `typecheck`, `test`, `build`, `i18n:check`, `guards:verify`: toate exit 0.

## Ce rămâne deschis

- **Ordinea față de #197:** dacă #197 intră primul, ordinea rămâne `…000008`, apoi `…000009`.
- **Dacă B.FK intră primul:** la rebase redenumesc migrarea #197 în `…000010`, ca să ruleze după `…000009` (SQL neschimbat). #197 adaugă FK-uri deja compuse, pe care testul de catalog le verifică automat.
- **Următorul lot:** B.13.
