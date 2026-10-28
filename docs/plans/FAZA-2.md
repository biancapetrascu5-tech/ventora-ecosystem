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
- Self-service signup (Model B) — neactivat, nepregătit UI. Structura de date îl permite (§7.2), dar ecranele nu se construiesc (D-COM-4 necesită decizie).
- Identitatea B2C (Portal / consumatori, §7.6) — separată; tabele proprii, sesiune proprie, cookie propriu pe domeniul Portal. Nu intră în F2; rămâne planificată ulterior (după F5).

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
  - **rate limiting activ în producție (D-AUTH-5)**: N încercări eșuate consecutiv → 429 cu `Retry-After`; dezactivat în teste (`NODE_ENV=test`).
- **„Ține-mă minte" 30 de zile (P1 CONFIRMAT):** opțiune la login → sesiune cu `rememberMe: true` și `Max-Age: 30 × 24 × 3600` în cookie. Revocabilă din lista de sesiuni. E doar durata sesiunii deja deschise: o intrare nouă cu parola cere în continuare codul 2FA (R-2F2).
- **Lista sesiunilor/dispozitivelor** (`/settings/security`): sesiunea curentă marcată; fiecare intrare cu IP, user-agent, ultima activitate. Revocare individuală + „Revocă toate celelalte". Logică și API livrate în F2; **ecranul se construiește după direcția vizuală F1** (§8).
- **Cod 2FA la fiecare intrare cu parola (R-2F2, 28.10.2026; înlocuiește D10):** dacă utilizatorul are 2FA activ, codul e cerut la fiecare login cu parola, pe orice dispozitiv. Fără „ține minte dispozitivul”: `trustDevice` e refuzat pe server.
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
- [ ] T1.9 — rate limiting (D-AUTH-5): N încercări consecutive eșuate → 429 cu `Retry-After`; în teste (`NODE_ENV=test`) rate limiting dezactivat.
- [ ] T1.10 — „ține-mă minte" 30 zile: sesiunea cu `rememberMe: true` rămâne validă la 29 de zile; sesiunea fără flag expiră la durata standard.
- [ ] T1.11 — lista de sesiuni: sesiunea revocată individual dispare imediat; celelalte sesiuni ale utilizatorului rămân valide.
- [ ] CI verde: migrație aplicată pe bază curată.

---

### Lot 2.2 — Organizații, Membership, Invitații (Model A)

**Scop:** Core organizations cu Model A (Founder-managed): Founder creează organizația, invită Owner-ul; Owner-ul invită membrii.

**Livrabile:**

- `core/organizations` cu schema Prisma: `Organization`, `Membership`, `Invitation`, `OrganizationSetting`.
  - `Organization.createdVia`: `founder | self_service | import` (structura permite Model B fără schimbare de schemă).
  - **`signup.b2b` în `OrganizationSetting` (setare globală de platformă, scrisă doar de Founder, ARCHITECTURE §7.2):**
    - `signup.b2b = invite_only | self_service` — implicit `invite_only` în F2.
    - `signup.b2b.checkout = disabled | enabled` — implicit `disabled` până la F3.
    - Setarea neactivată în F2; structura suportă Model B fără migrație ulterioară.
  - `Membership.status`: `active | suspended | left`.
  - `Invitation`: token de unică folosință stocat ca **hash** (nu plain), stări `pending | accepted | expired | revoked`. Valabilitate (S55, 28.10.2026): invitația unui membru 7 zile; invitația owner-ului creată din Founder 30 de zile, inclusiv la retrimitere.
- `createOrganization(ctx)` — apelabil doar din Founder (verificare `actor: 'founder'`).
- Fluxul de invitare:
  - Founder invită Owner-ul → email cu link semnat.
  - Owner invită membri → rol + acces la aplicații setate la invitație.
  - Email existent în sistem → membership nou în organizație, **nu** cont nou.
  - Accept → parola setată (dacă cont nou) → redirect la aplicația principală a rolului.
