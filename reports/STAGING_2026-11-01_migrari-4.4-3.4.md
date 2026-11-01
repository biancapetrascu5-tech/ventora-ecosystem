# Staging, 01.11.2026: migrările 4.4 și 3.4

**Regula 11.** Planurile sunt cele din rapoartele loturilor:

- 4.4: `reports/2026-10-31_lot-4-4-bell-preferences.md`, „Migrări — plan pentru staging”;
- 3.4: `C:\Projects\ventora-ecosystem-ui\reports\2026-10-31_2309_lot-3.4-founder-commercial.md`, „Plan de staging”.

Aplicarea s-a făcut:

- din `main` actualizat: `git pull --ff-only`, HEAD = `913408c`, merge-ul PR #47 (conține #44, #45, #46);
- cu `prisma migrate deploy` pe `DIRECT_URL` din `.env.local`, prin `DATABASE_URL=<DIRECT_URL>` doar în procesul comenzii. URL-ul nu a fost afișat, iar ieșirile sunt filtrate.

## Rezultat

| Modul | Migrarea | Stare |
| --- | --- | --- |
| notifications | `20261101000009_notification_preference_topic` (4.4) | **APLICATĂ**; verificările au trecut |
| commercial | `20261101000007_commercial_requests` | **NEAPLICATĂ: oprit la pasul 4** (GRANT-uri nedescrise în raportul 3.4) |
| commercial | `20261101000008_commercial_founder_screens` | **NEAPLICATĂ** (același deploy) |
| commercial | `20261101000009_commercial_bundles` | **NEAPLICATĂ: oprit la pasul 4** |
| commercial | `20261101000010_commercial_app_setup_direct` | **NEAPLICATĂ** (același deploy) |

**Abatere (greșeala mea, reparată).** La verificarea preferințelor 4.4, un rând de test a ajuns scris pe staging și a stat acolo câteva minute, apoi l-am șters. Detaliile sunt la §4.

## 1. Înainte (doar citire)

| Verificare | Rezultat | Așteptat |
| --- | --- | --- |
| `_prisma_migrations` cu `finished_at IS NULL` sau `rolled_back_at IS NOT NULL` | 0 rânduri | ✓ |
| Migrări aplicate | 25 | ✓ (ca după 31.10 seara) |
| `prisma migrate status`: identity, founder, organizations, access, audit | „Database schema is up to date!” | ✓ |
| `prisma migrate status`: notifications | în așteptare exact `20261101000009_notification_preference_topic` | ✓ |
| `prisma migrate status`: commercial | în așteptare exact 007, 008, 009, 010 | ✓ |
| Altceva în așteptare | nimic | ✓ |
| `to_regclass`: `commercial.commercial_request`, `commercial.application_quota`, `commercial.setting` | `NULL`, `NULL`, `NULL` | ✓ |
| Rolurile `app_runtime`, `founder_runtime`, `commercial_rw`, `commercial_founder`, `notifications_rw` | există toate | ✓ |
| `count(*) FROM commercial.subscription` (N) | **0** | notat |
| Coloana `commercial.subscription.included_members` | nu există | ✓ |
| `count(*) FROM notifications.notification_preference` | 0 | ✓ (planul 4.4) |
| Trigger-ele pe `commercial.*` | 9, niciunul D3-23 (`discount_guard`, `override_guard`, cele 5 `plan_version_*_immutable`, `subscription_change_guard`, `subscription_version_published`) | ✓ |

La modulele cu migrări în așteptare, `migrate status` listează migrările celorlalte module ca „not found locally”. Toate modulele folosesc același tabel `public._prisma_migrations`, deci nu e drift, ca la aplicările anterioare.

## 2. GRANT-urile din migrări (pasul 4)

Toate `GRANT` / `REVOKE` / `SECURITY DEFINER` din cele 5 migrări, căutate în SQL:

- **notifications 009:** niciun GRANT, nicio schimbare de rol. Am aplicat-o.
- **commercial 010:** niciun GRANT. Doar `DROP TRIGGER` / `DROP FUNCTION`.
- **commercial 008:**
  - `GRANT UPDATE ("validity") ON commercial.addon TO commercial_founder`: **singurul aprobat** de fondatoare;
  - `GRANT EXECUTE` către `founder_runtime` pe cele 6 funcții Founder: descrise în planul 3.4 (verificarea „has_function_privilege('founder_runtime', …)” le numește);
  - `REVOKE ALL … FROM PUBLIC` pe aceleași funcții.
- **Nedescrise în raportul 3.4: motivul opririi.** Sunt drepturi pe tabelele noi, pentru roluri existente. Nu creează roluri, nu schimbă apartenența la roluri și nu ating tabele existente. Raportul 3.4 descrie însă tabelele și verificările, nu aceste drepturi:

