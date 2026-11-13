# Lot Inngest: consumul și dispecerul (înainte de B.22)

**Branch:** `fix/inngest-consum`, din `main` (`ebf6555`).
**Status:** PROPUS. Fără migrare. Planul Inngest și cheile nu au fost atinse.

## 1. Consumul

### Cauza, din cod (`apps/platform/src/server/jobs.ts`)

- **Joburile pornite în fiecare minut sunt 5, nu 4:**
  - `platform.outbox-dispatch` (dispecerul);
  - `platform.notification-delivery`;
  - `workflows.run` (automatizările);
  - `commercial.invoice-retry` (SmartBill);
  - **`crm.import`** (importul CSV din ClientDesk), al cincilea, care nu era în listă. **Abatere:** l-am tratat ca pe celelalte.
- **Fiecare rulare se numără la Inngest,** chiar dacă iese imediat pentru că nu are de lucru. Funcțiile noastre nu folosesc `step.run`, deci o rulare înseamnă o execuție.
- **Fiecare reîncercare se numără și ea.** Dispecerul avea `retries: 3`. Cât a picat (91,67% din rulări, din cauza `identity`), un minut costa până la 4 execuții în loc de 1.

### „Un singur pas ieftin, apoi ieșire”: era deja așa (CONFIRMAT în cod)

Fiecare job des începe cu o singură interogare pe o funcție `…_due` / `pending_…`, cu limită. Dacă rezultatul e gol, iese fără alt lucru:

| Job | Prima interogare |
| --- | --- |
| `commercial.invoice-retry` | `billing.invoices_due($1)`, în `core/billing/src/invoices.ts` (`runInvoiceIssueJob`) |
| `platform.notification-delivery` | `notifications.pending_deliveries($1)`, în `core/notifications/src/model/delivery.ts` (`deliverPendingNotifications`) |
| `workflows.run` | `workflows.pending_executions($1)`, apoi `workflows.unfreed_stopped_activations($1)` (două interogări ieftine), în `core/workflows/src/engine.ts` |
| `crm.import` | `crm.import_jobs_due(100)`, în `modules/crm/src/server/import-job.ts` |
| dispecerul | `listPendingOutboxEvents(schema, 20)`, pe fiecare schemă (`core/integrations/src/dispatcher.ts`) |

**Concluzie:** verificarea ieftină scade timpul de rulare și încărcarea bazei, dar nu numărul de execuții Inngest. Numărul scade doar dacă rulăm mai rar și dacă nu reîncercăm. Pe acestea le schimbă lotul.

**N-am folosit `step.run` pentru verificare:** la Inngest fiecare pas e o execuție. O rulare cu un pas de verificare și unul de lucru ar costa 2 în loc de 1.

### Ce s-a schimbat

- **Dispecerul** (`core/integrations/src/jobs/outbox-job.ts`, `inngest.ts`):
  - **pornește la eveniment:** o scriere în outbox trimite `platform/outbox.written`, iar funcția `platform.outbox-dispatch.wake` rulează după 10 s de liniște (debounce), cel târziu după 1 minut;
  - **cron de siguranță:** la 15 minute, `*/15 * * * *` în loc de `* * * * *`;
  - **`retries: 0`:** următoarea rulare e reîncercarea;
  - **buget de 40 s pe rulare** (`seconds`): după el nu mai ia evenimente noi, iar ce rămâne apare în `deferred` și pleacă la rularea următoare.
- **Trezirea:**
  - `writeOutboxEvent` (`packages/db-kit/src/outbox.ts`) anunță un ascultător, `onOutboxWritten`, ținut pe `globalThis`, ca să fie același în toate bundle-urile procesului;
  - platform îl pornește în `instrumentation.ts` prin `wakeDispatcherOnOutboxWrite` (`core/integrations/src/jobs/outbox-wake.ts`);
  - trimite cel mult un eveniment la 5 s pe proces;
  - o eroare de trimitere nu atinge scrierea și apare o singură dată în jurnal.
- **Frecvențele, din env** (`cronFor`, `core/integrations/src/jobs/inngest.ts`):
  - `JOB_CRON_<ID>` suprascrie programul unui job, de exemplu `JOB_CRON_PLATFORM_NOTIFICATION_DELIVERY='*/5 * * * *'`. O valoare invalidă se ignoră, cu un mesaj în jurnal;
  - `JOBS_SCHEDULE=quiet` alege programul mai rar (`quietCron`), declarat la fiecare job des;
  - Inngest citește programele la sincronizare, deci o schimbare cere un redeploy;
  - `JOBS_SCHEDULE` și `JOB_CRON_*` sunt adăugate în `turbo.json`.
- **`retries: 0`** și la celelalte joburi pornite în fiecare minut: `notification-delivery`, `workflows.run`, `crm.import`, `invoice-retry`. **PROPUS.**
- **`statement_timeout: 30 s`** pe conexiunea joburilor (`jobs.ts`).

### Programele: producție (implicit) și `JOBS_SCHEDULE=quiet` (staging)

| Job | Implicit | quiet |
| --- | --- | --- |
| `platform.outbox-dispatch` | la eveniment + `*/15` | la eveniment + `*/15` |
| `platform.notification-delivery` | `* * * * *` | `*/10` |
| `workflows.run` | `* * * * *` | `*/10` |
| `crm.import` | `* * * * *` | `*/10` |
| `commercial.invoice-retry` | `* * * * *` | `*/15` |
| `platform.quota-reconcile` | `*/5` | `*/30` |
| `booking.client-emails` | `*/5` | `*/15` |
| `booking.public-hold-cleanup` | `*/10` | `*/30` |
| `growth.auto-stop`, `billing.stripe-reconcile`, `support.auto-close` | `*/15` | o dată pe oră (`5`, `20`, `40`) |
| din oră în oră / zilnice | neschimbate | neschimbate |

