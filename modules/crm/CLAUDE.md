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

## Etichetele și segmentele (CR.4, design S130 / S132)
- **Etichetele:** `crm.tag` și coloana `contact.tag_ids` (uuid[], cel mult 50), fără tabel de legătură, deci fără `DELETE`.
  - Cine are `crm:settings` creează, redenumește, unește („Unește cu…”: contactele și regulile segmentelor trec pe ținta lui) și șterge (eticheta dispare de pe contacte și din reguli).
  - Etichetarea, în bloc de cel mult 200, urmează regula contactelor.
- **Segmentele:** `crm.segment`, cu regulile în jsonb, evaluate la fiecare citire (se actualizează singure).
  - Criteriile sunt doar cele S130 existente acum: sursă, etichetă, responsabil, data adăugării, companie, ziua de naștere.
  - Starea clientului, ultima vizită și consimțământul vin cu CR.12 / CR.14. Nota EasyBook și datele de sănătate nu sunt niciodată criterii.
  - „Doar eu” îl vede doar autorul. Un segment îl schimbă autorul sau cine are `crm:admin`.
- **Segmentul predefinit** „N-au mai venit de N zile” (`kind = 'lapsed'`): îl creează ClientDesk la prima citire.
  - Se schimbă doar zilele (`settings.lapsed_segment_days`, 7–365, `crm:settings`).
  - Numărul lui așteaptă vizitele din EasyBook (CR.12).

## Duplicatele și îmbinarea (CR.5, design S132; D-CRM-8 = a, D-CRM-9 = a)
- **Perechile:** același telefon (principal sau al doilea), același e-mail sau același nume normalizat.
  - Numele normalizat e `contact.name_key`, calculat de `crm.name_key()` și ținut la zi de un trigger.
  - Perechile se calculează live. „Nu sunt duplicate” se poate anula (`undone_at`).
  - Un membru vede doar perechile cu ambele contacte vizibile pentru el.
- **Îmbinarea și „Nu sunt duplicate”** cer `crm:admin`.
  - Doi clienți EasyBook se îmbină doar în EasyBook. Când unul vine din EasyBook, el rămâne, cu datele lui de bază.
  - Contactul pierdut ajunge în coș, cu `merged_into_id`; unitatea lui de cotă se eliberează, iar îmbinarea rămâne în `contact_merge`.
- **Anularea îmbinării** (30 de zile, S132) e doar o propunere. Un contact îmbinat nu se restaurează.
- **Notițele și fișierele** contactului pierdut sunt pe cel păstrat de la CR.6. Activitățile și deal-urile trec odată cu loturile lor (CR.7–CR.9).

## Notițele, comentariile, fișierele și istoricul (CR.6, design S130)
- **`crm.note`:** `kind` note | comment, pe un contact sau o companie (lead și deal vin cu CR.8 / CR.9).
  - Textul își păstrează rândurile și are 1–5 000 de caractere.
  - Autorul editează („editat”). Autorul sau cine are `crm:admin` șterge, doar în coș.
  - Restaurarea unei notițe nu există: ar cere un cod de audit nou (propunere).
- **Mențiunile:** cel mult 20, doar oameni care văd înregistrarea (S130): membru activ cu acces la ClientDesk; pe un contact atribuit, responsabilul sau cineva cu `crm:admin`.
  - Notificarea lor așteaptă șabloanele din `core/notifications` (un PR Core, propunere).
- **Fișierele:** prin `core/files` (`crm` / `contact` | `company` / id), fără tabel `crm`. PNG, JPEG sau PDF, până la 10 MB.
  - Încarcă oricine scrie pe înregistrare. Șterge cel care a încărcat sau cineva cu `crm:admin`.
  - Auditul se scrie imediat după tranzacția din `core/files`.
- **Istoricul** (`getTimeline`): notițele, comentariile și fișierele, cele mai noi întâi. Al unui contact include fișierele contactelor îmbinate în el.
  - Schimbările de câmpuri cer un filtru pe țintă în `core/audit` (propunere).
- **La îmbinare,** notițele trec pe contactul păstrat: `UPDATE(subject_id)`, singura scriere a lui `subject_id`.

## Activitățile, sarcinile, reminderele, calendarul (CR.7, design S131)
- **`crm.activity`:** `kind` task | call | meeting | email | reminder.
  - Înregistrarea legată (contact / companie; lead și deal cu CR.8 / CR.9) e opțională: o sarcină poate sta singură.
  - Termenul e ziua (`due_on`), cu ora opțională (`due_at`). Doar activitățile cu oră apar în calendar.
