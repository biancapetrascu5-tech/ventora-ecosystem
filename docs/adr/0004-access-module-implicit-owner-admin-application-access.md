# ADR 0004 — Rolurile owner și admin au acces implicit la toate aplicațiile

**Status:** CONFIRMAT
**Data:** 2026-10-27
**Aprobat de:** fondatori
**Referință:** docs/ARCHITECTURE.md §4, §7.5

---

## Context

`authorize()` din `core/access` verifică la pasul 4 dacă utilizatorul are acces la aplicația cerută.
Inițial s-a considerat că toți utilizatorii au nevoie de un rând explicit în `access.application_access`.
Dar `owner` și `admin` administrează organizația în întregime — a-i forța să aibă rânduri în `application_access`
ar genera boilerplate la fiecare creare de organizație și ar îngreuna fluxul de invitare.

Când un `owner` sau `admin` este suspendat sau eliminat, rândul din `application_access` rămâne,
dar `authorize()` eșuează la pasul 2 (membership activ), deci rândul orfan nu creează suprafață de atac.
Curățarea se face prin outbox F4, documentat separat.

## Decizie

Rolurile `owner` și `admin` au acces IMPLICIT la toate aplicațiile — nu se creează și nu se verifică
niciun rând în `access.application_access` pentru aceste roluri.

Verificarea explicită a tabelului `application_access` se aplică **doar** rolurilor:
- `member`
- `external_collaborator`
- `application_manager` (care verifică în plus `role_in_app` din propriul câmp)

## Justificare

- Elimină boilerplate la creare organizație și la acceptarea invitațiilor pentru roluri privilegiate.
- `owner` și `admin` au deja acces nelimitat în ARCHITECTURE §7.5 — un check pe DB ar fi redundant.
- Riscul de escaladare e zero: accesul implicit se acordă DOAR pe baza rolului din membership, verificat la pasul 2.

## Alternativele evaluate

| Opțiune | Argumente pro | Argumente contra |
|---|---|---|
| **Acces implicit pentru owner/admin (ales)** | Simplu, zero boilerplate, consistent cu semantica rolului | Rânduri orfane la suspendare/eliminare (fără efect datorită pasului 2) |
| Rând explicit pentru toți | Uniformitate în DB | Boilerplate, risc de inconsistență la creare org |

## Consecințe

- `grantApplicationAccess` în `@ventora/access` NU este apelat pentru `owner`/`admin`.
- `authorize()` pasul 4 sare direct la rezultat pozitiv dacă `role === 'owner' || role === 'admin'`.
- Rândurile orfane din `application_access` (utilizatori suspendați/eliminați) nu necesită curățare urgentă;
  `authorize()` le ignoră. Curățare via outbox F4.

## Referințe

- `docs/ARCHITECTURE.md` §4, §7.5
- ADR 0005 — permisiunile se sincronizează la deploy
