# Staging, 04.11.2026: migrarea Lotului 4.10 (Workflow engine)

**Regula 11.** Planul aplicat este cel din `reports/2026-11-04_1819_lot-4-10-workflows-etapa1.md` („Planul de migrare pe staging”), completat în raportul Etapei 2 (seed-ul). Rolurile, RLS-ul, GRANT-urile (liniile 23–731) și funcțiile SECURITY DEFINER au fost aprobate de fondatoare pe 04.11.2026. Seed-ul a fost aprobat pe 04.11.2026, cu `FOUNDER_EMAIL = biancapetrascu5@gmail.com`.

## Rezultat: migrarea e aplicată și verificată; seed-ul e făcut (varianta A, după #66)

| Pas | Ce | Stare |
| --- | --- | --- |
| 0 | Accesul la staging din worktree-ul `ventora-ecosystem-ui` | `.env.local` pus de fondatoare, cu `DIRECT_URL`, `DATABASE_URL`, `DATABASE_URL_FOUNDER`. Nimic copiat din alt folder |
| 1 | `main` după `git fetch` | HEAD = `2571f25` (merge-ul #63). CI-ul pe acest commit (run #299) a ieșit **verde** (confirmat de coordonator la 21:05), înainte de aplicare |
| 2 | GRANT, REVOKE, CREATE ROLE, SECURITY DEFINER, CREATE POLICY din `workflows_init` | migrarea din `main` e identică cu cea aprobată (`git diff 4a4b9e2 2571f25`: gol). Sunt 57 de apariții, toate între liniile 23 și 731 și toate în tabelul aprobat. **Nimic în plus.** Liniile 552 și 709–717 (`REVOKE ALL … FROM PUBLIC`, pe tabele și funcții) sunt în intervalul aprobat, dar fără rând separat în tabel; doar retrag drepturi. Nu există OWNER TO, ALTER ROLE, BYPASSRLS sau vreun GRANT DELETE |
| 3 | „Înainte”, doar citiri | `migrate status` e la zi pe 10 scheme: identity, founder, organizations, access, audit, commercial, notifications, files, billing, support. Pe workflows e în așteptare exact `20261104000003_workflows_init`. `_prisma_migrations`: 37 de rânduri, 0 neterminate. Schema `workflows` nu există; rolurile `workflows_*` nu există. `app_runtime` și `founder_runtime` există (LOGIN, NOINHERIT). `workflows.active` e în `commercial.quota_key` (stock, nu e retrasă). Contul Founder `biancapetrascu5@gmail.com` există, cu 2FA |
| 4 | `prisma migrate deploy` pe `DIRECT_URL` (`@ventora/workflows`) | **APLICATĂ:** „All migrations have been successfully applied.” |
| 5 | „După” | toate verificările au trecut (detaliile mai jos) |
| 6 | Seed: `scripts/seed-workflows.ts`, de două ori | Prima încercare (din `2571f25`, ca `postgres`): **EȘUATĂ, nimic scris** (abaterea 1). Reluat după decizia A, din `main` = `acbb2b8`: **2 rulări, ambele exit 0** (secțiunea „Seed-ul” mai jos) |
| 7 | Scrieri de test | **niciun rând de test rămas.** Singurele rânduri noi sunt cele 6 definiții ale seed-ului, cu versiunile și auditul lor. `activation`, `business_setting`, `execution`, `execution_step` au 0 rânduri |

### Verificările „după”

| Verificare | Rezultat |
| --- | --- |
| `migrate status`, pe toate cele 11 scheme | „Database schema is up to date!” |
| `_prisma_migrations` | 38 de rânduri, 0 neterminate; `workflows_init` terminată |
| Rolurile | `workflows_rw` și `workflows_founder`: NOLOGIN, NOINHERIT |
| `pg_auth_members` | `workflows_rw` ∈ `app_runtime`; `workflows_founder` ∈ `founder_runtime`. Ambele au și membrul `postgres`, pus de Supabase pentru creatorul rolului, ca la `support_rw` |
| `engine_control` | 1 rând: `id = 1`, `paused = false`, `reason = null` |
| RLS | activ pe toate cele 7 tabele; 14 politici |
| DELETE | `has_table_privilege` dă **false** pe toate cele 7 tabele, pentru `workflows_rw`, `workflows_founder`, `app_runtime` și `founder_runtime` |
| Pornirea e doar a Founder (D-WF-3) | `workflows_rw`: INSERT pe `activation` false, UPDATE pe `activation.status` false, UPDATE pe `quota_freed_at` true. `workflows_founder`: INSERT pe `activation` true |
| GRANT-urile pe tabele (`information_schema.role_table_grants`) | exact ca în tabelul aprobat. `workflows_rw`: SELECT pe catalog și `activation`; INSERT și SELECT pe `business_setting`, `execution`, `execution_step`. `workflows_founder`: INSERT și SELECT pe `definition`, `definition_version`, `activation`; SELECT pe rest. UPDATE-urile sunt pe coloane, ca în migrare |
| Funcțiile | SECURITY DEFINER: `pending_executions` și `unfreed_stopped_activations` → `workflows_rw`; `founder_definition_stats`, `founder_list_activations`, `founder_list_executions` → `founder_runtime`. Funcțiile listei albe (nu sunt DEFINER) → `workflows_rw` și `workflows_founder`. Fiecare funcție are și `postgres`, ca proprietar. Funcțiile trigger au ACL-ul implicit (abaterea 2) |
| Blocurile ca `app_runtime` (login-ul din `DATABASE_URL`), fiecare `BEGIN … ROLLBACK`, cu `SET LOCAL ROLE` și o organizație aleatoare | INSERT în `activation` ca `workflows_rw`: **refuzat (42501)**, deci afacerea nu poate porni. UPDATE `activation.status`: refuzat (42501). DELETE din `execution`: refuzat (42501). `SET ROLE workflows_founder` din `app_runtime`: refuzat (42501). SELECT pe catalog ca `workflows_rw`: merge (0 definiții, 0 activări în context, `paused = false`) |

## Seed-ul (varianta A, 04.11.2026)

**Decizia fondatoarei (04.11.2026), varianta A:** id-ul Founder-ului se citește pe `DIRECT_URL` (READ ONLY). Scrierea se face pe `DATABASE_URL_FOUNDER`, ca `founder_runtime`, cu `SET LOCAL ROLE workflows_founder`. Auditul trece prin `appendAuditEventInTx`. Fără GRANT-uri noi.

- PR #66 (`fix/seed-workflows-founder`), merge în `main` = `acbb2b8`. CI-ul pe `main` (run #304) a ieșit **verde** (confirmat de coordonator), înainte de rulare.
- Rulat din worktree-ul `ventora-ecosystem-ui`, pe `origin/main` = `acbb2b8`, detașat, cu `FOUNDER_EMAIL = biancapetrascu5@gmail.com`. `DIRECT_URL` și `DATABASE_URL_FOUNDER` au fost setate doar în procesul comenzii, din `.env.local`, fără să fie afișate.
- Fără `psql`, fără `--force`, fără vreun GRANT.

| Pas | Comandă | Rezultat |
| --- | --- | --- |
| Înainte (doar citire) | — | 0 definiții, 0 versiuni, 0 rânduri de audit `workflows.*` |
| Rularea 1 | `pnpm tsx scripts/seed-workflows.ts` | **exit 0** · „Workflows v1: created thanks, winback, birthday, risk, digest, quota” |
| Rularea 2 | `pnpm tsx scripts/seed-workflows.ts --expect-noop` | **exit 0** · „Workflows v1: nothing to create (all six exist)”. Nimic scris |

**Verificarea după** (doar citire, `BEGIN READ ONLY … ROLLBACK` pe `DIRECT_URL`):

| Verificare | Rezultat |
| --- | --- |
| `workflows.definition` | **6** rânduri, fiecare cu `current_version = 1`, create de Founder-ul `biancapetrascu5@gmail.com` |
| `workflows.definition_version` | **6** rânduri, câte una pe definiție (versiunea 1) |
| Trigger-ele | `thanks` → `booking.appointment_completed`, `winback` → `booking.client_inactive`, `birthday` → `booking.client_birthday`, `risk` → `booking.high_risk`, `digest` → `booking.daily_digest`, `quota` → `commercial.quota_threshold` |
| `audit.audit_log`, `action LIKE 'workflows.%'` | **6** rânduri, toate `workflows.definition_saved`. Categoria `founder`, `actor_type = founder`, 6 din 6 cu `metadata.seed = 'v1'`. Un singur actor, `actor_id = founder_id` = Founder-ul de mai sus |
| `activation` / `business_setting` / `execution` / `execution_step` | 0 / 0 / 0 / 0. **Nicio afacere pornită** |
| `engine_control` | `paused = false` (neschimbat) |

Fiind 6 rânduri de audit la 6 definiții, rularea 2 n-a scris nimic.

## Abateri

1. **Seed-ul nu poate scrie auditul ca `postgres`.** **Rezolvat prin varianta A** (PR #66, secțiunea „Seed-ul”). Ambele rulări au ieșit cu `permission denied to set role "audit_writer"`. Pe Supabase, `postgres` nu e superuser. E membru al `audit_writer`, dar fără dreptul de SET (apartenența pusă automat la crearea rolului). Scriptul lucrează într-o singură tranzacție, iar la eroare face ROLLBACK. Am verificat după, doar prin citire: 0 definiții, 0 versiuni, 0 rânduri de audit `workflows.*`. Pe baza locală de test, `postgres` e superuser, de aceea seed-ul trecea acolo.

   Opțiunile propuse atunci (decizia: **A**, fondatoarea, 04.11.2026):
   - **A (recomandat):** seed-ul citește doar id-ul Founder-ului pe `DIRECT_URL` (`BEGIN READ ONLY`), apoi scrie pe `DATABASE_URL_FOUNDER`, ca `founder_runtime`, cu `SET LOCAL ROLE workflows_founder` (INSERT pe definiții, aprobat). Rândul de audit merge prin `appendAuditEventInTx`, exact ca în contractele Founder. Am verificat pe staging, doar prin citire în `BEGIN READ ONLY … ROLLBACK`, că `founder_runtime` poate face `SET LOCAL ROLE workflows_founder` și `SET LOCAL ROLE audit_writer`. `founder_runtime` nu poate citi `founder_identity` (42501), de aceea id-ul se citește pe `DIRECT_URL`. Schimbarea e un PR mic pe `scripts/seed-workflows.ts`; după merge, seed-ul se rulează din `main`, ca acum.
   - **B:** `GRANT audit_writer TO postgres WITH SET TRUE`. E un GRANT nou pe un rol al auditului; nu îl recomand.
   - **C:** seed fără rânduri de audit. Încalcă „fiecare scriere Founder are auditul ei”; nu îl recomand.
2. **Funcțiile trigger nu au REVOKE:** `activation_guard`, `execution_guard`, `execution_step_guard`, `definition_version_immutable`, `engine_control_guard`. Au ACL-ul implicit (EXECUTE pentru PUBLIC), cum sunt scrise în migrare. O funcție trigger nu poate fi apelată direct, așa că nu dă niciun drept în plus. Același caz ca la 4.6.

## Ce urmează

- Nimic deschis pentru migrare și seed. Pe staging, Founder · Automatizări are acum cele 6 automatizări v1, dar nicio afacere pornită. Pornirea se face din Founder, cu motiv; până atunci nu se trimite nimic.
- Abaterea 2 rămâne doar notată, ca la 4.6.

## Cum s-a lucrat

- Worktree-ul `C:\Projects\ventora-ecosystem-ui`, pe `origin/main` = `2571f25`, detașat; acest raport e pe `docs/staging-4.10`. Seed-ul s-a rulat pe `origin/main` = `acbb2b8`; completarea raportului e pe `docs/staging-4.10-seed`.
- `DATABASE_URL=<DIRECT_URL>` a fost setat doar în procesul comenzii `prisma migrate deploy` / `status`, cu valorile din `.env.local`. URL-urile și cheile nu au fost afișate (ieșirile au fost filtrate de host și URL).
- Pentru schimbări nu s-a folosit `psql`. Verificările au fost citiri în `BEGIN READ ONLY … ROLLBACK` sau blocuri `BEGIN … ROLLBACK` ca `app_runtime` / `founder_runtime`.
- Scripturile ajutătoare au stat în scratchpad-ul sesiunii; nu sunt în commit.
