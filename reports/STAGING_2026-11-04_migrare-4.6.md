# Staging, 04.11.2026: migrările Lotului 4.6 (Suport)

**Regula 11.** Planul aplicat este cel din `reports/2026-11-04_1413_lot-4-6-support-etapa1.md`: §5, plus secțiunea „S-5 = b” pentru `files_founder_upload`. Tabelele de GRANT-uri din același raport au fost aprobate de fondatoare pe 04.11.2026.

## Rezultat: aplicat, toate verificările au trecut

| Pas | Ce | Stare |
| --- | --- | --- |
| 1 | `main` după `git pull --ff-only` | HEAD = `150e5bb` (merge-ul #61). CI-ul pe acest commit (run `41874462199`) a ieșit **verde, 14/14 joburi**, înainte de aplicare |
| 2 | GRANT, REVOKE, CREATE ROLE, SECURITY DEFINER, CREATE POLICY, OWNER TO și ALTER DEFAULT din cele două migrări | fiecare apariție e în tabelele aprobate, la aceleași linii; **nimic în plus** (nu există OWNER TO sau ALTER DEFAULT) |
| 3 | „Înainte”, doar citiri | `_prisma_migrations`: 35 de rânduri, 0 neterminate sau `rolled_back`. `migrate status` e la zi pe 8 scheme: identity, founder, organizations, access, audit, commercial, notifications, billing. În așteptare: files, exact `20261104000002_files_founder_upload`; support, exact `20261104000001_support_init`. Schema `support` nu există. Rolurile `support_rw`, `support_founder`, `files_founder` nu există. `app_runtime` și `founder_runtime` există |
| 4 | `prisma migrate deploy` pe `DIRECT_URL`, în ordinea din plan: support, apoi files. Între cele două migrări nu există dependențe | **ambele APLICATE** |
| 5 | „După” | toate au trecut (detaliile mai jos) |
| 6 | Scrieri de test | **niciun rând rămas.** Vezi abaterea 1, despre secvență |

### Verificările „după”

| Verificare | Rezultat |
| --- | --- |
| `migrate status`, pe toate cele 10 scheme | „Database schema is up to date!” |
| `_prisma_migrations` | 37 de rânduri, 0 neterminate |
| `pg_auth_members` | `support_rw` ∈ `app_runtime`; `support_founder` ∈ `founder_runtime`; `files_founder` ∈ `founder_runtime`. Toate trei sunt NOLOGIN și NOINHERIT. Fiecare are și membrul `postgres`, ca `files_rw`, `billing_rw` și `commercial_founder`: Supabase îl adaugă pe creatorul rolului |
| DELETE | `has_table_privilege` dă false pe cele 6 tabele `support`, pentru `support_rw`, `support_founder`, `app_runtime` și `founder_runtime`. Pentru `files_founder` pe `files.file`, tot false |
| UPDATE pe `support_request.subject` | false pentru `support_rw` și `support_founder` |
| `files_founder` | UPDATE pe `files.file.name`: false; SELECT pe `files.outbox_events`: false. Politicile `files_founder_file` și `files_founder_outbox_events` există |
| RLS | activ pe toate cele 6 tabele din `support` |
| EXECUTE | `founder_list_requests` și `founder_request_counts` → `founder_runtime`; `auto_close_due` și `outbox_pending` → `support_rw`; `outbox_dead_letters` → `founder_runtime`. Toate cinci sunt SECURITY DEFINER. `next_business_day` (nu e DEFINER) → `support_rw` și `support_founder`. Fiecare funcție are și `postgres`, ca proprietar |
| Blocul ca `app_runtime` (login-ul din `DATABASE_URL`), `BEGIN … ROLLBACK` trimis ca un singur query, cu `SET LOCAL ROLE support_rw` | în A, o solicitare: vizibilă (1 rând, ref `VS-2026-0001`). Din B: 0 rânduri. Fără context: 0 rânduri. DELETE: refuzat (42501). UPDATE pe `subject`: refuzat (42501). INSERT cu organizația A din contextul B: refuzat (42501, RLS) |
| După ROLLBACK, ca `postgres`, doar citire | `support_request`: 0 rânduri; `support_message`: 0 rânduri; `files.file` cu `owner_module = 'support'`: 0 rânduri |

## Abateri

1. **Secvența referințelor a avansat cu 1.** `nextval` nu se anulează la ROLLBACK, iar INSERT-ul de test a consumat `support_request_ref_number_seq` = 1. Prima solicitare reală va primi `VS-2026-0002`, nu `VS-2026-0001`. Pe staging nu am corectat nimic: un `setval` ar fi o scriere în afara planului. **NECESITĂ DECIZIE:**
   - lăsăm așa (recomand: e staging, iar referințele nu trebuie să fie fără goluri);
   - sau, cu aprobare, `SELECT setval('support.support_request_ref_number_seq', 1, false)`.
2. **Funcțiile trigger nu au REVOKE.** `support_request_guard()` și `support_child_guard()` au ACL-ul implicit, deci EXECUTE pentru PUBLIC. Așa sunt scrise în migrare și le-am lăsat, cum s-a aprobat. O funcție trigger nu poate fi apelată direct, așa că nu dă niciun drept în plus.

## Cum s-a lucrat

- `DATABASE_URL=<DIRECT_URL>` a fost setat doar în procesul comenzii `prisma migrate deploy` / `status`, cu valorile din `.env.local`.
- URL-urile și cheile nu au fost afișate.
- Pentru schimbări nu s-a folosit `psql`. Verificările au fost citiri în `BEGIN READ ONLY … ROLLBACK` sau blocul de mai sus.
- Scripturile ajutătoare au stat în scratchpad-ul sesiunii; nu sunt în commit.
