# CLAUDE.md — Reguli operaționale pentru Claude Code

**Repo:** `C:\Projects\ventora-ecosystem`
**Ultima actualizare:** 2026-10-25 (Faza 0, pasul 0.4 — COMPLET)
**Sursa de adevăr:** `docs/VENTORA_SOURCE_OF_TRUTH.md`

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

---

## Sursele de adevăr (ierarhie)

→ Detalii complete: `docs/VENTORA_SOURCE_OF_TRUTH.md`

1. Decizii aprobate ale fondatorilor + `docs/checklists/` (cerințele funcționale)
2. `docs/VENTORA_MASTER_BRIEF.md` (viziunea și regulile de produs)
3. `docs/ARCHITECTURE.md` v0.4.0 (implementarea tehnică aprobată — decizii Fazei 0 CONFIRMATE)
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
core/quota/      -> reserveQuota, confirmQuota, releaseQuota, reconcileExpiredReservations
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
