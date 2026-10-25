# FAZA 2 — Identitate și acces

**Status:** PROPUS — așteaptă aprobarea explicită. Nimic nu se implementează înainte de aprobare.
**Referințe:** `ARCHITECTURE.md` v0.4.0 (§7, §15.1), `docs/experiments/E9.md`, `docs/plans/FAZA-0.md` (ÎNCHIS)
**Depinde de:** Faza 0 (ÎNCHIS ✅)
**Acceptare globală:** T1, T2, T3 verzi pe modul de probă; revocare și retrogradare testate în CI.

---

## 1. Ce NU intră în Faza 2

- Nicio funcționalitate de produs (Booking, CRM etc.) — vin după F2.
- Sistemul comercial (planuri, cote, entitlements) — Faza 3.
- Notificări, suport, AI, fișiere — Faza 4.
- Design system în cod (`packages/ui`, `packages/tokens`) — Faza 1, paralelă.
- Self-service signup (Model B) — neactivat, nepregătit UI. Structura de date îl permite, dar ecranele nu se construiesc (D-COM-4 necesită decizie).
- Identitatea B2C (Portal / consumatori) — separată, după F5.

---

## 2. Loturile

### Lot 2.1 — Better Auth + sesiuni de bază

**Scop:** Better Auth instalat în monorepo (nu în labs), schema `core.identity` cu migrații versionarate, autentificare cu email/parolă funcțională.

**Livrabile:**

- `core/identity` cu schema Prisma: `User`, `AuthIdentity`, `Session`, `UserPreference`, `TwoFactorFactor`, `TwoFactorRecoveryCode`.
- Migrații versionarate în `core/identity/db/migrations/`. Prima migrație: curată, aplicabilă pe bază goală.
- Better Auth configurat în `packages/config` sau `core/identity/src/auth.ts`:
  - adapter Prisma pentru `core/identity`;
  - cache de sesiune din cookie **dezactivat** (CONFIRMAT, E9 — altfel revocare și retrogradare întârzie);
  - scrypt ca algoritm de parolă (CONFIRMAT, fără pachete compilate);
  - plugin token sessions pentru clienți non-browser (aplicația mobilă viitoare);
  - rate limiting activ în producție, dezactivat în teste.
- Contract public `core/identity/src/contract`:
  - `getSession(ctx): Session | null`
  - `revokeSession(ctx, sessionId): void`
  - `getUserById(ctx, userId): User | null`
- Rute Better Auth montate în `apps/platform` și `apps/founder`.

**Criterii de acceptare:**

- [ ] `pnpm --filter @ventora/identity test` trece (unit).
- [ ] T1.1 — revocare sesiune: sesiunea revocată → request următor returnează 401 (fără să aștepte expirarea).
- [ ] T1.2 — retrogradare rol: rol modificat în DB → request următor reflectă noul rol.
- [ ] T1.3 — sesiune token (non-browser): autentificare cu token, request valid, revocare, request respins.
- [ ] CI verde: migrație aplicată pe bază curată.

---

### Lot 2.2 — Organizații, Membership, Invitații (Model A)

**Scop:** Core organizations cu Model A (Founder-managed): Founder creează organizația, invită Owner-ul; Owner-ul invită membrii.

**Livrabile:**

- `core/organizations` cu schema Prisma: `Organization`, `Membership`, `Invitation`, `OrganizationSetting`.
  - `Organization.createdVia`: `founder | self_service | import` (structura permite Model B fără schimbare de schemă).
  - `Membership.status`: `active | suspended | left`.
  - `Invitation`: token de unică folosință stocat ca **hash** (nu plain), expirare implicită 7 zile (configurabilă), stări `pending | accepted | expired | revoked`.
- `createOrganization(ctx)` — apelabil doar din Founder (verificare `actor: 'founder'`).
- Fluxul de invitare:
  - Founder invită Owner-ul → email cu link semnat.
  - Owner invită membri → rol + acces la aplicații setate la invitație.
  - Email existent în sistem → membership nou în organizație, **nu** cont nou.
  - Accept → parola setată (dacă cont nou) → redirect la aplicația principală a rolului.
