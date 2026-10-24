# FAZA 0 — Fundația repository-ului și experimentele tehnice

**Status:** PROPUS — așteaptă aprobarea explicită. Nimic nu se implementează înainte de aprobare.
**Referințe:** `ARCHITECTURE.md` v0.3.0 (§13, §15.1, §17.3, §17.14), `docs/checklists/`
**Scop:** un repository gol, dar complet echipat (structură, CI, garduri automate), plus răspunsuri măsurate la întrebările tehnice deschise, înainte de a scrie vreo funcționalitate.

---

## 1. Ce NU intră în Faza 0

- Nicio funcționalitate de produs. Fără ecrane, fără Hub, fără Booking.
- Fără design system în cod (asta e Faza 1). Designul e aprobat și exportat în `docs/design/system/`, dar în Faza 0 doar se copiază în `docs/`, nu se implementează.
- Fără date reale și fără conectare la producție.
- Nimic în repository-ul vechi `ventora_hub` (rămâne read-only).

Codul experimentelor stă izolat în `labs/` și **nu** devine cod de produs. Din el se păstrează doar concluziile (ADR-uri) și, eventual, utilitarele validate, rescrise curat în `packages/db-kit`.

---

## 2. Ce trebuie pregătit de fondatori înainte de start

| # | Resursă | De ce |
|---|---|---|
| R1 | Repository GitHub nou, privat (de ex. `ventora-ecosystem`) | Codul și CI |
| R2 | Docker Desktop instalat local | Supabase local (Postgres) pentru experimente |
| R3 | Un proiect Supabase de **staging** (cloud), gol | E4 și E5 trebuie rulate prin pooler-ul real Supabase, nu doar local |
| R4 | Un proiect Vercel de test, legat de repo (poate fi șters după) | E4: conexiuni reale din funcții serverless |
| R5 | Cont Inngest (planul gratuit ajunge pentru F0) | E7 |
| R6 | Proiect Sentry (planul gratuit) | Observabilitate din prima zi |

Credențialele se pun doar în `.env.local` și în setările Vercel/GitHub. Niciodată în repo.

---

## 3. Pașii

### Pasul 0.1 — Scheletul repository-ului

**Livrabile:**
- pnpm workspaces + Turborepo; TypeScript strict; Prettier.
- Structura goală din ARCHITECTURE §3: `apps/` (`platform`, `portal`, `founder` ca aplicații Next.js minimale, fiecare cu o singură pagină „OK”), `modules/`, `core/`, `packages/`, `docs/`, `labs/`.
- `docs/` populat: `VENTORA_SOURCE_OF_TRUTH.md` (index), `VENTORA_MASTER_BRIEF.md`, `ARCHITECTURE.md`, `DESIGN_RULES.md`, `GROWTH_ENGINE.md`, `checklists/`, `adr/` (cu șablonul ADR), `design/` (designul unificat aprobat: `system/`, `logo/`, `reviews/`, specificația componentelor comerciale, șablonul fișei de review).
- `CLAUDE.md` în rădăcină: regulile operaționale + trimiteri către `docs/`.
- `packages/config`: validarea variabilelor de mediu cu Zod (aplicația nu pornește dacă lipsește un secret sau e prea scurt).
- `packages/contracts`: **doar tipuri, fără implementare**, pentru pregătirile Growth Engine (D-GRW-3, ARCHITECTURE §8.7): schema manifestului de aplicație cu câmpurile `placements` și `growthSignals` (pot rămâne goale); plicul evenimentelor cu atributul `growthSafe` în catalogul de evenimente; categoria obligatorie a notificărilor (`operational` / `commercial`); câmpurile pentru preferințele comerciale ale utilizatorului (in-app / email, email blocat implicit); plafoanele Growth (valori implicite 1/3/30 și maxime 2/5/14) și starea 2FA a Owner-ului (grație 14 zile) ca tipuri de configurare. Fiecare tip are un comentariu care trimite la `docs/GROWTH_ENGINE.md`.

**Acceptare:** `pnpm install`, `pnpm build`, `pnpm typecheck` trec din rădăcină; cele trei aplicații pornesc local.

### Pasul 0.2 — CI și garduri automate

