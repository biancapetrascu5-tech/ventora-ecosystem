# Staging, 04.11.2026: migrarea Lotului 4.10 (Workflow engine)

**Regula 11.** Planul aplicat este cel din `reports/2026-11-04_1819_lot-4-10-workflows-etapa1.md` („Planul de migrare pe staging”), completat în raportul Etapei 2 (seed-ul). Rolurile, RLS-ul, GRANT-urile (liniile 23–731) și funcțiile SECURITY DEFINER au fost aprobate de fondatoare pe 04.11.2026. Seed-ul a fost aprobat pe 04.11.2026, cu `FOUNDER_EMAIL = biancapetrascu5@gmail.com`.

## Rezultat: migrarea e aplicată și verificată; seed-ul NU e făcut (NECESITĂ DECIZIE)

| Pas | Ce | Stare |
| --- | --- | --- |
| 0 | Accesul la staging din worktree-ul `ventora-ecosystem-ui` | `.env.local` pus de fondatoare, cu `DIRECT_URL`, `DATABASE_URL`, `DATABASE_URL_FOUNDER`. Nimic copiat din alt folder |
| 1 | `main` după `git fetch` | HEAD = `2571f25` (merge-ul #63). CI-ul pe acest commit (run #299) a ieșit **verde** (confirmat de coordonator la 21:05), înainte de aplicare |
| 2 | GRANT, REVOKE, CREATE ROLE, SECURITY DEFINER, CREATE POLICY din `workflows_init` | migrarea din `main` e identică cu cea aprobată (`git diff 4a4b9e2 2571f25`: gol). Sunt 57 de apariții, toate între liniile 23 și 731 și toate în tabelul aprobat. **Nimic în plus.** Liniile 552 și 709–717 (`REVOKE ALL … FROM PUBLIC`, pe tabele și funcții) sunt în intervalul aprobat, dar fără rând separat în tabel; doar retrag drepturi. Nu există OWNER TO, ALTER ROLE, BYPASSRLS sau vreun GRANT DELETE |
| 3 | „Înainte”, doar citiri | `migrate status` e la zi pe 10 scheme: identity, founder, organizations, access, audit, commercial, notifications, files, billing, support. Pe workflows e în așteptare exact `20261104000003_workflows_init`. `_prisma_migrations`: 37 de rânduri, 0 neterminate. Schema `workflows` nu există; rolurile `workflows_*` nu există. `app_runtime` și `founder_runtime` există (LOGIN, NOINHERIT). `workflows.active` e în `commercial.quota_key` (stock, nu e retrasă). Contul Founder `biancapetrascu5@gmail.com` există, cu 2FA |
| 4 | `prisma migrate deploy` pe `DIRECT_URL` (`@ventora/workflows`) | **APLICATĂ:** „All migrations have been successfully applied.” |
| 5 | „După” | toate verificările au trecut (detaliile mai jos) |
| 6 | Seed: `scripts/seed-workflows.ts`, de două ori | **EȘUAT, nimic scris** (abaterea 1) |
| 7 | Scrieri de test | **niciun rând rămas.** Toate tabelele `workflows` au 0 rânduri; nu există niciun rând de audit `workflows.*` |

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

## Abateri

1. **Seed-ul nu poate scrie auditul ca `postgres`.** Ambele rulări au ieșit cu `permission denied to set role "audit_writer"`. Pe Supabase, `postgres` nu e superuser. E membru al `audit_writer`, dar fără dreptul de SET (apartenența pusă automat la crearea rolului). Scriptul lucrează într-o singură tranzacție, iar la eroare face ROLLBACK. Am verificat după, doar prin citire: 0 definiții, 0 versiuni, 0 rânduri de audit `workflows.*`. Pe baza locală de test, `postgres` e superuser, de aceea seed-ul trecea acolo.

   **NECESITĂ DECIZIE.** Propun **varianta A**, fără niciun GRANT nou:
   - **A (recomandat):** seed-ul citește doar id-ul Founder-ului pe `DIRECT_URL` (`BEGIN READ ONLY`), apoi scrie pe `DATABASE_URL_FOUNDER`, ca `founder_runtime`, cu `SET LOCAL ROLE workflows_founder` (INSERT pe definiții, aprobat). Rândul de audit merge prin `appendAuditEventInTx`, exact ca în contractele Founder. Am verificat pe staging, doar prin citire în `BEGIN READ ONLY … ROLLBACK`, că `founder_runtime` poate face `SET LOCAL ROLE workflows_founder` și `SET LOCAL ROLE audit_writer`. `founder_runtime` nu poate citi `founder_identity` (42501), de aceea id-ul se citește pe `DIRECT_URL`. Schimbarea e un PR mic pe `scripts/seed-workflows.ts`; după merge, seed-ul se rulează din `main`, ca acum.
   - **B:** `GRANT audit_writer TO postgres WITH SET TRUE`. E un GRANT nou pe un rol al auditului; nu îl recomand.
   - **C:** seed fără rânduri de audit. Încalcă „fiecare scriere Founder are auditul ei”; nu îl recomand.
2. **Funcțiile trigger nu au REVOKE:** `activation_guard`, `execution_guard`, `execution_step_guard`, `definition_version_immutable`, `engine_control_guard`. Au ACL-ul implicit (EXECUTE pentru PUBLIC), cum sunt scrise în migrare. O funcție trigger nu poate fi apelată direct, așa că nu dă niciun drept în plus. Același caz ca la 4.6.

## Ce urmează

- Decizia pentru abaterea 1. Cu A: PR-ul cu seed-ul, merge-ul, CI verde pe `main`, apoi seed-ul pe staging de două ori (a doua oară cu `--expect-noop`) și o completare a acestui raport.
- Până atunci, pe staging motorul nu are nicio automatizare definită: Founder · Automatizări arată lista goală, iar Hub · Automatizări arată starea goală. Nu se trimite nimic.

## Cum s-a lucrat

- Worktree-ul `C:\Projects\ventora-ecosystem-ui`, pe `origin/main` = `2571f25`, detașat; acest raport e pe `docs/staging-4.10`.
- `DATABASE_URL=<DIRECT_URL>` a fost setat doar în procesul comenzii `prisma migrate deploy` / `status`, cu valorile din `.env.local`. URL-urile și cheile nu au fost afișate (ieșirile au fost filtrate de host și URL).
- Pentru schimbări nu s-a folosit `psql`. Verificările au fost citiri în `BEGIN READ ONLY … ROLLBACK` sau blocuri `BEGIN … ROLLBACK` ca `app_runtime` / `founder_runtime`.
- Scripturile ajutătoare au stat în scratchpad-ul sesiunii; nu sunt în commit.