- **Responsabilul:** creatorul, implicit. Poate fi orice membru care vede înregistrarea. Notificarea atribuirii așteaptă șabloanele din `core/notifications`.
- **Cine vede o activitate:** cu `crm:admin`, oricine. Altfel responsabilul, creatorul și cine vede înregistrarea.
  - **Cine o schimbă, o bifează sau o șterge (în coș):** responsabilul, creatorul sau `crm:admin`.
- **Reminderul:** la oră, cu 15 minute, o oră sau o zi înainte. Cere ora; `remind_at` se recalculează la mutare, iar `reminded_at` se golește.
  - Trimiterea (job-ul) așteaptă șabloanele: propunere.
- **Apelul, întâlnirea și e-mailul** se înregistrează ca făcute, dacă nu vin cu `done: false`.
  - Activitățile făcute intră în istoricul înregistrării.
  - Sarcinile întârziate rămân întârziate până sunt bifate sau mutate (S131).
- **La îmbinare,** activitățile trec pe contactul păstrat (`UPDATE(subject_id)`).

## Leadurile (CR.8, D-CRM-3, design S131)
- **`crm.lead`:** separat de contacte; nu ține unitate din `crm.contacts` până la conversie.
  - Sursele sunt setul fix S131: `form` (scris doar de formulare, CR.17), telefon, e-mail, recomandare, eveniment, manual. Sursele configurabile sunt NECESITĂ DECIZIE.
- **Cine vede:** ca la contacte (D-CRM-15): `crm:admin` tot; un membru leadurile lui și pe cele neatribuite („Ia leadul”).
  - Notițele, activitățile și fișierele merg și pe lead.
- **Stările:** new / contacted / qualified.
  - „Descalifică” cere un motiv S131 și închide leadul. „Redeschide” îl aduce înapoi în new.
- **„Convertește”:**
  - **cu un contact nou:** contactul ia o unitate, iar `createContactInOrg` cu `systemSource` + `inTx` închide leadul în aceeași tranzacție;
  - **„Leagă de contactul existent”:** leadul se leagă fără unitate nouă.
  - Leadul convertit rămâne legat. Istoricul contactului include notițele, activitățile făcute și fișierele leadului.
  - Un lead convertit nu se șterge.
- **Leadurile fără activitate:** `idleDays` (ultima notiță, activitate sau sosirea).
- **De decis (S131):** scorul și ștergerea automată a celor descalificate.
- **Evenimentele `crm.lead.*`** cer tipuri în `packages/contracts` (PR separat, propunere).

## Pipeline-urile și dealurile (CR.9, D-CRM-13, design S131)
- **`crm.pipeline`:** cota de stoc `crm.pipelines` (S131: 2): rezervare, scriere, confirmare; eliberare la ștergere; resolver-ul `pipelineQuotaHeld`.
  - Pipeline-ul implicit („Vânzări”, cheia `sales`) se creează la prima citire, cu etapele din glosar. La limita 0 nu există niciunul.
  - Nu se șterge pipeline-ul implicit și nici unul cu dealuri deschise.
- **`crm.stage`:** etapele deschise, cu probabilitatea implicită. „Câștigat” și „Pierdut” sunt starea dealului, nu etape.
  - O etapă cu dealuri deschise nu se șterge. Un pipeline păstrează cel puțin o etapă.
- **`crm.loss_reason`:** motivele implicite S131 (pe cheie), scrise o dată pe afacere; afacerea le redenumește, adaugă și scoate.
  - Pipeline-urile, etapele și motivele cer `crm:settings`.
- **`crm.deal`:**
  - **Cine vede:** ca la contacte.
  - **Contactul și / sau compania** trebuie să fie vizibile.
  - **Elementele** sunt libere, cu preț (jsonb, fără `DELETE`). Serviciile EasyBook vin cu CR.12. Valoarea e suma elementelor.
  - **Probabilitatea** pornește din etapă și o urmează la mutare. Fiecare mutare intră în `deal_stage_change` și în istoric.
  - **Închiderea:** câștigat (valoarea finală, ziua, de ce), pierdut (motiv obligatoriu), redeschis; coșul.
- **„Blocat de N zile”:** `lastMovedAt` (ultima mutare sau activitate pe deal) și `stuckDays` pe listă.
- **Tabloul:** pe etapă, totalul deschis, ponderatul și câștigatele din luna curentă, pe monedă.
- **La conversia unui lead,** „Creează și un deal” pune bugetul leadului ca valoare.
- **La îmbinarea contactelor,** dealurile trec pe contactul păstrat.
- **Evenimentele `crm.deal.*`** cer tipuri în `packages/contracts` (propunere).
