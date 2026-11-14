# Fix: `authorize()` refuza un membru sub încărcare (`NotMember` în loc de `Conflict`)

**Branch:** `fix/org-membership-pool-wait`, din `main` (`b3bb006`).
**Status:** PROPUS. Fără migrări.
**Cererea fondatoarei (14.11):** la UI, `appointment-resources.integration.test.ts` a picat o dată: din 50 de cereri paralele, una a primit o eroare de acces în loc de conflict. De verificat dacă e testul sau o problemă reală (rolul / `app.organization_id` prin pgbouncer).

## Cauza: în cod, nu în test

1. Clientul Prisma din `core/organizations` are **o singură conexiune** pe instanță (`max: 1`, ARCHITECTURE §6.2, decizia din 04.11).
2. `resolveOrgContext` (pasul 2 din `authorize()`: este membru activ?) e o tranzacție interactivă. Prisma așteaptă implicit **cel mult 2 secunde** să o pornească (`maxWait`).
3. La 50 de cereri simultane în același proces, una a așteptat conexiunea mai mult de 2 s și a primit **P2028**.
4. `authorize()` transforma **orice** eroare din `resolveOrgContext` în `NotMember`. Așa, o eroare de infrastructură a devenit un refuz de acces.

**Ce nu e cauza:** rolul și `app.organization_id` nu se pierd. `SET LOCAL ROLE` și `set_config(…, true)` sunt locale tranzacției, iar o tranzacție rămâne pe aceeași conexiune și prin pgbouncer în transaction mode.

**Precedent:** identity a avut exact aceeași eroare pe 04.11 (P2028 cu `max: 1`) și a primit `maxWait: 5000` (`core/identity/src/db.ts`). Clienții `organizations` și `access` n-au primit-o.

**Și în producție:** pe Vercel cu Fluid compute, o instanță servește mai multe cereri deodată și ele împart aceeași conexiune. Un vârf de trafic putea arăta „Nu ești membru” unui membru real.

## Fixul

| Punct | Fișier | Test |
| --- | --- | --- |
| `maxWait` 10 s pe clientul `organizations`, cât `connectionTimeoutMillis` al pool-urilor `pg`. Numărul de conexiuni rămâne cel decis (`max: 1`) | `core/organizations/src/db.ts` | „a member whose check waits 3 s…” |
| La fel pe clientul `access` (tot Prisma, tot `max: 1`) | `core/access/src/db.ts` | (același tipar) |
| `authorize()` și `getMemberApplicationAccess()`: `NotMember` și `OrganizationSuspended` rămân ce sunt; orice altă eroare (baza, pool-ul) rămâne ea însăși, adică 500, de reîncercat | `core/access/src/contract.ts` | „a connection that never comes is an error, not NotMember” |
| Bannerul sesiunii de suport: o afacere suspendată tot `NotMember`, ca înainte; o eroare a bazei rămâne ea însăși | `core/access/src/support.ts` | testele existente din `access` |
| 50 de verificări simultane trec | — | „50 checks at once: all of them pass” |

## Testul care reproduce problema

`core/access/src/__tests__/org-pool-wait.integration.test.ts` ține ocupată singura conexiune a clientului `organizations`, apoi verifică un membru.

- **Fără fix**, rulat înainte de corectură (`pnpm test:integration -- --only access`), au picat 2 teste din 3:
  - „waits 3 s” → `NotMember: User is not a member of this organization`, după aproximativ 2 s (P2028 mascat);
  - „never comes” → `NotMember` în loc de eroare.
- **Cu fix:** toate 3 trec.

## Verificări

- **Integrarea** `pnpm test:integration -- --only access,organizations,booking` (după `docker ps` gol): drift 0; organizations 64/64; access 11/11 fișiere, 167/167; booking 40/40, 428/428. Containerele s-au oprit.
  - O primă rulare cu fix s-a oprit pe `lot29b` cu un crash al workerului vitest (0xC0000409), la 0,6 GB de memorie liberă, nu cu o aserțiune picată. Reluată la cererea fondatoarei, după ce s-a eliberat memorie.
- **Lanțul fără Docker**, pe rând: `format:check` exit 0; `lint` 0 erori; `typecheck` 33/33; `test` 29/29; `i18n:check` complet; `guards:verify` „all guards confirmed”; `build` 7/7.

## Decizia fondatoarei (14.11)

- **Numărul de conexiuni rămâne cel din ARCHITECTURE §6.2** (`max: 1`). Revenim doar dacă pe staging apar întârzieri la verificarea de membru.
- **Celelalte pool-uri cu `max: 1`** (`booking`, `crm`, `audit` etc.) folosesc `pg` direct, nu Prisma: așteaptă până la 10 s (`connectionTimeoutMillis`), fără limita de 2 s.
