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

## Contactele și companiile (CR.2, design S130)
- **`crm.contact`:** o singură companie pe contact (`company_id`, rolul, „Principal”, unul pe companie). Sursa e setul fix S130; `form`, `import` și `easybook` le scriu loturile lor, niciodată de mână.
- **Cine vede:** cu `crm:admin` tot; un membru doar ce i-a fost atribuit și ce e neatribuit („Ia contactul”). Companiile le vede oricine are `crm:read`.
- **Coșul (S130):** „Șterge” pune `deleted_at`; restaurarea e posibilă 30 de zile. Golirea după 30 de zile nu există încă: e NECESITĂ DECIZIE (ștergere fizică sau anonimizare).
- **Contactul din EasyBook:** numele, telefonul, e-mailul și limba sunt doar în citire, iar contactul nu se șterge din ClientDesk (CHECK). Nu ține unitate de cotă.
- **Cota `crm.contacts`:** rezervare (`crm.contact:<id>`), tranzacție, confirmare; eliberare la eșec; resolver-ul `contactQuotaHeld`. „Șterge” eliberează unitatea, restaurarea rezervă alta.
- **ANAF** (`lookupCompanyByCui`): doar completează formularul, fără stocare. Adresa serviciului se configurează (`ANAF_TVA_URL`); e DE VALIDAT TEHNIC.
- **Consimțământul de marketing** nu vine niciodată din bifa rezervării EasyBook (decizia din 10.11.2026). E o bifă separată, nebifată, pe canal, cu textul și data.
  - Nu se construiește în acest modul: consimțământul (e-mail, SMS, WhatsApp), istoricul lui și lista de suprimare stau în `core/consent` (lotul C.5, agentul F5, rolul `consent_rw`). CR.14 îl folosește; dacă C.5 nu e gata, CR.14 așteaptă.
- **Formularele publice (CR.17):** motorul se construiește o singură dată, în packages/Core, comun cu CampaignKit (MK.14). O trimitere ajunge în aplicațiile active ale afacerii: lead în ClientDesk, contact de marketing în CampaignKit.
- **E-mailul ClientDesk:** domeniul propriu al afacerii (SPF / DKIM) e o opțiune de acum (design S134).

## Câmpurile proprii (CR.3, design S132)
- **`crm.custom_field`:** cel mult 30 active pe afacere (numărate sub un lock tranzacțional), administrate cu `crm:settings`.
  - Tipul se blochează după ce câmpul are valori.
  - O opțiune de listă folosită nu se poate scoate.
  - Coșul păstrează câmpul 30 de zile, cu valorile lui; cât stă în coș, valorile sunt ascunse.
- **Valorile:** `custom_values` (jsonb) pe `contact` și `company`, validate la fiecare scriere față de definițiile active. Auditul primește doar id-urile câmpurilor, niciodată valorile.
- **Câmpurile obligatorii** se cer doar la crearea de mână a unui contact sau a unei companii, niciodată pe contactele vechi sau pe cele din EasyBook (S132). O valoare obligatorie nu se poate șterge.
- **Fără câmpuri pentru date medicale** (S132): ecranul setărilor o spune. Serverul nu o poate impune.
