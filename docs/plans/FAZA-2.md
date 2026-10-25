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
- Identitatea B2C (Portal / consumatori, ARCHITECTURE §7.6) — separată, din Faza 5. Structurile din Faza 2 nu blochează adăugarea ei ulterior.
- Ecranele de autentificare (HubSignIn, HubInvite, HubAccount) — se construiesc după ce Faza 1 livrează direcția vizuală. Faza 2 livrează infrastructura: contracte, migrații, API, teste.

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
  - rate limiting activ în producție (D-AUTH-5, validat în E9 pe Supabase staging), dezactivat în teste.
- Cookie-uri de sesiune cu prefix `__Host-` (D-INF-1): valide doar pe subdomeniul exact, fără atribut `Domain`. Compatibil cu URL-urile Vercel actuale și cu subdomeniile proprii după configurarea DNS (D-INF-3).
- Contract public `core/identity/src/contract`:
  - `getSession(ctx): Session | null`
  - `revokeSession(ctx, sessionId): void`
  - `revokeAllSessions(ctx, userId): void`
  - `getUserById(ctx, userId): User | null`
  - `listActiveSessions(ctx): Session[]` — sesiunile active ale utilizatorului curent; include dispozitiv (user-agent), IP, data ultimei activități.
- Lista sesiunilor/dispozitivelor active: vizibilă în pagina de Securitate a utilizatorului; fiecare sesiune are buton de revocare individuală. UI construit în Faza 2 dacă Faza 1 a livrat componentele de bază, altfel după Faza 1.
- „Ține-mă minte 30 zile" (P1 CONFIRMAT): infrastructura în Lot 2.1 (sesiune cu durată extinsă per dispozitiv de încredere); fluxul complet și UI în Lot 2.4.
- Rute Better Auth montate în `apps/platform` și `apps/founder`.

**Criterii de acceptare:**

- [ ] `pnpm --filter @ventora/identity test` trece (unit).
- [ ] T1.1 — revocare sesiune: sesiunea revocată → request următor returnează 401 (fără să aștepte expirarea).
- [ ] T1.2 — retrogradare rol: rol modificat în DB → request următor reflectă noul rol.
- [ ] T1.3 — sesiune token (non-browser): autentificare cu token, request valid, revocare, request respins.
- [ ] T1.9 — lista sesiunilor active returnează exact sesiunile deschise; nicio sesiune revocată nu apare.
- [ ] T1.10 — revocare individuală: sesiunea revocată → 401 la request următor; celelalte sesiuni ale aceluiași utilizator rămân valide.
- [ ] T1.11 — cookie-ul de sesiune are prefix `__Host-` și nu are atribut `Domain`.
- [ ] CI verde: migrație aplicată pe bază curată.

---

### Lot 2.2 — Organizații, Membership, Invitații (Model A)

**Scop:** Core organizations cu Model A (Founder-managed): Founder creează organizația, invită Owner-ul; Owner-ul invită membrii.

**Livrabile:**

- `core/organizations` cu schema Prisma: `Organization`, `Membership`, `Invitation`, `OrganizationSetting`, `PlatformSetting`.
  - `Organization.createdVia`: `founder | self_service | import` (structura permite Model B fără schimbare de schemă).
  - `PlatformSetting { key: String, value: Json }` — câmpuri utilizate în Faza 2:
    - `signup.b2b`: `Boolean @default(false)` — activat de Founder din app-ul de administrare; dezactivat implicit (Model B neactivat).
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

**Dependență: furnizor email pentru invitații**

Invitațiile se trimit prin emailul tranzacțional Ventora. Lot 2.2 depinde de:

- `core/notifications` cu interfață `EmailAdapter` și implementare `ResendAdapter`.
- Domeniu de trimitere: `mail.ventora-hub.com` (SPF, DKIM, DMARC — configurate la activarea domeniului în Resend).
- Furnizor ales: **Resend**, regiunea `eu-west-1` (emailuri rutate din Irlanda).
- **Notă de conformitate:** indiferent de regiunea de trimitere, datele contului și log-urile de email rămân stocate în SUA (stocare primară Resend în `us-east-1`). Transferul EU→SUA e acoperit de DPA Article 28 pre-semnat + SCCs (Module 2 pentru controller, Module 3 pentru processor) + EU-US Data Privacy Framework. Validarea juridică se face împreună cu D-SMS-7 și D-GRW-8 — invitațiile nu se trimit înainte ca domeniul și DPA să fie validate.

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
- Codul 2FA cerut pe dispozitiv nou (D10 CONFIRMAT): un dispozitiv care nu are „Ține-mă minte" activ trebuie să introducă codul 2FA la fiecare login.
- „Ține-mă minte 30 zile" pe dispozitivul ales (P1 CONFIRMAT): infrastructura în Lot 2.1; UI în Lot 2.4 — vizibil în pagina de Securitate, revocabil individual din lista sesiunilor.
- **Founder app — autentificare separată:**
  - 2FA obligatoriu fără perioadă de grație (restricție de platformă, independentă de rolurile org).
  - Sesiunile din `apps/founder` nu au `activeOrganizationId`; autorizarea nu trece prin `authorize()` din Lot 2.3.
  - Rute Better Auth montate separat în `apps/founder` (endpoint diferit de `apps/platform`).
  - Login blocat dacă 2FA nu e activat — fără redirect la organizație, fără grație.

