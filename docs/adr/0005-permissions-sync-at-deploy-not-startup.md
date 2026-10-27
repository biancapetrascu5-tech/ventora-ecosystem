# ADR 0005 — Permisiunile se sincronizează la deploy, nu la startup

**Status:** CONFIRMAT
**Data:** 2026-10-27
**Aprobat de:** fondatori
**Referință:** docs/ARCHITECTURE.md §4

---

## Context

Permisiunile declarate în `manifest.ts` al fiecărui modul (lista de acțiuni posibile cu `defaultGrants` per rol)
trebuie să ajungă în tabelele `access.permission` și `access.role_permission` din baza de date.

Există două momente naturale pentru această sincronizare:
1. La startup al aplicației (runtime)
2. La deploy, ca parte din procesul de migrare

Rolul `access_rw` (folosit la runtime) are doar `SELECT` pe tabelele `role`, `permission`, `role_permission` —
nu are `INSERT`, `UPDATE` sau `DELETE`. Sincronizarea la runtime ar necesita fie un rol mai permisiv,
fie un SECURITY DEFINER special, ambele lărgind suprafața de atac.

## Decizie

Sincronizarea permisiunilor se face **exclusiv la deploy** prin scriptul `scripts/sync-permissions.ts`,
care rulează cu rolul de migrație (conexiune directă via `DIRECT_URL`).

`access_rw` (rolul runtime) are **doar SELECT** pe `role`, `permission`, `role_permission`.

## Justificare

- Principiul minimului privilegiu: runtime-ul nu are nevoie să scrie în tabele de permisiuni.
- Permisiunile unui modul se schimbă doar când se schimbă codul — adică la deploy.
- Scriptul de sync rulează în același pas cu `prisma migrate deploy`, deci nu există fereastră
  în care DB-ul e migrat dar permisiunile nu sunt actualizate.
- Elimină un vector de atac: chiar dacă un request malițios ar ajunge la runtime,
  nu poate modifica permisiunile.

## Alternativele evaluate

| Opțiune | Argumente pro | Argumente contra |
|---|---|---|
| **Sync la deploy (ales)** | Minim privilegiu, atomic cu migrațiile, simplu | Necesită pas suplimentar în pipeline CI/CD |
| Sync la startup | Zero configurare pipeline | Necesită privilegii scrise la runtime, risc de race condition |
| Sync manual (UI) | Control total | Operațional costisitor, risc de desincronizare |

## Consecințe

- `scripts/sync-permissions.ts` devine parte obligatorie din procesul de deploy.
- `access_rw` rămâne cu SELECT-only pe tabelele de permisiuni.
- Adăugarea unui modul nou sau modificarea unui `manifest.ts` necesită re-deploy pentru ca permisiunile să fie active.
- CI rulează `scripts/sync-permissions.ts` în jobul de integrare pentru a valida că scriptul funcționează.

## Referințe

- `docs/ARCHITECTURE.md` §4
- ADR 0004 — acces implicit owner/admin