- Invitațiile expirate dispar din lista echipei după 30 de zile (P6 CONFIRMAT), rămân în audit.
- „Retrimite" vizibil pe invitațiile expirate.
- Contract public `core/organizations/src/contract`:
  - `getOrganization(ctx, id): Organization | null`
  - `getMembership(ctx, userId, orgId): Membership | null`
  - `listMembers(ctx): Membership[]`
  - `inviteMember(ctx, params): Invitation`
  - `revokeInvitation(ctx, invitationId): void`

**Organizația activă în sesiune:**

- Stocată în sesiunea Better Auth pe server — nu în URL, localStorage sau câmpuri din request (ARCHITECTURE §7.4).
- `setActiveOrganization(ctx, orgId)` — acțiune server care verifică membership-ul activ înainte de schimbare.
- Un `organizationId` trimis în body/query nu are niciun efect asupra contextului.

**Criterii de acceptare:**

- [ ] T2.1 — organizația din sesiune nu poate accesa datele altei organizații: fiecare query cu RLS returnează 0 rânduri pentru date din org-B când sesiunea e pe org-A.
- [ ] T2.2 — `setActiveOrganization` cu org la care utilizatorul nu e membru → `NotMember`.
- [ ] T2.3 — invitație acceptată de un utilizator din altă organizație → membership creat în organizația corectă, nu în cea activă a invitatului.
- [ ] T2.4 — invitație expirată → `TokenExpired`, nu `Forbidden`.
- [ ] T2.5 — email existent invitat → membership nou, nu duplicat de cont.
- [ ] CI verde: migrații `core/organizations` pe bază curată după `core/identity`.

---

### Lot 2.3 — `authorize()` cu erori tipizate și roluri de sistem

**Scop:** `core/access` cu `authorize()`, roluri, permisiuni pe manifest, ApplicationAccess. Erori tipizate în toate contractele.

**Livrabile:**

- `core/access` cu schema Prisma: `Role`, `Permission`, `RoleAssignment`, `ApplicationAccess`, `ResourceAccessPolicy`.
- **Roluri de sistem** (ARCHITECTURE §7.5):
  - `owner` — poate plăti și schimba accesul celorlalți; 2FA obligatoriu (Lot 2.4).
  - `admin` — administrare completă, fără facturare.
  - `member` — acces la aplicațiile setate de admin.
  - `external_collaborator` — acces limitat, fără setări organizație.
  - `application_manager` — gestionare utilizatori pentru o aplicație specifică.
- Permisiunile declarate în `manifest.ts` al fiecărui modul; înregistrate în Core la activarea aplicației.
- `authorize(params): TenantContext` — verifică în ordine:
  1. sesiune validă (`NotAuthenticated`);
  2. membership activ în organizația activă (`NotMember`);
  3. aplicația activă (entitlement de bază, `AppNotEnabled`);
  4. permisiunea rolului (`Forbidden`);
  5. dacă e dată resursa: apartenența la organizație + politica pe resursă (`ResourceNotFound`).
- Accesul la o resursă din altă organizație → `ResourceNotFound` (nu `Forbidden`) — nu dezvăluie existența.
- Erori exportate din `packages/errors`: `NotAuthenticated`, `NotMember`, `AppNotEnabled`, `Forbidden`, `ResourceNotFound`.
- Rolurile personalizate: schema le permite (`Role.isSystem: false`), dar UI-ul nu se construiește (D-ACC-2 necesită decizie).

**Criterii de acceptare:**