- **Trimiterea emailului de invitație — dependență externă (Resend, §11):** `inviteMember` apelează `core/notifications` (canal email, adaptor Resend EU, domeniu `ventora-hub.com`, decizia B-1 din 28.10.2026). Dacă furnizorul nu e configurat, operația reușește, emailul nu se trimite, eveniment de avertisment în audit (E26). SPF și DKIM sunt verificate pe `ventora-hub.com`; DMARC trebuie adăugat înainte de primul e-mail real.
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

### Lot 2.4 — 2FA obligatoriu pentru Owner (D-AUTH-3, R-2F1…R-2F9)

Împărțit pe 28.10.2026: **2.4a** = logica + testele; **2.4b** = ecranele 2FA (după exportul de design, cu AuthLayout ca componentă comună, R-2F9).

**Scop:** 2FA TOTP opțional pentru utilizatori, obligatoriu pentru Owner **fără perioadă de grație** (R-2F1), cu coduri de rezervă.

**Livrabile (2.4a):**

- Plugin 2FA Better Auth activat: TOTP + **coduri de rezervă** de unică folosință (R-2F3).
  - Coduri de rezervă stocate criptat (configurația Better Auth), regenerabile.
  - Regenerarea codurilor → eveniment audit.
- **Owner fără grație (R-2F1, înlocuiește P5):** owner-ul activează 2FA la prima intrare. Până atunci, `authorize()` refuză orice acțiune ca Owner cu `TwoFactorRequired` (eroare tipizată). Nu există comutator de oprire (`/two-factor/disable` dezactivat).
- **Cod la fiecare intrare cu parola (R-2F2, înlocuiește D10):** fără `trustDevice`.
- **Blocare (R-2F5):** 5 coduri greșite consecutive → cont blocat 15 minute.
- **Pierderea dispozitivului fără coduri (R-2F7):** fără resetare automată. Owner-ul scrie la `support@ventorasystems.com`, iar recuperarea se face din Founder (Lot 2.5c), separat de sesiunea de suport, după `docs/ops/PROCEDURA-RECUPERARE-OWNER.md`.
- „Ține-mă minte 30 zile" (P1 CONFIRMAT): doar durata sesiunii, implementată în Lot 2.1 și revocabilă din lista de sesiuni.

**Criterii de acceptare:**

- [ ] T1.4 — Owner fără 2FA activ: acțiunile Owner → `TwoFactorRequired` imediat (fără grație).
- [ ] T1.5 — Owner cu 2FA activ: login cu parola cere codul de fiecare dată; `trustDevice` refuzat.
- [ ] T1.6 — cod de rezervă folosit → marcat ca utilizat, inutilizabil din nou.
- [ ] T1.7 — regenerare coduri → codurile vechi invalide, cele noi valide, eveniment în audit.
- [ ] T1.8 — Founder fără 2FA: login blocată (nu grație).
- [ ] T1.8b — 5 coduri greșite → blocare 15 minute; a 6-a încercare → 429.

---

### Lot 2.5 — Audit + sesiunea de suport Founder + recuperarea owner-ului

Împărțit pe 28.10.2026: **2.5a** = jurnalul de audit; **2.5b** = corectura E6 + e-mailurile tranzacționale; **2.5c** = sesiunea de suport + recuperarea owner-ului. Deciziile: L2.5-D0…D18 (ARCHITECTURE §17.22); planul: `reports/2026-10-28_1205_plan-lot2-5.md`.

**Scop:** `core/audit` cu jurnalul unic, sesiunea de suport cu `actor: 'support'` și vizibilitate pentru organizație, recuperarea owner-ului fără resetare automată.

**Livrabile:**

- `core/audit` (L2.5-D1), schema `audit`, un singur tabel `audit_log`:
  - **coloane:** `category`, `action`, `outcome`, `actor_type`, `actor_id`, `founder_id`, `support_session_id`, `organization_id`, `target_*`, `ip`, `user_agent`, `request_id`, `metadata`;
  - **`created_at`** e ora bazei de date;
  - **imutabil:** fără UPDATE / DELETE / TRUNCATE pentru vreun rol, plus trigger-e;
  - **scriere:** doar prin `audit.append_event`.
  - Categorii: `identity | access | organization | support | founder | commercial` (`founder` adăugată prin L2.5-D3).
  - Toate acțiunile din Loturile 2.1–2.4 sunt auditabile. Excepție: schimbarea rolului unui membru, amânată prin L2.5-D8 (b).