| Migrarea | Linia | GRANT |
| --- | --- | --- |
| 007 `commercial_requests` | 110 | `GRANT SELECT, INSERT ON commercial.commercial_request TO commercial_rw` |
| 007 | 111 | `GRANT SELECT, UPDATE ON commercial.commercial_request TO commercial_founder` |
| 007 | 148 | `GRANT EXECUTE ON FUNCTION commercial.founder_list_requests(BOOLEAN) TO founder_runtime` (funcția e în planul 3.4; GRANT-ul e implicit în verificare) |
| 009 `commercial_bundles` | 37 | `GRANT SELECT ON commercial.application_quota TO commercial_rw` |
| 009 | 38 | `GRANT SELECT, INSERT, UPDATE, DELETE ON commercial.application_quota TO commercial_founder` |
| 009 | 136 | `GRANT SELECT ON commercial.setting TO commercial_rw` |
| 009 | 137 | `GRANT SELECT, UPDATE ON commercial.setting TO commercial_founder` |
| 009 | 219 | `GRANT EXECUTE ON FUNCTION commercial.founder_list_subscriptions() TO founder_runtime` (în planul 3.4) |

- **Ce ar trebui aprobat:** liniile 110, 111 (007) și 37, 38, 136, 137 (009).
  - Urmează tiparul drepturilor existente: `commercial_rw` doar citește catalogul, iar `commercial_founder` îl scrie.
  - `commercial_rw` primește `INSERT` doar pe cereri: cererea se face din Hub.
  - Fără ele, codul din `main` (#47) nu poate citi tabelele noi.
- **După aprobare,** commercial se aplică într-un singur `deploy`, cu verificările din planul 3.4 (§3 de acolo). Starea de acum rămâne valabilă: nimic nou în așteptare, N = 0 abonamente.

## 3. Migrarea notifications

```
### notifications — prisma migrate deploy --config prisma7.config.ts
Datasource "db": PostgreSQL database "postgres", schemas "notifications" at "[gazda staging, session mode]"
2 migrations found in prisma/migrations
Applying migration `20261101000009_notification_preference_topic`
All migrations have been successfully applied.
EXIT: 0
```

## 4. După

| Verificare | Rezultat | Așteptat |
| --- | --- | --- |
| `prisma migrate status`: identity, founder, organizations, access, audit, notifications | „Database schema is up to date!” | ✓ |
| `prisma migrate status`: commercial | în așteptare 007, 008, 009, 010 (neaplicate, vezi §2) | conform opririi |
| `_prisma_migrations` | 26, niciuna neterminată sau `rolled_back` | ✓ |
| `notification_preference_pkey` | `PRIMARY KEY (user_id, topic, channel)` | ✓ |
| Coloana `topic` | `character varying`, `NOT NULL` | ✓ |
| Ca `app_runtime` (login pe `DATABASE_URL`, pooler) + `SET LOCAL ROLE notifications_rw`, persoana în `app.user_id`, într-un singur bloc `BEGIN … ROLLBACK` | — | — |
| scriere: e-mail oprit pe `billing` (upsert pe cheia nouă) | `billing / email / false` | ✓ |
| a doua scriere, același rând | `billing / email / true` (actualizat, nu dublat) | ✓ |
| citire ca persoana | un rând, `billing / email / true` | ✓ |
| citire ca altă persoană (RLS) | 0 rânduri vizibile | ✓ |
| după `ROLLBACK`: `count(*) FROM notifications.notification_preference` | 0 | ✓ |

**Neverificate (commercial neaplicat):** `included_members = 0` pe abonamentele existente, trigger-ele D3-23 de pe aplicații scoase și `addon_setup_on_request` prezent, `commercial_request` gol. Se fac după aprobarea de la §2.

### Abaterea la verificare (greșeala mea, reparată)

- **Prima încercare** a verificării 4.4 a rulat pe conexiunea `postgres` (DIRECT_URL), cu `SET ROLE app_runtime`.
  - `postgres` pe Supabase nu are voie să ia rolul `app_runtime` (42501).
  - Scriptul meu a făcut `ROLLBACK` la eroare și a continuat cu instrucțiunile următoare, care au rulat în afara tranzacției, ca `postgres`.
- **Efectul:** un rând de test a fost scris (`commit`) în `notifications.notification_preference`:
  - `user_id = 0193a4b0-7c1e-7b3a-9f00-00000000c0de`, un id inventat, care nu e al nimănui;
  - `billing / email`.
- **Repararea:**
  - am verificat că era singurul rând din tabel;
  - l-am șters cu potrivire exactă (`user_id`, `topic`, `channel`); `DELETE … RETURNING` a întors exact acel rând;
  - tabelul a revenit la 0 rânduri.
  - Nicio altă scriere n-a trecut: celelalte instrucțiuni erau citiri sau au fost refuzate.
- **Verificarea refăcută** a rulat ca `app_runtime`, cum cere planul, într-un singur bloc `BEGIN … ROLLBACK`: orice eroare anulează tot blocul. Rezultatele sunt în tabelul de mai sus.

## De știut

- **Deploy-ul aplicațiilor:**
  - **4.4 poate merge pe staging:** codul scrie și citește `topic`, iar migrarea e aplicată.
  - **3.4 nu poate merge** până la aplicarea commercial 007–010: codul cheamă `founder_list_requests`, `application_quota`, `setting` și `subscription.included_members`.
- **Fără sincronizarea registrului comercial:** planul 3.4 spune că nu e necesară.
- **Revenirea** se aprobă separat. Migrarea 4.4 a schimbat cheia primară a unui tabel gol.

## Sarcina 2: deciziile trecute în `docs/plans/FAZA-4.md` (DECIS 01.11.2026)

| Decizia | Ce s-a trecut |
| --- | --- |
| D4-10 | a: webhook-ul Resend după Vercel |
| D4-13 | a: modelul solicitării ca în design |
| D4-14 | b: inbox în Founder, răspunsul vizibil în Hub; până la design, a |
| D4-15 | b: termen urmărit, cu alertă în Founder |
| D4-16 | a: Supabase Storage, UE |
| D4-17 | a: doar PNG / JPG / PDF, până la 10 MB, fără scanare; specialistul în securitate rămâne de întrebat |
| D4-18 | valorile provizorii din plan, „de confirmat cu avocatul” |
| D4-19 | a: PDF din componente React, fără browser; pachetul exact cere acord (regula 3) |
| D4-20 | OpenAI (contul de business existent); de verificat DPA-ul și găzduirea în UE |
| D4-21 | a: intern costul, pentru client cota „Număr analize AI” |
| D4-22 | b: `core/workflows` |
| D4-23 | a: designul automatizărilor cerut acum |
| D4-24 | toate cele 6 automatizări, plus reminderul dinaintea programării, în Booking core |
| D4-25 | a: AI, PDF și workflow engine rămân în F4 |
| D4-26 | a: doar interfața `SmsChannel` în F4 |
| D4-27 | da: traducerile se verifică înaintea primei notificări reale în altă limbă |
| D4-29 (nou, din 4.4) | clopoțelul Founder se decide la 4.6, cu rolul `notifications_founder` |
| D4-30 (nou, din 4.4) | „Noutăți de la Ventora” pe e-mail: „Disponibil în curând”, dezactivat, până la D-GRW-8 |

**De știut:**

- **D4-18:** planul are o singură valoare provizorie, textele SMS la 30 de zile (din design). Pentru atașamente, notificări și solicitări nu există încă o valoare provizorie. Am scris asta în rând, fără să inventez valori. Retenția de 24 / 60 de luni din ARCHITECTURE (L2.5-D7) e pentru identity / organization / access / support / founder, nu pentru acestea.
- **D4-24:** lista celor 6 automatizări nu apare nicăieri în repo (FAZA-4, BOOKING.md, ARCHITECTURE, design). Am trecut decizia cu cuvintele fondatoarei. Lista trebuie numită înainte de 4.10, pentru că lista albă se deduce din ea.
- **D4-29 și D4-30** au primit numere noi; în plan erau doar întrebări în raportul 4.4.

### Follow-up pentru 4.6 (diferență față de 4.4, cod neschimbat)

- **„Noutăți de la Ventora” pe e-mail a fost implementat ca activabil în 4.4.** Decizia D4-30 cere „Disponibil în curând”, dezactivat.
  - `core/notifications/src/model/topics.ts`: `isChangeable('news', 'email')` = true, deci contractul acceptă schimbarea.
  - `apps/platform/src/screens/account/NotificationPrefsView.tsx` (secțiunea Noutăți, ~154–170): comutatorul e activ, nu `isDisabled`.
  - Implicit e oprit (`defaultEnabled`), iar e-mailul comercial e oricum blocat central (D-GRW-8), deci azi nu pleacă niciun e-mail. Doar ecranul promite ceva ce nu se întâmplă.
  - La 4.6: comutatorul dezactivat, cu „Disponibil în curând”, ca la recomandări, și `isChangeable('news', 'email')` = false.
- **Clopoțelul Founder (D4-29):** neschimbat, se face la 4.6.
