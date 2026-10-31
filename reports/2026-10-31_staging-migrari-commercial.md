# Staging, 31.10.2026: migrările comerciale (Loturile 3.1 și 3.2)

**Regula 11.** Planul e cel aprobat de fondatoare, din rapoartele 3.1 și 3.2. Aplicarea s-a făcut:

- din `main` actualizat (`40b37d2`, care conține #35 / `74817df`);
- cu `prisma migrate deploy` pe `DIRECT_URL` (`aws-1-eu-central-1.pooler.supabase.com:5432`, session mode, utilizatorul `postgres`). URL-ul nu a fost afișat.

**Rezultat:** cele 5 migrări au fost aplicate, iar registrul a fost sincronizat (16 aplicații, 1 funcționalitate, 13 cote). Toate verificările au trecut. Nu s-au creat planuri sau abonamente (D3-1).

## 1. Înainte (doar citire)

| Verificare                                                               | Rezultat                                                                                    | Așteptat |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | -------- |
| `SELECT 1 FROM pg_namespace WHERE nspname = 'commercial'`                | 0 rânduri                                                                                   | ✓        |
| `SELECT to_regclass('commercial.plan')`                                  | `NULL`                                                                                      | ✓        |
| Rolurile `app_runtime`, `founder_runtime`                                | există                                                                                      | ✓        |
| Rolurile `commercial_rw`, `commercial_founder`                           | nu există (le creează migrările)                                                            | ✓        |
| `_prisma_migrations` cu `finished_at IS NULL` sau `rolled_back_at`       | 0 rânduri (16 migrări aplicate)                                                             | ✓        |
| `prisma migrate status`: identity, founder, organizations, access, audit | „Database schema is up to date!”                                                            | ✓        |
| `prisma migrate status`: commercial                                      | în așteptare exact `20261101000001_commercial_init` … `20261101000005_commercial_discounts` | ✓        |

## 2. Migrarea

```
### commercial — prisma migrate deploy --config prisma7.config.ts (DATABASE_URL = DIRECT_URL)
Applying migration `20261101000001_commercial_init`
Applying migration `20261101000002_commercial_plans`
Applying migration `20261101000003_commercial_subscription`
Applying migration `20261101000004_commercial_overrides`
Applying migration `20261101000005_commercial_discounts`
All migrations have been successfully applied.
EXIT: 0
```

## 3. Sincronizarea registrului (`scripts/sync-commercial-registry.ts`, pe `DIRECT_URL`)

```
== rularea 1
  applications: +16 ~0 retired 0
  features: +1 ~0 retired 0
  quotas: +13 ~0 retired 0
Commercial registry synced: 16 applications, 1 features, 13 quotas.   EXIT: 0

== rularea 2 (--expect-noop)
  applications: +0 ~0 retired 0
  features: +0 ~0 retired 0
  quotas: +0 ~0 retired 0
Commercial registry synced: 16 applications, 1 features, 13 quotas.   EXIT: 0
```

Raportul 3.2 aștepta la prima rulare o schimbare `refundable` pe `booking.appointments`. Pe staging, registrul era gol, deci totul a fost inserare.

## 4. După

| Verificare                                                                                            | Rezultat                                               | Așteptat |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------- |
| `prisma migrate status`, toate cele 6 scheme                                                          | „Database schema is up to date!”                       | ✓        |
| Migrările `commercial` în `_prisma_migrations`                                                        | toate terminate, niciuna `rolled_back`                 | ✓        |
| `SELECT count(*) FROM commercial.quota_key WHERE retired_at IS NULL`                                  | 13                                                     | ✓        |
| `SELECT count(*) FROM commercial.plan`                                                                | 0 (D3-1)                                               | ✓        |
| `SELECT count(*) FROM commercial.subscription`                                                        | 0                                                      | ✓        |
| Membrii `commercial_rw`                                                                               | `app_runtime` (și `postgres`, creatorul rolului)       | ✓        |
| Membrii `commercial_founder`                                                                          | `founder_runtime` (și `postgres`)                      | ✓        |
| `has_function_privilege('founder_runtime', 'commercial.founder_list_forever_discounts()', 'EXECUTE')` | true                                                   | ✓        |
| Ca `app_runtime` (pooler), `SET LOCAL ROLE commercial_rw`: abonamente fără context                    | 0; registrul (`application`) = 16                      | ✓        |
| Ca `app_runtime` + `commercial_rw`: `UPDATE commercial.quota_key …`                                   | refuzat: `42501 permission denied for table quota_key` | ✓        |

Verificările ca `app_runtime` au rulat într-o tranzacție încheiată cu `ROLLBACK`.

## De știut

- **Rolurile au și membrul `postgres`.** Pe Supabase, `postgres` nu e superuser, iar PostgreSQL 16+ îl face automat membru al rolurilor pe care le creează. E inofensiv: `postgres` e conexiunea de administrare.
- **Aplicațiile cumpărabile, după deploy-ul aplicațiilor din `main`.** Ele cer acum `commercialEntitlementProvider`. Fără abonamente pe staging, orice aplicație cumpărabilă (de exemplu `booking`) dă `AppNotEnabled`; Hub-ul (`platform`) nu e afectat.
  - Abonamentele se creează din Founder după D3-1 (prețurile reale), sau cu date de test marcate ca atare, cu acordul fondatoarei.
  - Nimic nu a fost creat acum.
- **Revenirea** se aprobă separat (rapoartele 3.1 și 3.2). Nu există date comerciale de păstrat.