**Livrabile:**
- GitHub Actions: install → lint → typecheck → test → build, plus gitleaks.
- Regulile de graniță (ARCHITECTURE §13.3) configurate încă de acum: importuri între module doar prin `src/contract`, fără query-uri raw în afara helper-ului aprobat, fără `withSystemContext` în codul de request, fără text UI literal, verificarea cheilor i18n în 6 limbi (pe un catalog de probă).
- **Pentru fiecare regulă, un fișier de test care o încalcă intenționat** (în `labs/violations/`), ca să dovedim că regula chiar pică build-ul. Fișierele sunt excluse din build-ul normal și rulate de un job CI separat, care trebuie să **eșueze** pentru fiecare.
- Sentry inițializat în cele trei aplicații.

**Acceptare:** CI verde pe `main`. Fiecare încălcare intenționată e prinsă de regula ei.

### Pasul 0.3 — Experimentele

Două module de probă în `labs/`, cu date minimale, dar realiste:

- `lab-booking`: `Service`, `Appointment` (aparțin organizației), cu `staffMemberId` ca referință externă.
- `lab-crm`: `Contact` (aparține organizației).
- Un `lab-core` minimal: `Organization`, `User`, `Membership`, `Session`, `UsageCounter`, `QuotaReservation`.
- Un contract între ele: Booking validează un `contactId` prin contractul CRM.

Ordinea și dependențele experimentelor:

```
E2 scheme + migrații ─┐
E3 roluri Postgres ───┼─► E1 Prisma A vs B ─► E4 conexiuni pe Vercel ─► E5 RLS prin pooler ─► E6 limitele gărzii
                      │                                                         │
                      └────────────────────────────────────────────────────────►├─► E9 sesiuni Better Auth
                                                                                ├─► E7 contract + outbox + Inngest
                                                                                ├─► E8 rezervarea cotelor
                                                                                └─► E10 costul operațional (la final)
```

| # | Ipoteza | Cum se testează | Trece dacă | Ce se măsoară |
|---|---|---|---|---|
| **E2** | Fiecare modul își poate gestiona migrațiile independent, în schema proprie | Migrații separate pentru `lab-core`, `lab-booking`, `lab-crm`; aplicate în ordine și în ordine inversă; recreare completă pe o bază curată | Nicio migrație nu atinge altă schemă; baza se recreează integral; tabelul de istoric al migrațiilor e separat pe modul | Pașii manuali necesari |
| **E3** | Un modul nu poate atinge datele altui modul nici dacă codul greșește | Rol Postgres pe modul, cu drepturi doar pe schema proprie; din `lab-booking` se încearcă SELECT/INSERT/UPDATE/DELETE pe `crm.*` | Toate încercările sunt refuzate de baza de date | — |
| **E1** | Varianta A (client Prisma pe modul) sau B (un client, acces controlat) oferă izolare corectă cu dezvoltare simplă | Aceleași două module implementate în ambele variante, pe aceleași scheme | Ambele: izolarea din E3 se păstrează; build-ul trece | Timpul de `generate` și build, mărimea bundle-ului serverless, numărul de pași pentru un model nou, cât de ușor greșește un dezvoltator (încercare deliberată de import interzis) |
| **E4** | Mai mulți clienți sau roluri din același proces Next.js funcționează pe Vercel, prin pooler-ul Supabase | Deploy pe Vercel; test de încărcare (de ex. 200 de request-uri concurente care ating ambele module) | Fără erori de conexiune; numărul de conexiuni rămâne sub limita planului Supabase | Conexiuni active de vârf, latența p50/p95, cold start |
| **E5** | RLS cu `SET LOCAL` în tranzacție funcționează corect prin pooler în transaction mode | Politici RLS pe tabelele organizațiilor; request-uri concurente din organizații diferite pe aceleași conexiuni din pool | Niciun request nu vede rândurile altei organizații; un `SET` de sesiune (interzis) e demonstrat ca periculos și blocat | Overhead-ul RLS față de fără RLS (p50/p95) |
| **E6** | Garda din aplicație prinde cazurile obișnuite; RLS prinde restul | Se încearcă, fără context sau cu context greșit: query raw, scriere nested, `updateMany`/`deleteMany`, agregare | Garda aruncă eroare unde poate; unde nu poate, RLS refuză; niciun caz nu returnează date străine | Tabel: caz × (prins de gardă / prins de RLS) |
| **E9** | Better Auth cu sesiuni în DB permite revocare și retrogradare instantanee, inclusiv pentru un client non-browser (viitoarea aplicație mobilă) | Login → retrogradare rol → request; revocare sesiune → request; 2FA TOTP; aceleași teste cu o sesiune pe bază de token, apelată fără browser | Efect la următorul request, fără așteptarea expirării | Latența verificării sesiunii |
| **E7** | Contractul sincron și outbox → Inngest → consumator funcționează cap-coadă | Booking validează `contactId` prin contractul CRM (inclusiv `AppNotEnabled`); eveniment `lab-booking.appointment.created.v1` → consumator CRM | Livrarea dublă produce efectul o singură dată; un consumator care eșuează de 3 ori ajunge în dead-letter vizibil; un contact din altă organizație e respins | Întârzierea outbox → consumator |
| **E8** | Rezervarea/confirmarea/eliberarea cotelor e corectă la concurență și la eșec | 50 de cereri paralele pe o cotă cu 10 unități; proces oprit forțat între pași; retry cu același `operationId` | Exact 10 reușesc; reconcilierea închide corect rezervările rămase; retry-ul nu dublează consumul | Latența rezervării |
| **E10** | Adăugarea unui modul nou e un proces scurt și repetabil | Se adaugă un al treilea modul de probă de la zero, urmând documentația | Se poate face doar după documentație, fără pași nescriși | Numărul de pași și timpul |

