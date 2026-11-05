# Staging, 05.11.2026: migrarea Lotului 4.9 (infrastructura AI)

**Regula 11.** Planul aplicat este cel din `reports/2026-11-05_1759_lot-4-9-ai-pr.md` („Planul de staging”). Fondatoarea a aprobat pe 05.11.2026 migrarea, cu rolurile `ai_rw` (la `app_runtime`) și `ai_founder` (la `founder_runtime`) și GRANT-urile lor. Execuția a cerut-o după merge-ul #71 și CI verde pe `main`.

## Rezultat: migrarea e aplicată și verificată; seed-ul modelelor e pe staging

| Pas | Ce | Stare |
| --- | --- | --- |
| 0 | Accesul | `.env.local` din worktree-ul `ventora-ecosystem-ui`. Toate cele trei URL-uri (`DIRECT_URL`, `DATABASE_URL`, `DATABASE_URL_FOUNDER`) sunt pe host-ul Supabase; valorile nu au fost afișate |
| 1 | `main` după `git fetch` | HEAD = `9a7a71a` (merge-ul #72, după #71 = `a6e096e`). CI pe `main`: #71 → **success**, #72 → **success** (`gh run list`). #73 are o rulare `cancelled`, înlocuită de cea a lui #72, care conține și #73 |
| 2 | Migrarea din `main` e cea aprobată | `git diff 5450afd 9a7a71a -- core/ai/prisma`: **gol**. GRANT, REVOKE, CREATE ROLE, POLICY și SECURITY DEFINER sunt exact cele din raport (L10–L237). Nu există OWNER TO, ALTER ROLE, BYPASSRLS sau vreun GRANT DELETE |
| 3 | „Înainte”, doar citiri (`BEGIN READ ONLY`) | PG **17.11**. `_prisma_migrations`: 41 de rânduri, 0 neterminate, `ai_init` absent. Schema `ai` nu există; rolurile `ai_*` nu există. `app_runtime` și `founder_runtime` există (LOGIN, NOINHERIT). Cheia de cotă `ai.analyses` e în `commercial.quota_key` (flow, analysis, month, block, neretrasă). `migrate status` (ai): în așteptare exact `20261104100001_ai_init` |
| 4 | `prisma migrate deploy` pe `DIRECT_URL` (`@ventora/ai`, din `core/ai`) | **APLICATĂ:** „All migrations have been successfully applied.” (exit 0) |
| 5 | „După” | toate verificările au trecut (detaliile mai jos) |
| 6 | Blocurile `BEGIN … ROLLBACK` ca `app_runtime` și `founder_runtime` | toate refuzurile așteptate au venit; nimic rămas |
| 7 | Scrieri de test | **niciun rând rămas.** `system_prompts` / `usage_records` / `cost_limits` au 0 / 0 / 0 rânduri, iar `gpt-4o` are tot `enabled = true` |

### Verificările „după” (doar citiri)

| Verificare | Rezultat |
| --- | --- |
| `_prisma_migrations` | 42 de rânduri, 0 neterminate; `20261104100001_ai_init` terminată |
| Rolurile | `ai_rw` și `ai_founder`: NOLOGIN, NOINHERIT |
| `pg_auth_members` | `ai_rw` ∈ `app_runtime`; `ai_founder` ∈ `founder_runtime`. Ambele au și membrul `postgres`, pus de Supabase pentru creatorul rolului, ca la `workflows_*` și `support_rw` |
| RLS | activ pe toate cele 4 tabele (`models`, `system_prompts`, `usage_records`, `cost_limits`); **15 politici**, cât are migrarea |
| GRANT-urile pe tabele (`information_schema.role_table_grants`) | exact ca în tabelul aprobat. `ai_rw`: SELECT pe `models`, `system_prompts`, `cost_limits`; SELECT și INSERT pe `usage_records`. `ai_founder`: SELECT, INSERT, UPDATE pe `models`, `system_prompts`, `cost_limits`; SELECT pe `usage_records`. În rest există doar `postgres`, ca proprietar |
| DELETE | `has_table_privilege` dă **false** pe toate cele 4 tabele, pentru `ai_rw`, `ai_founder`, `app_runtime` și `founder_runtime` |
| `ai_rw` fără scriere pe prompturi | INSERT / UPDATE dau false pe `system_prompts`, `models` și `cost_limits`. Singura scriere este INSERT pe `usage_records` |
| Funcțiile | `global_monthly_cost`: **SECURITY DEFINER**, proprietar `postgres`, `search_path=pg_catalog, pg_temp`, EXECUTE doar pentru `ai_rw` și `ai_founder` (fără PUBLIC). `month_bounds`: INVOKER, același `search_path` și aceleași drepturi |
| NULLS NOT DISTINCT | `system_prompts_scope_key` și `cost_limits_scope_key`: da (PG 17, „DE VALIDAT TEHNIC” din raportul lotului e închis) |
| Seed-ul modelelor | 2 rânduri, ambele `openai`, `enabled = true`, 128 000 / 16 384 tokeni (vezi tabelul de mai jos) |

| Model | Lei / token intrare | Lei / token ieșire |
| --- | --- | --- |
| gpt-4o-mini | 0,000000712770 | 0,000002851080 |
| gpt-4o | 0,000011879500 | 0,000047518000 |

Sursa: prețurile OpenAI din 05.11.2026 × cursul BNR 4,7518 din 04.11.2026, cum scrie în comentariul migrării. **Confirmarea fondatoarei e încă deschisă** (NECESITĂ DECIZIE 1 din raportul lotului).

### Blocurile `BEGIN … ROLLBACK`

Fiecare pas a rulat într-o tranzacție separată, cu `SET LOCAL ROLE`, o organizație aleatoare în `app.organization_id` și ROLLBACK la final.

**Ca `app_runtime` (`DATABASE_URL`) → `ai_rw`:**

| Pas | Rezultat |
| --- | --- |
| SELECT `models` / `system_prompts` | merge (2 modele, 0 prompturi) |
| INSERT / UPDATE / DELETE `system_prompts` | **refuzat (42501)** |
| DELETE / UPDATE `usage_records` | **refuzat (42501)** |
| DELETE `models` | **refuzat (42501)** |
| INSERT `cost_limits` | **refuzat (42501)** |
| INSERT `usage_records` pe organizația curentă | merge (rând pe organizația din context) |
| INSERT `usage_records` pe altă organizație | **refuzat (42501, RLS)** |
| `ai.global_monthly_cost(2026, 11)` | merge: `0` |
| `ai.month_bounds(2026, 11)` | [2026-10-31 22:00Z, 2026-11-30 22:00Z), adică luna noiembrie la ora Bucureștiului |
| Global din altă organizație (un singur bloc: rând de 1,50 lei pe org A, apoi citire din org B) | rânduri vizibile din B: **0** (RLS); `global_monthly_cost`: `0` → **`1.50000000`**. Funcția DEFINER vede doar suma, nu rândurile |
| `SET ROLE ai_founder` | **refuzat (42501)** |

**Ca `founder_runtime` (`DATABASE_URL_FOUNDER`) → `ai_founder`:**

| Pas | Rezultat |
| --- | --- |
| SELECT `models` | merge |
| DELETE `models` / `system_prompts` / `cost_limits` / `usage_records` | **refuzat (42501)**, pe toate patru |
| UPDATE `models SET enabled = false` (gpt-4o) | merge: dezactivarea se face prin `enabled` |
| INSERT al primului plafon global (`organization_id` NULL, `month`) | merge |
| Al doilea plafon global, în același bloc | **refuzat (23505, `cost_limits_scope_key`)** |
| `ai.global_monthly_cost` | merge: `0` |
| `SET ROLE ai_rw` | **refuzat (42501)** |

## `turbo.json`

**Neschimbat.** `core/ai` n-are script de build, iar variabilele `OPENAI_API_KEY` și `OPENAI_BASE_URL` se citesc doar la apel (`openAiConfigFromEnv()` în `makeAiProvider`). Nicio aplicație nu importă încă `@ventora/ai`, deci build-ul nu are nevoie de ele.

Când primul apelant (o aplicație) va importa modulul:
- pe Vercel, variabilele se pun la **runtime** (Preview / Production), nu în `passThroughEnv`;
- `passThroughEnv` ar trebui doar dacă build-ul le-ar citi, ceea ce codul de acum nu face;
- tot atunci trebuie pusă și `AI_POOL_MAX` (opțională, implicit 1).

## Abateri

1. **`migrate status` dă exit 1 și înainte, și după migrare.** Tabelul `_prisma_migrations` e comun tuturor schemelor, așa că Prisma raportează și migrările celorlalte module („not found locally”). E același comportament ca la loturile anterioare; pentru `ai` contează doar că `ai_init` era în așteptare înainte și e terminată după (verificat direct în `_prisma_migrations`).
2. **Două pași din blocurile de test au picat la prima rulare din cauza scriptului meu** (tipul parametrului, 42P08), nu a drepturilor. Le-am corectat și am reluat tot setul. Toate blocurile se termină cu ROLLBACK, deci nimic nu s-a scris.

## Ce rămâne deschis (din raportul lotului)

- confirmarea prețurilor și a cursului din seed;
- promptul și modelul implicit: niciun prompt pe staging, deci `runAnalysis` refuză până scrie echipa unul;
- valorile plafoanelor (global și pe afacere): niciunul pe staging, deci nu există oprire globală;
- `OPENAI_API_KEY` în Vercel, la primul apelant real;
- criteriul „un apel trece prin `authorize()`”, la primul apelant.

## Cum s-a lucrat

- Worktree-ul `C:\Projects\ventora-ecosystem-ui`, pe `origin/main` = `9a7a71a`, detașat. Raportul e pe `docs/staging-4.9`.
- `DATABASE_URL=<DIRECT_URL>` a fost setat doar în procesul comenzii `prisma migrate deploy` / `status`, din `.env.local`; ieșirile au fost filtrate de host și URL.
- Pentru schimbări nu s-a folosit `psql`. Verificările au fost citiri `BEGIN READ ONLY … ROLLBACK` pe `DIRECT_URL`, plus blocuri `BEGIN … ROLLBACK` ca `app_runtime` / `founder_runtime`.
- Scripturile ajutătoare au stat în scratchpad-ul sesiunii; nu sunt în commit.
- Fără teste de integrare pe staging.