### Consumul estimat pe zi (execuții = rulări + reîncercări; fără pași)

| | Pe zi | Pe 30 de zile |
| --- | --- | --- |
| **Înainte** (staging = producție) | 5 × 1.440 = 7.200 (joburile pornite în fiecare minut) + 1.058 (restul) = **8.258** | ~248.000 |
| Înainte, cu dispecerul picând 91,67% și reîncercat de 3 ori | + ~3.960 → **~12.200** | (50.000 atinse în ~4 zile) |
| **După, implicit** (producție) | 4 × 1.440 + 96 + 1.058 = **6.914** + trezirile | ~207.000 + trezirile |
| **După, `JOBS_SCHEDULE=quiet`** (staging) | 624 + 192 + 72 + 50 = **938** + trezirile | ~28.000 + trezirile |

- **Trezirile** depind de trafic: cel mult una la o rafală de scrieri. Cu traficul continuu, maximul e una pe minut (`maxWait`), adică 1.440 pe zi. Pe staging, traficul e mic.
- **Limita Hobby:** 50.000 pe lună înseamnă ~1.666 pe zi. Cu `quiet`, staging rămâne sub ea dacă face sub ~700 de treziri pe zi.
- **De făcut în Vercel (staging), de fondatoare:** `JOBS_SCHEDULE=quiet`, apoi redeploy. Nu e o cheie și n-am atins-o.

## 2. Dispecerul

- **Eșecul unei scheme nu le blochează pe celelalte (CONFIRMAT în cod):**
  - fiecare schemă are `try/catch` în bucla din `outbox-job.ts`;
  - eșecurile se aruncă împreună la final;
  - testul existent „a failing source does not stop the others” (`jobs.integration.test.ts`) arată că o schemă fără outbox nu oprește livrarea din cealaltă.
- **De ce o rulare putea dura minute (DE VALIDAT TEHNIC în panoul Inngest, pe rularea de la 11:01):**
  - Inngest arată la o rulare durata tuturor încercărilor, cu pauzele dintre ele;
  - cu `retries: 3` și o schemă care pică mereu, o rulare are 4 încercări, iar 3m22s se potrivește cu asta. Cauza cea mai probabilă;
  - un risc separat: conexiunea joburilor are `max: 1`. Dacă Vercel rulează două joburi în aceeași instanță, al doilea așteaptă conexiunea (cel mult 10 s, apoi eroare).
- **Acum:**
  - o rulare are o singură încercare (`retries: 0`);
  - un buget de 40 s;
  - o interogare se oprește după 30 s (`statement_timeout`).

## Lista de bifat

| Punct | Fișiere | Test |
| --- | --- | --- |
| Dispecerul pornește la eveniment (debounce 10 s, maxWait 1 min) | `outbox-job.ts`, `inngest.ts`, `outbox-wake.ts`, `db-kit/src/outbox.ts`, `apps/platform/instrumentation.ts` | `jobs.test.ts`: „the wake-up function runs the same logic…”, „a burst of writes sends one event…”, „a failed send never breaks the write…”; `jobs.integration.test.ts`: „served through Inngest: the safety cron…” |
| Cron de siguranță la 15 minute | `outbox-job.ts` | `jobs.integration.test.ts` |
| Frecvențe din env, mai rare pe staging | `inngest.ts` (`cronFor`), `registry.ts` (`quietCron`), `jobs.ts`, `turbo.json` | `jobs.test.ts`: „JOB_CRON_<ID> first…”, „an invalid JOB_CRON_<ID> is ignored…”, „the served function uses the resolved schedule…” |
| O verificare ieftină înainte de lucru | deja în cod (tabelul de mai sus) | testele existente ale joburilor |
| Consumul estimat, înainte și după | acest raport | — |
| Eșecul unei scheme nu blochează celelalte | `outbox-job.ts` (neschimbat aici) | „a failing source does not stop the others…” |
| O rulare nu durează minute | `outbox-job.ts`, `dispatcher.ts` (`deadline`), `jobs.ts` (`statement_timeout`) | „out of time: the remaining sources wait for the next run (deferred)…” |

## NECESITĂ DECIZIE

- **Founder și portal nu au cheia de evenimente Inngest.** Evenimentele scrise acolo (de exemplu un răspuns la suport din Founder sau încasarea unui transfer) pleacă la cron-ul de siguranță, deci cu o întârziere de cel mult 15 minute. Variante:
  - cheia `INNGEST_EVENT_KEY` adăugată și pe aceste aplicații (decizia ta; n-am atins cheile);
  - un cron mai des doar pentru dispecer (`JOB_CRON_PLATFORM_OUTBOX_DISPATCH`).
- **`retries: 0` pe cele 5 joburi dese:** acceptat? Următorul minut e reîncercarea; pe staging, cu `quiet`, următoarele 10–15 minute.

## Abateri

- `crm.import` e tratat ca al cincilea job pornit în fiecare minut.
- Verificarea ieftină nu e un `step.run` Inngest: fiecare pas ar fi fost o execuție în plus.

## Verificări rulate local

- **Fără Docker:** `format:check`, `lint`, `typecheck`, `test`, `i18n:check`, `guards:verify`, `build`, toate exit 0.
- `@ventora/integrations` `jobs.test.ts`: 15/15.
- **Integrarea (`@ventora/integrations`, filtrată):** vezi mai jos.