**Fiecare experiment produce:** un raport scurt în `docs/experiments/E<n>.md` (ipoteză, setup, rezultat, măsurători, concluzie) și, unde se ia o decizie, un ADR în `docs/adr/`.

### Pasul 0.4 — Decizii și curățenie

- Pe baza E1–E6: se propun **D-DB-1** (varianta A sau B) și **D-SEC-1** (RLS din prima). Fondatorii le aprobă.
- Utilitarele validate (garda de tenant, setarea contextului RLS, helper-ul de tranzacție, outbox, rezervarea de cote) se **rescriu curat** în `packages/db-kit` și `core/`, cu testele lor. Nu se copiază din `labs/`.
- `labs/` se arhivează într-un branch și se scoate din `main`.
- `CLAUDE.md` și ARCHITECTURE se actualizează cu deciziile luate (v0.3).

---

## 4. Criteriile de ieșire din Faza 0

Faza 0 se închide doar când:

1. Repository-ul, CI-ul și toate gardurile automate funcționează, iar fiecare regulă e dovedită prin încălcarea ei intenționată.
2. Toate cele 10 experimente au raport.
3. D-DB-1 și D-SEC-1 sunt aprobate de fondatori.
4. `packages/db-kit` conține garda de tenant, contextul RLS, tranzacțiile și outbox-ul, cu teste care trec.
5. Testul cross-tenant (T1) și testul RLS direct (T2) rulează în CI pe modulele de probă și trec.
6. Documentul de adăugare a unui modul nou e validat de E10.
7. Viteza reală de lucru e măsurată, ca bază pentru estimarea fazelor următoare.

---

## 5. Riscuri specifice Fazei 0

| Risc | Ce facem dacă se întâmplă |
|---|---|
| Varianta A depășește limitele de conexiuni sau de mărime a funcțiilor pe Vercel | Varianta B devine principală; izolarea rămâne asigurată de rolurile Postgres (E3) și de RLS (E5) |
| RLS prin pooler are overhead mare | Se măsoară exact; RLS se păstrează doar pe tabelele sensibile, iar garda + testele acoperă restul. Decizia aparține fondatorilor. |
| Ambele variante Prisma au probleme grave | Se raportează concret. Orice alternativă (Drizzle) cere aprobarea fondatorilor, pentru că specificația confirmă Prisma. |
| Experimentele se extind | Fiecare experiment are o ipoteză și un criteriu clar; ce depășește scopul se notează ca întrebare pentru faza următoare |

---

## 6. După aprobare

Primul pas va fi un prompt pentru Claude Code pentru **pașii 0.1 și 0.2** (scheletul și CI). Urmează câte un prompt separat pe grupuri de experimente, cu raportul fiecărui grup revizuit înainte de următorul.