- `writeAuditEvent(event, { mode })` (L2.5-D2):
  - `required` pentru suport, recuperare și acțiunile Founder: fără rândul de audit, operația eșuează;
  - `best_effort` pentru autentificare și pentru celelalte contracte: eșecul se loghează și nu blochează operația.
- **Sesiunea de suport Founder** (ARCHITECTURE §7.5, L2.5-D9…D12), în schema `access` (`access.support_session`):
  - Deschisă de un Founder cu 2FA activ, pentru: organizația țintă, motiv (minimum 10 caractere), referința cererii, durată (maximum 240 de minute, implicit 60).
  - Fără acord prealabil (L2.5-D10): activă imediat, vizibilă organizației, iar owner-ii primesc e-mail.
  - Contextul are `actor: 'support'`, organizația suportată, `founderId` și `supportSessionId`, fără impersonare. Se verifică la fiecare apel (`authorizeSupport`).
  - Doar citire (L2.5-D12): o listă explicită de permisiuni; orice altă permisiune → `Forbidden`, auditat.
  - Bannerul din Hub, pentru toți membrii: „Sesiune de suport activă — [nume Founder], până la [ora]”.
  - Owner-ul o poate închide (L2.5-D11). Mai poate fi închisă de Founder, se închide singură la expirare sau la revocarea Founder-ului. Accesul încetează la cererea următoare.
  - Toate acțiunile `actor: 'support'` sunt auditate cu `organization_id` al organizației suportate și cu `founder_id` și `support_session_id` în coloane proprii.
- **Recuperarea owner-ului** (R-2F7, L2.5-D13…D16), **separată** de sesiunea de suport (L2.5-D16):
  - cod TOTP proaspăt al Founder-ului (L2.5-D14);
  - implicit 2FA + parolă, cu linkul de resetare în e-mailul către owner (L2.5-D15);
  - o singură tranzacție: verificarea owner-ului, resetarea și rândul de audit;
  - verificarea identității după `docs/ops/PROCEDURA-RECUPERARE-OWNER.md` (L2.5-D13).
- Contracte publice:
  - `core/audit`: `writeAuditEvent`, `readOrganizationAuditLog`, `readAuditLogAsFounder`;
  - `core/access`: `listAuditLogs`, `openSupportSession`, `closeSupportSession`, `authorizeSupport`, `listActiveSupportSessions`, `getSupportSessionBanner`, `closeSupportSessionAsOwner`, `recoverOwnerAccess`.
- Ecranele (bannerele, formularul de recuperare) vin după F1; în 2.5 se livrează doar contractele și cheile i18n (L2.5-D18).
- **Cerință pentru ecranul de recuperare din Founder (28.10.2026):** odată cu ecranul, `recoverOwnerAccess` primește câmpul `verifications: ('a' | 'b' | 'c')[]`, validat pe server:
  - minimum două verificări;
  - (b) și (c) obligatorii când adresa contului e marcată compromisă;
  - lista se scrie în rândul de audit E40;
  - criteriu de acceptare pentru ecran: refuzul fiecărei combinații invalide, fără nicio schimbare în baza de date.

  Verificările sunt definite în `docs/ops/PROCEDURA-RECUPERARE-OWNER.md` §2.

**Criterii de acceptare:**

- [ ] T3.7 — fiecare acțiune din Loturi 2.1–2.4 produce cel puțin o înregistrare în `audit_logs`.
- [ ] T3.8 — sesiune de suport: acțiunile cu `actor: 'support'` au `organizationId` corect, nu cel al Founder-ului.
- [ ] T3.9 — sesiunea de suport expirată → `NotAuthenticated` la request următor.
- [ ] T3.10 — organizația vede sesiunile de suport active; organizația NU vede jurnalul complet al Founder-ului.
- [ ] `listAuditLogs` returnează doar jurnalul organizației active (RLS sau filtru explicit în contract).

---

### Autentificarea aplicației Founder

**Scop:** `apps/founder` are propriul flux de autentificare, complet separat de rolurile din organizații. Există mai mulți utilizatori Founder — fiecare cu cont individual și cu nume propriu. Niciun cont partajat.