- [ ] T3.1 — request fără sesiune → `NotAuthenticated`.
- [ ] T3.2 — utilizator activ fără membership în org activă → `NotMember`.
- [ ] T3.3 — org activă fără aplicația cerută activată → `AppNotEnabled`.
- [ ] T3.4 — utilizator cu rol `member` fără permisiunea cerută → `Forbidden`.
- [ ] T3.5 — resursă aparținând altei organizații → `ResourceNotFound` (nu `Forbidden`).
- [ ] T3.6 — `actor: 'support'` în contextul sesiunii de suport (Lot 2.5) — permisiunile de suport respectate.
- [ ] Toate erorile tipizate au cod de status HTTP corect în route handlere.
- [ ] CI verde pe modul de probă (`modules/booking` sau echivalent) cu `authorize()` în fiecare contract public.

---

### Lot 2.4 — 2FA obligatoriu pentru Owner (D-AUTH-3)

**Scop:** 2FA TOTP opțional pentru utilizatori, obligatoriu pentru Owner, cu grație 14 zile și coduri de recuperare.

**Livrabile:**

- Plugin 2FA Better Auth activat: TOTP + coduri de recuperare de unică folosință.
  - Coduri de recuperare stocate ca **hash** (nu plain), regenerabile.
  - Regenerarea codurilor → eveniment audit.
- **Grație 14 zile pentru Owner** (P5 CONFIRMAT):
  - La primirea rolului de Owner: `twoFactorGracePeriodEndsAt = now() + 14 zile`.
  - Până la expirare: Notice neutru persistent (fără blocare).
  - După expirare: acțiunile cu permisiuni de Owner cer `twoFactorVerified: true` în sesiune — altfel `TwoFactorRequired` (eroare tipizată).
  - Pierderea dispozitivului fără coduri: rezolvabilă **doar** prin sesiune de suport Founder (Lot 2.5), auditată.
- Codul 2FA cerut pe dispozitiv nou (D10 microcopy CONFIRMAT).
- „Ține-mă minte 30 zile" pe dispozitivul ales (P1 CONFIRMAT), revocabil din Securitate.
- Founder (aplicația): 2FA obligatoriu fără grație (restricție de platformă, nu de organizație).

**Criterii de acceptare:**

- [ ] T1.4 — Owner în grație: acțiunile Owner funcționează, Notice vizibil.
- [ ] T1.5 — Owner după grație fără 2FA activ: acțiunile Owner → `TwoFactorRequired`.
- [ ] T1.6 — cod de recuperare folosit → marcat ca utilizat, inutilizabil din nou.
- [ ] T1.7 — regenerare coduri → codurile vechi invalide, cele noi valide, eveniment în audit.
- [ ] T1.8 — Founder fără 2FA: login blocată (nu grație).

---

### Lot 2.5 — Audit + sesiunea de suport Founder

**Scop:** `core/audit` cu jurnalul unic, sesiunea de suport cu `actor: 'support'` și vizibilitate pentru organizație.

**Livrabile:**

- `core/audit` cu schema: `AuditLog { id, organizationId, userId, actor, action, resourceType, resourceId, metadata, createdAt }`.
  - Categorii: `identity | access | organization | support | commercial`.
  - Toate acțiunile din Loturi 2.1–2.4 auditabile: login, logout, revocare sesiune, schimbare organizație activă, accept invitație, revocare invitație, schimbare rol, activare/dezactivare 2FA, regenerare coduri, deschidere/închidere sesiune suport.
- `writeAuditLog(ctx, params): void` — apelat din fiecare contract care modifică stare. Eșecul auditului nu blochează operația principală (best-effort), dar îl înregistrează în logger.
- **Sesiunea de suport Founder** (ARCHITECTURE §7.5):
  - Deschisă de un utilizator Founder cu: organizație țintă, motiv, durată (max 4h, implicită 1h).
  - Creează o sesiune cu `actor: 'support'` și `supportedOrganizationId`.
  - Vizibilă organizației în panoul Securitate: „Sesiune de suport activă — [fondator], [durată]".
  - La expirare sau la închidere manuală: sesiunea invalidată automat.
  - Toate acțiunile `actor: 'support'` sunt auditate cu `organizationId` al organizației suportate.
  - Utilizată pentru recuperarea accesului Owner care a pierdut dispozitivul 2FA și codurile (Lot 2.4).
