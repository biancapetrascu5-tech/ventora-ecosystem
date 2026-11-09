# Lotul C.2 — `getMemberApplicationAccess` în `core/access` (prerechizit B.2)

**Data:** 08.11.2026 · **Ramura:** `feat/c2-access-has-application-access` (din `main` `1af1dba`) · **Planul:** `reports/2026-11-08_2007_plan-booking-b2-b3.md`, aprobat pe 08.11.2026 (D-B2-1 = a)

## Ce s-a făcut

Un PR Core mic, separat. Booking pune în calendar doar membrii care au EasyBook (D-B2-1 = a). Pentru asta are nevoie să afle, pentru **altă** persoană din afacerea lui, ce are aceasta voie: `authorize()` răspunde doar pentru cel autentificat.

```ts
getMemberApplicationAccess(ctx, userId, applicationId): Promise<
  | { status: 'not_member' }
  | { status: 'suspended'; role }
  | { status: 'active'; role; hasAccess; roleInApp }
>
```

- **Regula e cea din `authorize()`, pașii 2 și 4:**
  - întâi membership-ul persoanei în afacere și starea lui;
  - owner și admin au acces implicit la toate aplicațiile (ADR-0004);
  - celelalte roluri au acces doar cu rândul lor din `access.application_access`, pentru aplicația cerută.
- **Afacerea** vine din contextul autorizat (`ctx`, adică din sesiune), nu din parametri. Membership-ul apelantului e reverificat la fiecare apel, ca în `authorize()`:
  - apelantul suspendat sau scos din afacere primește `NotMember`;
  - afacerea suspendată primește `OrganizationSuspended`.
- **Persoanele din afara afacerii:** o persoană din altă afacere sau un id necunoscut întorc `not_member`. Citirea trece prin RLS-ul din `core/organizations`, deci nu se vede nimic din afacerea altcuiva.
- **Un `userId` care nu e UUID** e refuzat (`TypeError`, ca la `countApplicationAccess`).
- **Rolul nu e filtrat aici:** de exemplu, `external_collaborator` cu acces întoarce `hasAccess: true`. Booking decide singur ce roluri pot sta în calendar (owner, admin, member), ca să nu ajungă o regulă de produs în Core.

## Abateri față de plan

- **Numele și forma contractului.** Planul propunea `hasApplicationAccess(orgId, userId, appId) → boolean`. Contractul livrat întoarce și starea membership-ului și rolul. Booking face astfel un singur apel, în loc să mai citească separat din `core/organizations`. Primește contextul autorizat, nu un `orgId` liber, ca să nu poată fi întrebat despre o afacere străină.

## Testele

`core/access/src/__tests__/c2-member-application-access.integration.test.ts`, pe Postgres real. Contextul vine din `authorize()` ca `app_runtime`.
- **Owner și admin:** au acces implicit.
- **Member:** fără rând nu are acces, cu rândul `booking` are. Rândul `booking` nu dă acces la `crm`.
- **External collaborator:** la fel ca member, după rândul lui.
- **Membrul suspendat:** întoarce `suspended`, cu rolul. Membrul scos întoarce `not_member`.
- **T1 / T2:** owner-ul sau membrul altei afaceri și un id necunoscut întorc `not_member`.
- **Apelantul suspendat între timp:** primește `NotMember`. Un `userId` invalid primește `TypeError`.

## Comenzi rulate (worktree `C:\Projects\ventora-c2`)

| Comandă | Rezultat |
|---|---|
| `pnpm format:check`, `lint`, `typecheck`, `test`, `build`, `i18n:check`, `guards:verify` | exit 0 |
| `pnpm test:integration`, rularea 1 | Toate pachetele verzi până la billing: **access 164/164** (cu cele 4 teste noi), commercial 94, booking 41. **Billing:** 2 teste picate în `lot38-contracts` cu „dunning cannot start in the future”: ceasul din Node era înaintea celui din containerul Postgres. C.2 nu atinge billing, iar billing trecuse complet (79/79) în rularea C.0c, din aceeași bază de cod fără C.2. |
| `pnpm test:integration`, rularea 2 | Procesul vitest s-a oprit pe Windows (0xC0000409) în `organizations`. Niciun test picat. |
| `pnpm test:integration`, rularea 3 | **Access 164/164** din nou. Commercial: `plans.integration.test.ts` a picat la `beforeAll`, care a depășit 10 s (mașina încărcată, cu containerele altui agent pornite în paralel). Niciun test nu a dat un rezultat greșit. |
| A patra rulare | Oprită de sistem din lipsă de memorie, înainte să pornească. Nu am repornit-o. |

**Concluzia:** codul C.2 (`core/access`) are testele lui verzi de două ori, iar suita `access` e completă. Billing și commercial n-au trecut complet într-o rulare locală C.2, din cauze de mediu fără legătură cu `core/access`. **CI-ul pe Linux e verificarea finală.**

## Ce urmează

- **B.2:** folosește contractul prin `staffEligibility()`, când aduce calendarul la zi cu echipa (S124) și, din B.4, la fiecare programare nouă (D-B2-6 = a).
- **Staging:** nimic aplicat, iar C.2 nu are migrare.
