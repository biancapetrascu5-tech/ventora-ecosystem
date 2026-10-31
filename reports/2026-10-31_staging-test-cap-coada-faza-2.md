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

### Comanda de bootstrap (rulată de fondatoare)

Din `C:\Projects\ventora-ecosystem`, în PowerShell:

```powershell
cd C:\Projects\ventora-ecosystem
Get-Content .env.local | Where-Object { $_ -match '^(DATABASE_URL_FOUNDER|FOUNDER_AUTH_SECRET)=' } | ForEach-Object { $k, $v = $_ -split '=', 2; Set-Item "env:$k" $v.Trim('"') }
pnpm founder:bootstrap
```

### Observații de la pornire (nereparate)

- **Avertisment Better Auth, pe ambele aplicații:** „Base URL is not set” (nu e setat nici `baseURL`, nici `BETTER_AUTH_URL`). Originea se ia din cerere.
- **Founder:** Next 16 avertizează că fișierul `middleware` e depreciat, în favoarea lui `proxy`.

## Testul

_Se completează în timpul testului: ce a mers, ce nu, erorile din jurnale._
