# CLAUDE.md — Reguli operaționale pentru Claude Code

**Repo:** `C:\Projects\ventora-ecosystem`
**Ultima actualizare:** 2026-10-25 (Faza 0, pasul 0.4 — COMPLET)
**Sursa de adevăr:** `docs/VENTORA_SOURCE_OF_TRUTH.md`

## Căi CLI externe

- **GitHub CLI:** `C:\Program Files\GitHub CLI\gh.exe`
- **Docker:** `C:\Program Files\Docker\Docker\resources\bin\docker.exe`
  - Containerul `ventora-labs-db` (postgres:17) rulează pe `localhost:5432`
  - Folosește o bază separată pentru teste; nu atinge alte baze existente
- **Verificare CI:** o singură dată la câteva minute cu `gh run list`, nu în buclă

## Regula pre-push (obligatorie)

**Înainte de ORICE push (fără excepție):**

```
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

**Înainte de orice push care atinge `core/**`, `packages/**`, `modules/**` sau fișiere de migrație:**

```
pnpm test:integration
```

Dacă comanda reușește (exit 0) → poți face push.
Dacă eșuează sau nu pot rula containerele Docker → mă opresc și raportez fondatoarei. **Nu fac push fără teste verzi.**

Scriptul face automat: pornește postgres:17 + pgbouncer, aplică toate migrațiile, verifică garda de drift pentru cele 3 scheme Prisma (identity, founder, organizations), rulează testele de integrare, și oprește containerele.

**Baza de test e per worktree** (Lot 2.9, `scripts/test-db-config.mjs`): containerele, proiectul compose și porturile se derivă din numele folderului, ca doi agenți în worktree-uri diferite să poată rula `pnpm test:integration` în paralel.

| Folder | Containere | Postgres / pgbouncer |
|---|---|---|
| `ventora-ecosystem` | `ventora-test-ventora-ecosystem-{postgres,pgbouncer}` | 16050 / 16051 |
| `ventora-ecosystem-ui` | `ventora-test-ventora-ecosystem-ui-{postgres,pgbouncer}` | 15676 / 15677 |
| alt folder | `ventora-test-<slug>-…` | 15400–16399, din hash-ul numelui (scriptul îl afișează la pornire) |

- La o coliziune de port: `VENTORA_TEST_PG_PORT` și `VENTORA_TEST_PGBOUNCER_PORT` suprascriu porturile.
- `pnpm test:db:down` oprește doar containerele worktree-ului curent.
- Nu atinge containerul altui worktree și nici vechiul `ventora-test-postgres` (5433), dacă mai rulează.
- CI nu folosește aceste scripturi: are serviciile lui pe 5433/6432, neschimbate.

---

## Reguli obligatorii

1. **Lucrez exclusiv în `C:\Projects\ventora-ecosystem`.** Repo-ul `ventora_hub` este strict read-only — nu îl citesc și nu îl modific fără instrucțiune explicită a fondatoarei.

2. **Niciun secret în cod, commit-uri sau chat.** Secretele și cheile API merg doar în `.env.local` (necommitat) și în setările Vercel/GitHub Actions.

3. **Fără push pe `main` și fără pachete noi în afara celor din documentație, fără acordul fondatoarei.**

4. **La orice conflict între documente: mă opresc și marchez `NECESITĂ DECIZIE FONDATORI`.** Nu rezolv conflicte prin presupuneri.

5. **Statusurile permise:** `CONFIRMAT` / `PROPUS` / `NECESITĂ DECIZIE` / `DE VALIDAT TEHNIC`. Nu declar nimic `CONFIRMAT` fără decizia explicită a fondatoarei.

6. **Înainte de fiecare commit:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm i18n:check`. Commit-ul nu se face dacă oricare dintre aceste comenzi eșuează.

7. **Nu încep un pas nou din `docs/plans/FAZA-0.md` fără aprobarea explicită a fondatoarei.**

8. **Raportez în română, scurt:** ce am făcut, comenzile rulate și rezultatul lor exact, ce a rămas deschis.

9. **Raportul final se scrie și ca fișier** în `reports/YYYY-MM-DD_HHMM_<subiect>.md` (folder necommitat). Raportul conține:
   - SHA-ul fiecărui commit și confirmarea că e **pushed** (`git status -sb` fără „ahead");
   - **lista de bifat a planului aprobat**: fiecare punct și fiecare corectură cerută la aprobare sau la review, cu fișierul modificat și testul care o acoperă. Un punct neimplementat se marchează explicit „NEFĂCUT" cu motivul; nu se omite;
   - abaterile de la plan, marcate ca atare.

10. **Un singur agent per folder de lucru.** Un agent în paralel lucrează în worktree separat (`git worktree add`), pe branch-ul lui. Niciodată doi agenți în același director.

11. **Staging:** migrările și scripturile pe Supabase staging se rulează **doar din `main` actualizat**, doar cu `prisma migrate deploy` (cu `DIRECT_URL`), niciodată cu `psql` direct și niciodată dintr-un branch de lucru. Planul se aprobă de fondatoare înainte de execuție. Nu se rulează teste de integrare pe staging.

12. **UI:** o componentă e gata doar după perechea de capturi `_design` / `_impl` (390/1280 × light/dark), cu exemplele exacte din `preview.html` și diff vizual în raport. CI verde nu înseamnă că arată ca designul.

---

## Sursele de adevăr (ierarhie)

→ Detalii complete: `docs/VENTORA_SOURCE_OF_TRUTH.md`

1. Decizii aprobate ale fondatorilor + `docs/checklists/` (cerințele funcționale)
2. `docs/VENTORA_MASTER_BRIEF.md` (viziunea și regulile de produs)
3. `docs/ARCHITECTURE.md` v0.4.6 (implementarea tehnică aprobată; istoricul deciziilor în §17)
4. `docs/DESIGN_RULES.md` + `docs/design/system/README.md` (regulile vizuale)
5. `docs/VENTORA_SOURCE_OF_TRUTH.md` (indexul central)
6. `docs/adr/` (deciziile arhitecturale individuale)
7. `CLAUDE.md` (acesta — instrucțiuni operaționale)

---

## Structura repository-ului

```
apps/platform/   -> Hub + aplicatii B2B + Network (port 3100, app.ventora-hub.com)
apps/portal/     -> Portal B2C (port 3101, portal.ventora-hub.com)
apps/founder/    -> Founder Control Center (port 3102, founder.ventora-hub.com)
modules/         -> logica de domeniu (cate un pachet pe aplicatie, 15 total)
core/quota/      -> checkQuota, reserveQuota, commitQuota, releaseQuota, refundQuota, freeStockQuota, reconcileExpiredReservations (implementarea în core/commercial, schema commercial; Lot 3.3, C-F3-8: commitQuota)
core/            -> alte servicii de platforma (identity, access, commercial, growth...)
packages/db-kit/ -> withTenantContext, guardTenant, guardBulkOp, cleanUrl, writeOutboxEvent
packages/        -> alte pachete tehnice si UI comune (config, contracts, i18n, ui...)
labs/            -> experimente Faza 0 arhivate in branch archive/labs-faza-0
docs/            -> documentatia aprobata (ARCHITECTURE, DESIGN_RULES, checkliste...)
```

→ Structura completă: `docs/ARCHITECTURE.md §3`

---

## Ce nu este permis în cod

- `prisma db push` în niciun mediu cu date reale (numai migrații versionate)
- Query-uri Prisma raw în afara helper-ului aprobat din `packages/db-kit`
- `withTenantContext` apelat fără `guardTenant` anterior (organizationId nevalidat)
- `updateMany` / `deleteMany` fără filtru explicit — `guardBulkOp` din `packages/db-kit` blochează asta
- `withSystemContext` în codul de request al utilizatorilor
- Texte UI literale în componente — doar chei next-intl prin `useTranslations()`
- Culori sau valori vizuale inventate în cod — doar token-uri din `packages/tokens`
- Componente duplicate pentru Button, Input, Select, Dialog, DataTable, Form, Tabs, Badge, Tooltip, Pagination, DatePicker, Toast, EmptyState, Skeleton, AppShell, Sidebar, PageHeader
- Elementul HTML nativ `<select>` — se folosește `Select` din `packages/ui`
- Importuri din afara `src/contract/` între module
- Secretele/cheile API inline în cod sau în fișiere commituite

---

## Planul curent

→ `docs/plans/FAZA-0.md`

**Faza 0 COMPLETĂ** (25.10.2026). Decizii confirmate în ARCHITECTURE v0.4.0 §17.17:
- **D-DB-1 varianta C:** Un rol de conectare NOINHERIT + roluri de modul NOLOGIN, accesate prin `SET LOCAL ROLE`
- **D-SEC-1:** RLS din ziua 0 cu `current_setting('app.organization_id', true)` — eșec sigur (0 rânduri)
- **D-SEC-3:** `guardBulkOp` înainte de orice `updateMany`/`deleteMany`
- **D-UI-2:** next-intl pentru i18n, 6 limbi (ro/en/fr/es/de/it)

Urmează **Faza 1** (design system + module de produs) — după aprobarea fondatoarei.
