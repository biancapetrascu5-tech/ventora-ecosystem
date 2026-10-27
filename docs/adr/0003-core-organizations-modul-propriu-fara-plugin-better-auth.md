# ADR 0003 — core/organizations: modul propriu în loc de plugin-ul Better Auth

**Status:** CONFIRMAT
**Data:** 2026-10-27
**Aprobat de:** fondatoare
**Referință:** docs/ARCHITECTURE.md §7.1 (D-AUTH-5), §7.4, §7.5, §12.3 (D-SEC-1)

---

## Context

D-AUTH-5 (CONFIRMAT 25.10.2026) includea plugin-ul oficial Better Auth pentru organizații ca parte din configurația validată. La proiectarea Lot 2.2 au apărut cinci cerințe care nu pot fi satisfăcute de plugin fără workaround-uri invazive:

1. **RLS cu `app.organization_id` (D-SEC-1):** politicile Postgres cer ca `organization_id` să fie setat cu `set_config(..., true)` local tranzacției, înainte de orice query. Plugin-ul Better Auth nu trece prin stratul nostru de tranzacții și nu poate seta contextul RLS.
2. **Roluri pe aplicație (`ApplicationAccess`):** schema noastră are Membership × application × role, un tabel separat de `Membership`. Plugin-ul modelează roluri plate, fără dimensiunea aplicației.
3. **`createdVia: founder | self_service | import`:** câmp de audit necesar pentru a distinge organizațiile create de Founder de cele self-service (Model B) și importate. Plugin-ul nu are câmpuri custom pe `Organization` fără patch.
4. **Crearea organizației exclusiv de Founder:** `createOrganization` trebuie să verifice `actor === 'founder'` și să stocheze `createdByFounderId`. Plugin-ul presupune că utilizatorul curent devine Owner, ceea ce e incompatibil cu fluxul nostru.
5. **Schema separată (`organizations`):** modelul nostru de izolare (câte o schemă Postgres pe modul, rol NOLOGIN propriu, migrații proprii) e incompatibil cu schema `better_auth` sau `public` pe care o presupune plugin-ul.

---

## Decizie

Nu folosim plugin-ul Better Auth pentru organizații. Implementăm `core/organizations` ca modul propriu, cu aceeași arhitectură ca `core/identity`: schema Postgres separată, client Prisma propriu, contract public, RLS din prima zi.

Din Better Auth păstrăm: sesiunile, email/parolă, 2FA, token sessions, rate limit. Câmpul `activeOrganizationId` se stochează în sesiunea Better Auth printr-un câmp custom, scris exclusiv prin `core/identity.setSessionActiveOrganization()`.

---

## Justificare

Modulul propriu satisface toate cele cinci cerințe fără workaround. Costul este codul de infrastructură în plus (schema, client, SECURITY DEFINER functions, contract), dar acesta urmează un pattern deja stabilit și testat în Lot 2.1.

Alternativa — patch-uri și override-uri peste plugin — ar fi creat o dependență de internele Better Auth care se rupe la upgrade.

---

## Alternativele evaluate

| Opțiune | Pro | Contra |
|---|---|---|
| **Modul propriu `core/organizations`** | RLS nativ, roluri pe aplicație, createdVia, createdByFounderId, schema separată, pattern deja validat | Mai mult cod de scris |
| Plugin Better Auth `organization` | Mai puțin cod inițial | Nu suportă RLS cu set_config, schema nu e izolată, roluri plate, crearea din Founder necesită patch |
| Plugin cu extensii custom | Reutilizează logica de bază | Depinde de internele pluginului; se rupe la upgrade; testarea RLS devine ambiguă |

---

## Consecințe

- D-AUTH-5 rămâne CONFIRMAT pentru componentele pe care le păstrăm (sesiuni, 2FA, rate limit, token sessions).
- Fraza „plugin-urile oficiale pentru organizații" din §7.1 se elimină la actualizarea ARCHITECTURE; `activeOrganizationId` în sesiune rămâne, implementat prin câmp custom Better Auth.
- `core/organizations` intră în harta modulelor (§5) ca modul de tip Core, alături de `identity`, `access`, `audit`.