- Contract public `core/audit/src/contract`:
  - `listAuditLogs(ctx, filters): AuditLog[]`
  - `openSupportSession(ctx, params): SupportSession`
  - `closeSupportSession(ctx, sessionId): void`

**Criterii de acceptare:**

- [ ] T3.7 — fiecare acțiune din Loturi 2.1–2.4 produce cel puțin o înregistrare în `audit_logs`.
- [ ] T3.8 — sesiune de suport: acțiunile cu `actor: 'support'` au `organizationId` corect, nu cel al Founder-ului.
- [ ] T3.9 — sesiunea de suport expirată → `NotAuthenticated` la request următor.
- [ ] T3.10 — organizația vede sesiunile de suport active; organizația NU vede jurnalul complet al Founder-ului.
- [ ] `listAuditLogs` returnează doar jurnalul organizației active (RLS sau filtru explicit în contract).

---

## 3. Criteriile de ieșire din Faza 2

Faza 2 se închide doar când:

1. Migrațiile `core/identity` + `core/organizations` + `core/access` + `core/audit` se aplică pe bază curată fără erori.
2. T1 (sesiuni): T1.1–T1.8 verzi în CI.
3. T2 (organizații): T2.1–T2.5 verzi în CI.
4. T3 (autorizare + audit): T3.1–T3.10 verzi în CI.
5. Revocare sesiune și retrogradare rol testate end-to-end (Lot 2.1).
6. `authorize()` integrat în contractele modulului de probă (`modules/booking` sau echivalent) și testat.
7. Sesiunea de suport Founder funcțională și auditată (Lot 2.5).
8. CI verde pe toate joburile (lint, typecheck, format, unit, integration, guards, build).

---

## 4. Riscuri specifice Fazei 2

| Risc | Ce facem dacă se întâmplă |
|---|---|
| Better Auth nu suportă un comportament necesar (ex. grația 2FA per rol) | Extindem prin middleware propriu deasupra Better Auth; nu înlocuim librăria fără aprobare fondatori |
| Migrațiile `core/identity` intră în conflict cu schema Better Auth | Better Auth cu adapter Prisma folosește tabelele noastre: schema e a noastră, nu a librăriei. Conflictul apare dacă redenumim câmpuri pe care librăria le citește hardcodat — documentăm în CLAUDE.md |
| Performanța `authorize()` per request | Permisiunile se citesc din DB cu cache pe durata request-ului (nu între request-uri). Dacă p95 > 20ms, se adaugă cache Redis cu TTL scurt (NECESITĂ DECIZIE) |
| Sesiunea de suport creează o suprafață de atac | Audit complet + durată maximă + vizibilitate pentru organizație + acces strict la Founder cu 2FA activ |

---

## 5. Ordinea implementării și dependențe

```
Lot 2.1 (sesiuni) ──► Lot 2.2 (organizații) ──► Lot 2.3 (authorize) ──► Lot 2.5 (audit)
                                                          │
                                                    Lot 2.4 (2FA) ────────────────────────►
```

- Lot 2.2 depinde de Lot 2.1 (sesiunea trebuie să existe pentru a stoca `activeOrganizationId`).
- Lot 2.3 depinde de Lot 2.2 (membership-ul trebuie să existe pentru authorize).
- Lot 2.4 poate merge în paralel cu 2.3 după finalizarea 2.1.
- Lot 2.5 (audit) poate începe în paralel cu orice lot dar se finalizează la urmă.

---

## 6. Ce se pregătește acum pentru fazele ulterioare

- Schema `Organization` include `createdVia` și `planId` (null până la F3) — Model B posibil fără migrație.
- `Membership` include `applicationAccess: string[]` — entitlements per utilizator, citit de F3.
- `authorize()` acceptă `actor: 'system'` pentru job-urile interne (F4).
- `AuditLog` include `metadata: jsonb` fără schemă fixă — F3 și F4 adaugă câmpuri fără migrație.
