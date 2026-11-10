# modules/crm — reguli pentru Claude Code

CRM (numele afișat ClientDesk) e a doua aplicație, în pachetul cu EasyBook (D-CRM-0). Planul: `docs/plans/CRM.md`. Cerința de produs: `docs/checklists/02-crm.md` (66 de funcționalități și 4 adăugiri confirmate).

## Structura (ca `modules/booking`)
- **`src/manifest.ts`:**
  - permisiunile (`crm:read`, `crm:write`, `crm:admin`, `crm:settings`, `crm:import`, `crm:export`) și grant-urile implicite (D-CRM-15);
  - cotele `crm.contacts` și `crm.pipelines` (stoc).
  - Permisiunile se sincronizează cu `scripts/sync-permissions.ts`, iar cheile de cotă cu `scripts/sync-commercial-registry.ts`.
- **`src/contract/`:** API-ul public, singurul import permis din afara modulului (`@ventora/crm`).
- **`src/server/`** (de la CR.1):
  - accesul la date: `pg` brut, prin `withCrmTx`;
  - logica domeniului și validarea.
- **`src/ui/`** (de la CR-UI.1): ecranele, doar din `@ventora/ui`, doar props.
- **`messages/{6}.json`** (de la CR.1): namespace-ul `crm`, legat în aplicație și în `pnpm i18n:check`.
- **Importurile interne** sunt fără extensie, ca în `core/*` și `modules/booking`.

## Reguli obligatorii
1. **Proprietar unic (§6.4 a).** Doar acest modul scrie în schema `crm`.
2. **Rolul `crm_rw`** (de la CR.1) e `NOLOGIN NOINHERIT`, acordat doar lui `app_runtime`. Fiecare tranzacție face `SET LOCAL ROLE crm_rw` și `set_config('app.organization_id', …, true)`.
3. **RLS pe fiecare tabel** (D-SEC-1), GRANT-uri explicite.
   - Fără `DELETE` pe entitățile referibile: se arhivează.
   - Fără `UPDATE` pe `id`, `organization_id`, `created_*`.
4. **Fiecare contract începe cu `authorize()`**. Un membru vede doar ce i s-a atribuit și ce e neatribuit (D-CRM-15).
5. **Cota `crm.contacts`** numără doar contactele create în ClientDesk; cele legate din EasyBook nu (D-CRM-4).
6. **Din EasyBook nu intră niciodată:** nota de comportament, lista de blocați, datele medicale (CR.12, test).
7. **Mesajele comerciale** pleacă doar cu consimțământ pe canal, doar prin `notifications`. SMS-ul doar prin SMSLink; niciodată de pe telefonul salonului (D-CRM-6, D-SMS-6).
8. **Auditul** se scrie în aceeași tranzacție, fără date personale în metadate. Codurile de audit noi intră în `core/audit`, într-un PR Core separat.
9. **Evenimentele** se scriu în `crm.outbox_events`, în aceeași tranzacție; tipurile sunt în `packages/contracts`, prin PR separat.
10. **O migrare nouă** se adaugă în `scripts/test-db-up.mjs` și în bucla din `ci.yml`.