**Criterii de acceptare:**

- [ ] T1.4 — Owner în grație: acțiunile Owner funcționează, Notice vizibil.
- [ ] T1.5 — Owner după grație fără 2FA activ: acțiunile Owner → `TwoFactorRequired`.
- [ ] T1.6 — cod de recuperare folosit → marcat ca utilizat, inutilizabil din nou.
- [ ] T1.7 — regenerare coduri → codurile vechi invalide, cele noi valide, eveniment în audit.
- [ ] T1.8 — Founder fără 2FA: login blocată (nu grație).
- [ ] T1.12 — dispozitiv nou fără „Ține-mă minte": cod 2FA cerut la fiecare login (D10).

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
2. T1 (sesiuni): T1.1–T1.12 verzi în CI.
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
| Resend stochează date în SUA, nu în EU | Acoperit de DPA Article 28 pre-semnat + SCCs + EU-US DPF. Validare juridică înainte de prima trimitere, alături de D-SMS-7 și D-GRW-8. |

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

**Principiul de ordine:** logică → API → teste, **apoi** ecrane. HubSignIn, HubInvite și HubAccount nu se construiesc în Faza 2 — depind de direcția vizuală din Faza 1 (`packages/ui`, `packages/tokens`). Faza 2 livrează numai infrastructura: contracte, migrații, rute API, teste.

---

## 6. Ce se pregătește acum pentru fazele ulterioare

- Schema `Organization` include `createdVia` și `planId` (null până la F3) — Model B posibil fără migrație.
- `PlatformSetting` include `signup.b2b` (dezactivat implicit) — Model B activabil fără migrație de schemă.
- `Membership` include `applicationAccess: string[]` — entitlements per utilizator, citit de F3.
- `authorize()` acceptă `actor: 'system'` pentru job-urile interne (F4).
- `AuditLog` include `metadata: jsonb` fără schemă fixă — F3 și F4 adaugă câmpuri fără migrație.

---

## 7. Staging: configurare și curățare

### 7.1 URL-uri de acces

Staging pe Vercel (proiect `ventora-lab-e4`). URL-urile actuale sunt generate automat de Vercel. Subdomeniile proprii (`platform.ventora-hub.com`, `founder.ventora-hub.com`) se configurează după ce DNS-ul e pregătit — D-INF-3 (NECESITĂ DECIZIE).

### 7.2 Curățare lab_* înainte de prima migrație

Înainte de prima migrație a Fazei 2 pe Supabase staging, schemele și rolurile create de experimente (E2–E5) trebuie șterse. **Comenzile de mai jos sunt o propunere — nu se rulează fără acordul explicit al fondatoarelor.**

```sql
-- Verificare înainte de ștergere (rulați mai întâi):
SELECT schema_name FROM information_schema.schemata
WHERE schema_name LIKE 'lab_%';

SELECT rolname FROM pg_roles
WHERE rolname LIKE 'lab_%';

-- Ștergere scheme (CASCADE include toate tabelele, vederile, funcțiile):
DROP SCHEMA IF EXISTS lab_core    CASCADE;
DROP SCHEMA IF EXISTS lab_booking CASCADE;
DROP SCHEMA IF EXISTS lab_crm     CASCADE;

-- Ștergere roluri de conectare:
DROP ROLE IF EXISTS lab_core_rw;
DROP ROLE IF EXISTS lab_booking_rw;
DROP ROLE IF EXISTS lab_crm_rw;

-- Verificare finală -- trebuie sa returneze 0 randuri:
SELECT schema_name FROM information_schema.schemata
WHERE schema_name LIKE 'lab_%';
```

> Rulați mai întâi interogările de verificare și confirmați numele exacte înainte de DROP — rolurile pot diferi față de cele de mai sus dacă experimentele au folosit convenții diferite.
