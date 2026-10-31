# Staging, 31.10.2026: testul cap-coadă al Fazei 2 — TRECUT

**Rezultat:** testul cap-coadă al Fazei 2 pe staging e **trecut** (fondatoarea, 31.10.2026), după trei corecții făcute pe parcurs: PR #33, #34 și #36 (vezi mai jos).

**Codul:** la început `main` (`69fa617`); testul s-a încheiat pe `main` `86bde28` (cu #33, #34 și #36). Serverele au rulat local, din `C:\Projects\ventora-ecosystem`, conectate la baza de staging.

## Pregătirea

| Ce                                   | Unde / cum                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Founder                              | http://localhost:3202, `next dev`, `DATABASE_URL_FOUNDER` (founder_runtime, pooler 6543)                                                                                                                                                                                                                                                                                                     |
| Hub (platform)                       | http://localhost:3200, `next dev`, `DATABASE_URL` (app_runtime, pooler 6543)                                                                                                                                                                                                                                                                                                                 |
| Portal                               | nepornit; Faza 2 nu-l folosește                                                                                                                                                                                                                                                                                                                                                              |
| E-mail                               | Resend nu e configurat. Am pornit un server local de captură pe `127.0.0.1:4510`, iar aplicațiile primesc `RESEND_BASE_URL` spre el și o cheie falsă (SDK-ul Resend citește această variabilă). Nimic nu pleacă pe internet; fiecare mesaj se păstrează local și linkurile din el sunt date fondatoarei. Canalul de jurnal (`LogEmailAdapter`) nu ajunge: nu scrie corpul, deci nici linkul. |
| Cont Founder pe staging              | la verificare (doar citire): **0 conturi**, active sau revocate. Îl creează fondatoarea cu `pnpm founder:bootstrap`.                                                                                                                                                                                                                                                                         |
| Utilizatori Hub / afaceri pe staging | 0 / 0                                                                                                                                                                                                                                                                                                                                                                                        |

### Secretele de autentificare

- **Valorile.** `BETTER_AUTH_SECRET` (Hub; citit de `core/identity/src/auth.ts`) și `FOUNDER_AUTH_SECRET` (Founder) lipseau din `.env.local`. Le-am generat aleator (64 de caractere hex) și sunt acum în `.env.local` de la rădăcina repo-ului, ca valori permanente pentru staging.
  - nu au fost afișate și nu sunt comise (`.env.local` e în `.gitignore`);
  - `.env.example` are doar numele lor, fără valori.
- **De ce sunt permanente.** O primă variantă, cu secretele într-un fișier temporar, a fost respinsă de fondatoare. Better Auth criptează cu aceste secrete secretul TOTP și codurile de rezervă, deci un secret temporar ar strica 2FA-ul conturilor de staging la următoarea pornire. Fișierul temporar a fost șters, iar serverele au fost repornite cu valorile din `.env.local`.

> **De reținut pentru Lotul 3.9 / 4.11 (deploy pe Vercel, staging).** Aceleași două valori trebuie puse în Vercel pentru mediul de staging. Dacă se schimbă vreodată, conturile de staging (Hub și Founder) își pierd 2FA: secretul TOTP și codurile de rezervă nu se mai pot decripta, și 2FA trebuie refăcut.

### Bootstrap-ul contului Founder

**Prima comandă, cu `DATABASE_URL_FOUNDER` din `.env.local`, a picat:** `permission denied for schema founder_identity` (42501).

**Cauza** e în `core/identity/scripts/bootstrap-founder.ts`: scriptul creează direct `new PrismaClient(...)`, fără `SET LOCAL ROLE founder_identity_rw`.

- `founder_runtime` e `NOINHERIT` și n-are drepturi proprii pe schemă (§12.3).
- Serverul Founder merge, pentru că trece prin `makeFounderClient`.
- Testul de integrare al bootstrap-ului primește un client făcut cu `makeFounderClient`, deci nu acoperă scriptul.

Nu s-a schimbat nimic pe staging.

**Ocolirea:** fondatoarea a rulat bootstrap-ul o dată pe `DIRECT_URL` (rolul `postgres`, proprietarul schemei). Contul a fost creat la 09:06:20 UTC.

**Corecția în cod (de făcut):** scriptul trebuie să folosească `makeFounderClient`.

### Observații de la pornire (nereparate)

- **Avertisment Better Auth, pe ambele aplicații:** „Base URL is not set” (nu e setat nici `baseURL`, nici `BETTER_AUTH_URL`). Originea se ia din cerere.
- **Founder:** Next 16 avertizează că fișierul `middleware` e depreciat, în favoarea lui `proxy`.

## Testul

Orele sunt în UTC.

### A mers

| Ora         | Pas                                                                                                                                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 09:08       | Conectarea Founder cu parola greșită: 401, cu audit `founder.login_failed`                                                                                                                                                            |
| 09:09–09:10 | „Am uitat parola”: e-mailul de resetare (prins în captură), linkul, parola nouă, apoi confirmarea „Parola contului tău Ventora a fost schimbată”. În audit: `founder.password_reset_requested` și `founder.password_reset_completed`. |
| 09:11–09:12 | Conectarea, activarea 2FA (TOTP), revocarea celorlalte sesiuni. În audit: `founder.login_succeeded`, `founder.2fa_enroll_started`, `founder.session_bulk_revoked_on_2fa_enroll`, `founder.2fa_enabled`.                               |
| 09:12       | Lista afacerilor (`/businesses`), goală                                                                                                                                                                                               |

### Nu a mers

**„Afacere nouă” (~09:13).** Afacerea „Salon Test”, cu proprietarul `petrascu.bianca@yahoo.com`, nu s-a creat. Ecranul a afișat „Nu am putut crea afacerea. Încearcă din nou.”

- **Jurnalul serverului:** nicio eroare, doar `POST /businesses/new 200`. Acțiunea `createBusiness` (`apps/founder/src/server/business-actions.ts`) prinde excepția și întoarce `{ ok: false }` fără s-o scrie în jurnal.
- **Cauza** (doar citire, confirmată pe staging):
  - Id-ul contului Founder e `5giVHYVy…` (32 de caractere, format implicit Better Auth), nu un UUID.
  - `createOrganizationTx` trimite `ctx.founderId` ca `$5::uuid` către `organizations.founder_create_organization`. Coloanele `organization.created_by_founder_id` și `invitation.invited_by_user_id` sunt `uuid`, deci Postgres respinge valoarea (22P02, „invalid input syntax for type uuid”) înainte de orice scriere.
- **De unde vine id-ul greșit:** `bootstrapFounderAccount` (`core/identity/src/bootstrap-founder.ts`) își construiește propriul `betterAuth({...})` fără `advanced.database.generateId: () => crypto.randomUUID()`. Configurația aplicației (`core/identity/src/auth-options.ts:282`) are această opțiune.
  - Testul bootstrap-ului nu verifică formatul id-ului.
  - Celelalte coloane cu id-ul Founder sunt `text` (`audit.audit_log.actor_id` / `founder_id`, `access.support_session.founder_id`), de aceea autentificarea și auditul au mers.
- **Ce a rămas pe staging:** nimic pe jumătate. 0 afaceri, 0 invitații, 0 membri; niciun rând de audit pentru crearea afacerii. Niciun e-mail de invitație nu a plecat spre captură.
- **Drepturile sunt în regulă:** `founder_runtime` are `EXECUTE` pe toate cele 6 funcții `organizations.founder_*`, iar acestea sunt `SECURITY DEFINER`, cu proprietarul `postgres`.

**Corecția propusă:**

1. **Cod, un PR într-un worktree separat:**
   - `bootstrapFounderAccount` generează id-uri UUID, ca aplicația: fie folosește `createFounderAuthOptions`, fie adaugă `generateId`;
   - scriptul folosește `makeFounderClient`;
   - testul verifică că id-ul e UUID;
   - opțional, `createBusiness` scrie eroarea în jurnal (fără date personale) înainte de `{ ok: false }`.
2. **Staging, după merge și numai cu acordul fondatoarei:** contul Founder existent trebuie recreat.
   - Pe `DIRECT_URL`: `DELETE FROM founder_identity.users WHERE id = '5giVHYVyut1dW09dtJUEDQj7H1mAVuHD';`. Cascada șterge contul, sesiunea și 2FA-ul (FK `ON DELETE CASCADE`). Plus `DELETE FROM founder_identity.verifications` (o singură resetare, deja folosită).
   - Apoi bootstrap din nou, de data asta pe `DATABASE_URL_FOUNDER`, și 2FA din nou.
   - Rândurile de audit vechi rămân (jurnal append-only), cu id-ul vechi ca text.

### Corecția și refacerea contului Founder

- **PR #34** (`78c5c53` în `main`):
  - bootstrap-ul folosește configurația aplicației Founder (id UUID) și `makeFounderClient`;
  - testul verifică formatul UUID;
  - cele 24 de `catch` din acțiunile Founder și Hub scriu acum cauza în jurnal (fără date personale), iar erorile neașteptate pleacă și la Sentry, dacă e configurat.
- **Folderul principal** a fost actualizat la `78c5c53`. Serverele 3200 și 3202 și captura de e-mail au fost repornite din `main` nou; cele vechi fuseseră oprite de Claude Code din lipsă de memorie.
- **Ștergerea, cu acordul fondatoarei.** Pe `DIRECT_URL`, într-o singură tranzacție, cu verificare înainte și după și cu `ROLLBACK` automat la orice diferență:
  - **înainte:** 1 cont Founder (`5giVHYV…`), cu 1 cont de autentificare, 1 sesiune, 1 rând 2FA și 1 rând în `verifications` (marcajul `reset-password-used` al aceluiași cont); 0 afaceri, 0 sesiuni de suport;
  - `DELETE FROM founder_identity.verifications WHERE id = '2036287a-…' AND value = '5giVHYV…'` → 1 rând;
  - `DELETE FROM founder_identity.users WHERE id = '5giVHYV…'` → 1 rând (cascada a șters contul de autentificare, sesiunea și rândul 2FA);
  - **după** (în tranzacție, apoi pe o conexiune nouă): 0 în `users`, `accounts`, `sessions`, `two_factors` și `verifications`. `COMMIT`.
  - Cele 5 rânduri de audit cu id-ul vechi rămân (jurnal append-only).
- **Următorul pas:** fondatoarea refăce contul cu `pnpm founder:bootstrap` pe `DATABASE_URL_FOUNDER`, apoi activează din nou 2FA.

### Afacerea nouă și invitația proprietarului

- **10:06:** „Salon Test” s-a creat din Founder, cu contul Founder nou (id UUID). Invitația proprietarului (`petrascu.bianca@yahoo.com`) a fost prinsă în captură, cu `email_status = sent`.
- **Deschiderea invitației în Hub (`/invite/[token]`) a picat cu 500:** `permission denied for schema organizations` (42501), în `getInvitationByToken` (`core/organizations/src/contract.ts:538`), apelată din `app/(auth)/invite/[token]/page.tsx:24`.

### Analiza (doar citire; pe staging nu s-a schimbat nimic)

**Rolurile pe staging:**

- `DATABASE_URL` (Hub) se conectează ca `app_runtime`, `NOINHERIT`, membru în `access_rw`, `audit_org_reader`, `audit_writer`, `identity_rw` și `org_rw`. Nu are `USAGE` pe nicio schemă a modulelor.
- `DATABASE_URL_FOUNDER` se conectează ca `founder_runtime`, `NOINHERIT`, membru în `audit_founder_reader`, `audit_writer` și `founder_identity_rw`. Are `USAGE` direct pe `access`, `identity` și `organizations`, pentru funcțiile `SECURITY DEFINER`.

**Cauza.** Clienții Prisma ai modulelor trec pe rolul modulului (`SET LOCAL ROLE`) doar în `$transaction`, iar identity, founder și organizations și în operațiile pe modele. `$queryRaw` apelat direct pe client, în afara unei tranzacții, rulează ca rolul de conectare. `getInvitationByToken` face exact asta: apelează `find_invitation_view_by_token_hash`, la care `org_rw` are drept, dar fără să treacă pe `org_rw`. E același tip de bug ca la bootstrap.

**De ce nu l-au prins testele.** Testele de integrare organizations, access și booking rulează contractele cu `DATABASE_URL` = `postgres` (admin), atât local (`scripts/test-integration.mjs`), cât și în CI (`.github/workflows/ci.yml`, joburile organizations și access + booking). Identity, audit, commercial și integrations (T6) rulează deja pe `app_runtime` / `founder_runtime`.

**Experimentul.** Într-un worktree separat, necomis, am rulat suita de integrare cu `app_runtime` în loc de `postgres` pentru organizations, access și booking. Datele de pornire rămân pe `DIRECT_URL`.

| Pachet        | Rezultat       |
| ------------- | -------------- |
| organizations | 4 din 37 pică  |
| access        | 5 din 139 pică |
| booking       | 7/7 trec       |
| restul        | trec           |

Toate cele 9 eșecuri au aceeași cauză: `getInvitationByToken`, direct sau prin `signUpWithInvitation`. Worktree-ul a fost șters.

**Contractele apelate din aplicații:**

| Contract                                                                                                                                                                           | Calea spre bază                                | Rolul                                   | Verificat pe rol de runtime                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------- | ------------------------------------------------------- |
| Hub: `getSession`, `hasAccountForEmail`, `getOpenLastOrganization`, `setOpenLastOrganization`, `setSessionActiveOrganization`, `revokeSession`, `hubAuth` (intrare, resetare, 2FA) | client identity (modele) / Better Auth         | `identity_rw` ✓                         | da (testele identity, `app_runtime`)                    |
| Hub: `getUserById`, `listSessions`, `getResetLinkInfo`, `regenerateBackupCodes`                                                                                                    | client identity (modele)                       | `identity_rw` ✓                         | fără test; corect după cod                              |
| Hub: `countBackupCodes`, `getPasswordChangedAt`                                                                                                                                    | client identity (modele)                       | `identity_rw` ✓                         | da (experiment, access)                                 |
| Hub: **`getInvitationByToken`** (invitația, înscrierea, acceptarea)                                                                                                                | **`$queryRaw` în afara tranzacției**           | **`app_runtime` ✗**                     | **pică**                                                |
| Hub: `requestNewInvitationLink`, `listMyOrganizations`, `markOrganizationOpened`, `resolveOrgContext`                                                                              | client organizations, `$transaction`           | `org_rw` ✓                              | da (experiment)                                         |
| Hub: `isOwnerAnywhere`                                                                                                                                                             | client organizations, `$transaction`           | `org_rw` ✓                              | fără test; corect după cod                              |
| Hub: `signUpWithInvitation`, `acceptInvitationWithAccess`                                                                                                                          | access + organizations                         | ✗ prin `getInvitationByToken`; restul ✓ | pică prin `getInvitationByToken`                        |
| Hub: `countApplicationAccess`, `disableMemberTwoFactor`, `listTeamMembers`, `listTeamInvitations`, `resendTeamInvitation`, `revokeTeamInvitation`                                  | client access, `$transaction`                  | `access_rw` ✓                           | da (experiment)                                         |
| Hub: `getSupportSessionBanner`, `listActiveSupportSessions`, `listSupportSessions`, `closeSupportSessionAsOwner`                                                                   | client access, `$transaction`                  | `access_rw` ✓                           | da (experiment)                                         |
| Founder: `getFounderSession`, `founderAuth`, `countBackupCodes`, `regenerateBackupCodes`, `getResetLinkInfo`                                                                       | client founder (modele)                        | `founder_identity_rw` ✓                 | parțial (identity, `founder_runtime`); merge pe staging |
| Founder: `createBusinessAsFounder`, `listBusinessesForFounder`, `getBusinessPageForFounder`, `suspendBusiness`, `reactivateBusiness`                                               | `founder_runtime` + funcții `SECURITY DEFINER` | ✓                                       | da (access, `founder_runtime`); merge pe staging        |
| Founder: `getBusinessForFounder`, `openSupportSession`, `closeSupportSession`, `recoverOwnerAccess`                                                                                | `founder_runtime` + funcții `SECURITY DEFINER` | ✓                                       | da (access, `founder_runtime`)                          |

**Corecția propusă (de deschis ca PR după acord):**

- **(a) Cod:**
  - `getInvitationByToken` în `db.$transaction(...)`;
  - ca tot tipul de bug să dispară, clienții modulelor (identity, founder, organizations, access) învelesc automat în tranzacție cu `SET LOCAL ROLE` și `$queryRaw` / `$executeRaw` (și variantele `Unsafe`) apelate în afara unei tranzacții;
  - clientul access învelește și operațiile pe modele, ca ceilalți (azi nu le învelește; nu există apeluri de acest fel, dar e o capcană).
- **(b) Teste:**
  - organizations, access și booking rulează cu `DATABASE_URL` = `app_runtime` (`NOINHERIT`), local și în CI, cu admin doar pe `DIRECT_URL` pentru datele de pornire;
  - plus o gardă în setup-ul testelor: dacă `current_user` al conexiunii contractelor e superuser sau are `rolinherit = true`, testele pică imediat.
- Pe staging nu se schimbă GRANT-uri.

### Corecția invitației (PR #36) și reluarea testului

- **PR #36** (`86bde28` în `main`):
  - `getInvitationByToken` rulează sub `org_rw`;
  - clienții modulelor trec pe rolul modulului și la interogările raw din afara unei tranzacții;
  - testele organizations, access și booking rulează pe `app_runtime`, local și în CI;
  - garda `assertRuntimeRole` oprește orice rulare a contractelor pe o conexiune care nu e rolul de runtime.
- **Folderul principal** a fost actualizat la `86bde28`, iar serverele au fost repornite. Invitația veche (aceeași din captură) s-a deschis fără eroare și nu a mai trebuit retrimisă.

## Rezultatul final

**TRECUT** (fondatoarea, 31.10.2026). Orele sunt în UTC.

### Founder

| Pas                                                                     | Rezultat |
| ----------------------------------------------------------------------- | -------- |
| Contul (bootstrap pe `DATABASE_URL_FOUNDER`, după #34), 2FA             | ✓        |
| Resetarea parolei (e-mail, link, confirmare)                            | ✓        |
| Afacere nouă („Salon Test”, 10:06), cu invitația proprietarului         | ✓        |
| Sesiunea de suport (deschisă 10:24 și 11:08; e-mailul către proprietar) | ✓        |
| Suspendarea și reactivarea (10:25)                                      | ✓        |

### Hub

| Pas                                                                                         | Rezultat |
| ------------------------------------------------------------------------------------------- | -------- |
| Invitația: pagina, crearea contului, acceptarea (10:55)                                     | ✓        |
| Contul proprietarului: prima intrare, 2FA (10:56–10:59)                                     | ✓        |
| Echipa (`/admin/access`)                                                                    | ✓        |
| Securitatea: schimbarea parolei (11:04, cu e-mailul de confirmare), dispozitivele           | ✓        |
| Banda sesiunii de suport și închiderea ei din Hub (11:10, `support.session_revoked_by_org`) | ✓        |
| Afacerea suspendată ascunsă în Hub                                                          | ✓        |

Fiecare pas are rândul lui în audit: `org.created`, `support.session_opened` / `_closed` / `_revoked_by_org`, `org.suspended` / `org.reactivated`, `invitation.accepted`, `auth.login_succeeded`, `2fa.*`, `org.active_changed`, `password.changed`.

## Corecțiile făcute pe parcurs

| PR  | Ce a reparat                                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #33 | `main` roșu după #30: `founderEmail` rămas în testul 4.1; portul T6 fix în `scripts/test-integration.mjs`                                                                                       |
| #34 | bootstrap-ul Founder: id-uri UUID (configurația aplicației) și `makeFounderClient`. Acțiunile Founder și Hub nu mai înghit erorile: 24 de `catch` scriu în jurnal, cu Sentry dacă e configurat. |
| #36 | interogările raw pe rolul modulului (invitația din Hub); testele de integrare pe rolurile de runtime, cu gardă                                                                                  |

**Pe staging, singura schimbare de date** (aprobată): ștergerea contului Founder cu id-ul vechi și a rândului din `verifications`, într-o tranzacție. Niciun GRANT, rol sau migrare nu s-a schimbat.

## Observații (nereparate)

1. **Pagina principală a Hub-ului afișează „OK — platform (port 3100)”** (`apps/platform/app/(hub)/page.tsx:3`). E un înlocuitor tehnic din lotul de pornire; de schimbat cu un text normal până la launcher.
2. **„Ultimele modificări” (Founder, pagina afacerii) arăta doar „Afacere creată”, fără „Invitație trimisă”.** Este comportamentul actual, conform designului de audit:
   - invitația proprietarului din Founder nu are un rând `invitation.created` propriu; e înregistrată în rândul E20 `org.created` (în tranzacția creării afacerii, cu `invitationId` în metadate);
   - `invitation.created` (E21) se scrie doar pentru invitațiile trimise din Hub, de proprietar sau admin (`inviteMember`);
   - pe staging, în auditul afacerii, apare după aceea și `invitation.accepted`.

   Dacă se vrea „Invitație trimisă” separat în listă, e o decizie de produs: fie un rând E21 în plus la crearea afacerii, fie afișarea lui E20 ca „Afacere creată · invitație trimisă”.

3. **Avertisment Better Auth „Base URL is not set”** pe ambele aplicații: de configurat `BETTER_AUTH_URL` (Hub și Founder) la Vercel, odată cu secretele (Lotul 3.9 / 4.11).
4. **Reactivarea afacerii se face fără dialog de confirmare.** Dialogul vine cu S112.
5. **Încărcarea e lentă în modul de dezvoltare legat de staging:** `/admin/access` 18,6 s, `/account` 8,1 s. Prima compilare și pooler-ul de la distanță contează; de remăsurat pe deploy.
6. **Founder:** Next 16 avertizează că `middleware` e depreciat, în favoarea lui `proxy`.
7. **Subiectul confirmării de schimbare a parolei** spune „contului tău Ventora” și pentru contul Founder (e-mailul de resetare spune „Ventora Founder”).

## Închiderea

Serverele de test (3200, 3202) și captura de e-mail (4510) au fost oprite după test. Secretele `BETTER_AUTH_SECRET` și `FOUNDER_AUTH_SECRET` rămân în `.env.local` (vezi nota pentru Vercel de mai sus).
