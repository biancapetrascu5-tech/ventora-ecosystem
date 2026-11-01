# Staging, 31.10.2026 seara: migrările 3.3, 2.9b și 4.3

**Regula 11.** Planurile sunt cele aprobate de fondatoare, din rapoartele 3.3 (`2026-10-31_1430_lot-3-3.md`), 2.9b (`2026-10-31_1631_lot-2-9b.md`) și 4.3 (`2026-10-31_lot-4-3-notifications.md`). Aplicarea s-a făcut:

- din `main` actualizat (`3a7d05a`, care conține #39, #42 și #43);
- cu `prisma migrate deploy` pe `DIRECT_URL` (session mode, utilizatorul `postgres`). URL-ul nu a fost afișat.

**Rezultat:** cele 4 migrări au fost aplicate. Toate verificările au trecut. Niciun raport nu cere sincronizarea registrului comercial, deci nu s-a rulat. Nu s-au creat sau șters date.

## 1. Înainte (doar citire)

| Verificare | Rezultat | Așteptat |
| --- | --- | --- |
| `_prisma_migrations` cu `finished_at IS NULL` sau `rolled_back_at` | 0 rânduri (21 de migrări aplicate) | ✓ |
| `to_regclass('commercial.usage_counter')`, `to_regclass('identity.user_preference')` | `NULL`, `NULL` | ✓ |
| Schema `notifications`, rolul `notifications_rw` | nu există (le creează migrarea) | ✓ |
| `organizations.list_my_memberships_v3()`, `identity.founder_get_user_contact_v2(text)` | nu există | ✓ |
| Rolurile `app_runtime`, `founder_runtime`, `commercial_rw`, `org_rw`, `identity_rw` | există | ✓ |
| `prisma migrate status`: founder, access, audit | „Database schema is up to date!” | ✓ |
| `prisma migrate status`: identity | în așteptare exact `20261101000007_user_preference` | ✓ |
| `prisma migrate status`: organizations | în așteptare exact `20261101000001_lot29b_memberships_v3` | ✓ |
| `prisma migrate status`: commercial | în așteptare exact `20261101000006_commercial_usage` | ✓ |
| `prisma migrate status`: notifications | în așteptare exact `20261101000008_notifications_init` | ✓ |

La modulele cu o migrare în așteptare, `migrate status` listează și migrările celorlalte module ca „not found locally”. Toate modulele folosesc același tabel `public._prisma_migrations`; la fel a fost și la aplicarea comercială. Nu e drift.

## 2. Migrarea

Ordinea: commercial, organizations, identity, notifications. Fiecare e aditivă, iar `notifications_init` nu depinde de celelalte.

```
### commercial — prisma migrate deploy --config prisma7.config.ts
Applying migration `20261101000006_commercial_usage`
All migrations have been successfully applied.   EXIT: 0
### organizations — prisma migrate deploy --config prisma7.config.ts
Applying migration `20261101000001_lot29b_memberships_v3`
All migrations have been successfully applied.   EXIT: 0
### identity — prisma migrate deploy --schema prisma/identity/schema.prisma --config prisma7.config.ts
Applying migration `20261101000007_user_preference`
All migrations have been successfully applied.   EXIT: 0
### notifications — prisma migrate deploy --config prisma7.config.ts
Applying migration `20261101000008_notifications_init`
All migrations have been successfully applied.   EXIT: 0
```

## 3. După

| Verificare | Rezultat | Așteptat |
| --- | --- | --- |
| `prisma migrate status`, toate cele 7 scheme | „Database schema is up to date!” | ✓ |
| `_prisma_migrations` | 25, niciuna neterminată sau `rolled_back` | ✓ |
| Tabelele noi | `commercial.usage_counter`, `quota_reservation`, `usage_event`; `identity.user_preference`; `notifications.notification`, `delivery`, `notification_preference` | ✓ |
| `relrowsecurity` pe cele trei tabele `notifications` | true | ✓ |
| `has_function_privilege('notifications_rw', 'notifications.pending_deliveries(integer)', 'EXECUTE')` | true | ✓ |
| `has_table_privilege('notifications_rw', 'notifications.notification', 'DELETE')` | false | ✓ |
| `has_function_privilege('founder_runtime', 'identity.founder_get_user_contact_v2(text)', 'EXECUTE')` | true | ✓ |
| `has_function_privilege('org_rw', 'organizations.list_my_memberships_v3()', 'EXECUTE')` | true | ✓ |
| `notifications_rw` | `NOLOGIN NOINHERIT`; membri: `app_runtime` (și `postgres`, creatorul rolului) | ✓ |
| Ca `app_runtime` + `commercial_rw`: `count(*) FROM commercial.usage_counter` | 0 | ✓ |
| Ca `app_runtime` + `commercial_rw`: `expired_quota_reservations(now(), 10)` | nimic | ✓ |
| Ca `app_runtime` + `notifications_rw`: notificări / `pending_deliveries(10)` | 0 / 0 | ✓ |
| Ca `app_runtime` + `notifications_rw`: `DELETE FROM notifications.notification` | refuzat: `42501 permission denied for table notification` | ✓ |
| Ca `app_runtime` + `identity_rw`: `count(*) FROM identity.user_preference` | 0 | ✓ |

Verificările ca `app_runtime` au rulat pe pooler, într-o tranzacție încheiată cu `ROLLBACK`.

## De știut

- **Deploy-ul aplicațiilor vine după migrări** (toate cele trei rapoarte). Codul din `main` cheamă `list_my_memberships_v3`, `founder_get_user_contact_v2` și schema `notifications`; migrările sunt acum pe staging.
- **`booking` consumă cota (3.3).** Fără abonament cu `booking.appointments`, crearea unei programări dă `QuotaExceeded`. Pe staging nu rulează încă un ecran `booking`.
- **Job-ul de livrare (4.3)** rulează pe staging doar după ce Inngest e configurat acolo (Lotul 3.9 / 4.11). Până atunci, notificările se scriu, dar nu pleacă e-mailuri.
- **Verificarea din Hub pentru 2.9b** (un utilizator dintr-o afacere suspendată ajunge pe `/business-suspended`) se poate face doar după deploy-ul aplicației. NEFĂCUT.
- **Revenirea** se aprobă separat. Toate tabelele noi sunt goale.