**Model de date `FounderUser`:**

- `FounderUser { id, name, email, founderRole, isVentoraOwner, revokedAt, createdAt }`:
  - `founderRole: 'full' | 'support' | 'commercial'` — schema pregătită acum; **în F2 se folosește doar `full`**. Celelalte roluri nu au permisiuni definite în F2 și nu se activează.
  - `isVentoraOwner: Boolean` — un singur cont (proprietarul Ventora) cu drept exclusiv de a adăuga și elimina alți Founders. Contul proprietarului nu poate fi revocat de alți Founders.
  - `revokedAt: DateTime?` — prezent → accesul blocat imediat; ceilalți Founders neafectați.
- Sesiunile din `apps/founder` folosesc `FounderUser.id` ca subiect — distinct de `User.id` din Hub.

**Livrabile:**

- Better Auth configurat separat (config dedicat în `core/identity` sau `apps/founder`): rute de auth montate la `/auth/*`, cookie host-only pe `founder.ventora-hub.com` (URL Vercel pe staging, §9).
- **Conturi individuale cu nume:** fiecare Founder se autentifică cu propriile credențiale; fiecare are 2FA propriu și lista proprie de sesiuni/dispozitive.
- **2FA obligatoriu fără grație (restricție de platformă):** la primul login după activarea contului → redirect la configurare 2FA; autentificarea nu se completează fără TOTP activ. Nu există perioadă de grație, la fel ca pentru Owner-ul Hub (R-2F1).
- **Revocare cu efect imediat:** `revokedAt` setat → toate sesiunile Founder-ului respectiv invalide la request următor; ceilalți Founders neafectați.
- **Numai `isVentoraOwner: true` poate adăuga sau elimina un Founder** (`addFounderUser`, `revokeFounderUser` — verificare în contract).
- **Audit per persoană Founder:** fiecare acțiune din `apps/founder` (inclusiv deschiderea sesiunilor de suport) înregistrează id-ul Founder-ului în coloana `audit_log.founder_id`, ca să se știe exact cine a acționat.
- Accesul restricționabil la IP (ARCHITECTURE §3.1): middleware în `apps/founder`, configurabil prin `FOUNDER_ALLOWED_IPS` (variabilă de mediu; **absent = fără restricție, dezactivat implicit**).
- Sesiunea de suport (Lot 2.5) e deschisă dintr-o sesiune Founder autentificată cu 2FA verificat — `twoFactorVerified: true` obligatoriu. Sesiunea de suport înregistrează `founderId` al persoanei care a deschis-o.
- Sesiunea Founder nu se amestecă cu sesiunea Hub: cookie-uri separate, fără shared state (D-INF-1, §7).

**Criterii de acceptare:**

- [ ] T1.8 (Lot 2.4) acoperă: Founder fără 2FA activ → login blocată (nu grație).
- [ ] Founder autentificat fără 2FA activ nu poate deschide sesiune de suport → `TwoFactorRequired`.
- [ ] T1.12 — Founder revocat (`revokedAt` setat): sesiunea existentă → `NotAuthenticated` la request următor; celelalte conturi Founder funcționează normal.
- [ ] T1.13 — `addFounderUser` și `revokeFounderUser` apelabile doar de `isVentoraOwner: true` → `Forbidden` pentru orice alt cont Founder.

---

## 3. Criteriile de ieșire din Faza 2

Faza 2 se închide doar când:

