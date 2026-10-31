# Staging, 31.10.2026: testul cap-coadă al Fazei 2 (în lucru)

**Codul:** `main` (`69fa617`), fără modificări. Serverele rulează local, din `C:\Projects\ventora-ecosystem`, conectate la baza de staging.

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