1. Migrațiile `core/identity` + `core/organizations` + `core/access` + `core/audit` se aplică pe bază curată fără erori.
2. T1 (sesiuni): T1.1–T1.3, T1.4–T1.8, T1.9–T1.11, T1.12–T1.13 verzi în CI.
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
| Better Auth nu suportă un comportament necesar (ex. 2FA obligatoriu doar pentru un rol) | Extindem prin middleware propriu deasupra Better Auth; nu înlocuim librăria fără aprobare fondatori |
| Migrațiile `core/identity` intră în conflict cu schema Better Auth | Better Auth cu adapter Prisma folosește tabelele noastre: schema e a noastră, nu a librăriei. Conflictul apare dacă redenumim câmpuri pe care librăria le citește hardcodat — documentăm în CLAUDE.md |
| Performanța `authorize()` per request | Permisiunile se citesc din DB cu cache pe durata request-ului (nu între request-uri). Dacă p95 > 20ms, se adaugă cache Redis cu TTL scurt (NECESITĂ DECIZIE) |
| Sesiunea de suport creează o suprafață de atac | Audit complet + durată maximă + vizibilitate pentru organizație + acces strict la Founder cu 2FA activ |
| Resend indisponibil sau neconfigurat pe staging | `inviteMember` reușește; emailul nu se trimite; audit înregistrează avertisment. Testarea manuală a invitațiilor necesită Resend configurat. |
| Resend stochează date de cont în SUA (`us-east-1`) | Acoperit de DPA Article 28 pre-semnat + SCCs + EU-US Data Privacy Framework. Validare juridică obligatorie înainte de prima trimitere, alături de D-SMS-7 și D-GRW-8. |

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
- `FounderUser.founderRole` are deja valorile `full | support | commercial` în schemă; rolurile `support` și `commercial` primesc permisiuni definite într-o fază ulterioară (NECESITĂ DECIZIE).

---

## 7. Cookie-uri și sesiuni pe subdomenii (D-INF-1)

Cookie-urile de sesiune sunt **host-only** — un cookie setat pe `app.ventora-hub.com` nu e trimis de browser la `portal.ventora-hub.com` sau `founder.ventora-hub.com`. Nu există cookie cross-domeniu.

| Subdomeniu | Cookie sesiune | Note |
|---|---|---|
| `app.ventora-hub.com` | `__Host-session` (Better Auth) | Sesiunea Hub (B2B) |
| `founder.ventora-hub.com` | `__Host-founder-session` | Sesiunea Founder — 2FA obligatoriu fără grație |
| `portal.ventora-hub.com` | — | Portal (B2C, §7.6) nu intră în F2 |

Pe staging (URL-urile stabile Vercel, fără subdomenii proprii, D-INF-3): cookie-urile se configurează cu `cookiePrefix` și `sameSite: 'lax'`. Prefixul `__Host-` se activează doar în producție, pe domeniile `ventora-hub.com` (§9).

---

## 8. Ordinea implementării — logică înaintea ecranelor

**Logica, API-ul și testele se implementează înaintea oricărui ecran.**

- **Livrat în F2:** toate loturile 2.1–2.5 (logică, contracte, API, teste T1–T3).
- **Livrat după direcția vizuală F1:** ecranele `HubSignIn`, `HubInvite`, `HubAccount` (cu lista de sesiuni și revocări), `SecuritySettings` (2FA + coduri de rezervă), toate pe AuthLayout (R-2F9). Ecranele 2FA formează Lotul 2.4b.

Data de start pentru ecrane: după milestone-ul de design F1. Ecranele nu sunt criterii de ieșire din F2.

---

## 9. Staging

**D-INF-3 (CONFIRMAT, 28.10.2026):**
- staging-ul rulează pe **URL-urile stabile Vercel** ale celor trei proiecte, fără subdomenii proprii de staging;
- **azi nu există niciun proiect Vercel**, deci staging-ul înseamnă baza Supabase de staging;
- pe ea se aplică migrările doar din `main`, cu `DIRECT_URL` (ARCHITECTURE §6.3).

Implicații pentru F2:
- Cookie-uri `__Host-` inactive pe Vercel; Better Auth configurat cu `sameSite: 'lax'` și flag HTTPS.
- Testele de integrare (T1–T3) rulează în CI și local, pe baze de test dedicate, **nu** pe baza de staging. Secretele de staging stau în Vercel env și în `.env.local`, niciodată în repo.
- Când există proiectele Vercel: codul 2FA la fiecare intrare cu parola (R-2F2) și refuzul `trustDevice` se verifică manual pe URL-urile Vercel, înainte de închiderea F2.

---

## 10. Curățare staging Supabase — propunere (NECESITĂ APROBARE)

**Nu se rulează fără aprobare explicită.** Înainte de primele migrații F2 pe staging, schemele și rolurile `lab_*` rămase din experimentele F0 trebuie șterse. Lista exactă de comenzi propuse:

```sql
-- 1. Verifică ce există (read-only, sigur de rulat oricând):
SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'lab%';
SELECT rolname FROM pg_roles WHERE rolname LIKE 'lab%';

-- 2. Șterge schemele (CASCADE șterge tabele, politici RLS, secvențe):
DROP SCHEMA IF EXISTS lab_core CASCADE;
DROP SCHEMA IF EXISTS lab_booking CASCADE;
DROP SCHEMA IF EXISTS lab_crm CASCADE;
DROP SCHEMA IF EXISTS lab_catalog CASCADE;

-- 3. Șterge rolurile (în ordinea dependențelor — după ștergerea schemelor):
DROP ROLE IF EXISTS lab_booking_rw;
DROP ROLE IF EXISTS lab_crm_rw;
DROP ROLE IF EXISTS lab_core_rw;
DROP ROLE IF EXISTS lab_catalog_rw;
-- Adaugă orice alte roluri `lab_*` găsite la pasul 1.
```

> **Atenție:** `DROP SCHEMA ... CASCADE` e ireversibil pe staging. Rulează întâi SELECT-urile de la pasul 1, trimite-mi output-ul, și confirmă explicit fiecare DROP înainte de execuție.

---

## 11. Furnizorul de email — Resend

**Decizie:** Resend, regiunea UE.

| Parametru | Valoare |
|---|---|
| Furnizor | Resend (resend.com) |
| Regiune | EU West (`eu-west-1`, Irlanda) |
| Domeniu de expediere | `ventora-hub.com` (decizia B-1, 28.10.2026, ca ARCHITECTURE §11.6; `mail.` rămâne opțiune pentru volum mare). Expeditor `Ventora <noreply@ventora-hub.com>`, Reply-To `support@ventorasystems.com` (B-2, B-3) |
| Autentificare domeniu | SPF, DKIM, DMARC — de configurat înainte de primul deploy pe staging |
| Adaptor | `core/notifications`, canalul `email` — interfață generică; furnizorul se schimbă fără modificări în aplicații |

**Arhitectura adaptorului:**

- `core/notifications/src/channels/email.ts` exportă `sendEmail(to, template, data): Promise<void>`.
- Implementarea Resend se injectează prin `NotificationsProvider` configurat în `apps/platform` și `apps/founder`.
- F2 folosește două template-uri: `invitation-owner` (Founder invită Owner) și `invitation-member` (Owner invită membru).

**Date și rezidență (Resend DPA — de verificat înaintea deployului în producție):**

*Notă: informațiile de mai jos reflectă documentația publică Resend disponibilă la data planificării (octombrie 2026). DPA-ul Resend trebuie citit și semnat înainte de lansare; clauzele se pot modifica.*

- **Conținut email și adrese destinatari:** procesarea și stocarea temporară se fac pe infrastructura EU West (Irlanda) când e selectată regiunea `eu-west-1`. Conținutul emailului nu e păstrat după livrare sau după perioada de retenție configurată.
- **Log-uri și metadate tranzacționale** (timestamp trimitere, status livrare, bounce, adresă destinatar): stocate în regiunea selectată pe durata retenției configurate.
- **Date de cont Resend** (informații utilizator platformă, facturare, log-uri de utilizare API): stocate pe infrastructura primară Resend în `us-east-1` (SUA), indiferent de regiunea de trimitere selectată. Transferul EU→SUA e acoperit de DPA Article 28 pre-semnat + SCCs (Module 2 pentru controller-to-processor, Module 3 pentru processor-to-processor) + EU-US Data Privacy Framework.
- **GDPR:** Resend acționează ca procesor de date. DPA disponibil la `resend.com/legal/dpa`. Clauzele de retenție și ștergere a datelor se configurează în setările organizației Resend.

**Validare juridică:**

- [ ] DPA Resend citit și semnat înainte de primul email transacțional în producție.
- [ ] Verificare specifică: datele de cont Resend stocate în US — bază legală (SCCs sau decizie de adecvare).
- [ ] Adăugat la lista existentă de validări juridice alături de D-SMS-7 (SMS furnizor) și D-GRW-8 (Growth Engine date marketing).
