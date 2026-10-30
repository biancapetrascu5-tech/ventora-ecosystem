# HubTwoFactorVerify

Two-step check at sign-in, after the password. The page is AuthLayout (S63), like HubSignIn. The code is asked at every sign-in with the password (S59); locked after 5 wrong codes, for 15 minutes (S61). Shown at 1280 and 390, in light and dark; texts from `i18n/two-factor.json`.

**The screen.**
- "Încă un pas", with "Intri ca {email}." and "Intră cu alt cont".
- "Cod de 6 cifre" (numeric keyboard, `autocomplete="one-time-code"`) and "Intră în cont".
- "Folosește un cod de rezervă" turns the field into "Cod de rezervă" ("Fiecare cod de rezervă merge o singură dată."). "Folosește codul din aplicație" turns it back.
- There is no "Ține minte acest dispozitiv".

**States.**
- Wrong code.
- Backup code that doesn't match or was already used — one message for both (S105): "Codul nu se potrivește sau a fost deja folosit. Încearcă alt cod din listă." (`auth.2fa.error.backupWrong`; `auth.2fa.error.backupUsed` is gone).
- Checking.
- Account locked for now, with the time: Notice danger "Contul e blocat temporar" / "Au fost prea multe încercări greșite. Poți intra din nou după ora {time}."
- Verification session expired after 10 minutes: Notice neutral "Au trecut mai mult de 10 minute" / "Din motive de siguranță, intră din nou cu e-mailul și parola.", with "Înapoi la autentificare" back to sign-in.

**"Nu mai am acces la telefon și nici la coduri".** A short screen: "Recuperează accesul", "Scrie-ne de pe adresa contului și te ajutăm să recuperezi accesul după ce îți confirmăm identitatea.", the address, "Scrie-ne pe e-mail" and "Înapoi". The address is support@ventorasystems.com (S62), from the key `auth.2fa.recovery.email`; the same in Founder. There is no automatic reset.

**After a sign-in with a backup code (R-2F10, S81).** Where you land (launcher or app), a Toast "Ai intrat cu un cod de rezervă" says how many codes are left, with "Generează coduri noi" (to Contul tău · Securitate, where new codes are generated and shown once):
- 3 or more: neutral, "Mai ai {n} coduri de rezervă.", closes by itself;
- 2: peach, "Mai ai doar {n} coduri de rezervă. Generează coduri noi ca să nu rămâi fără.";
- 1: peach, "Mai ai un singur cod de rezervă. Generează coduri noi ca să nu rămâi fără.";
- 0: peach, "Ai folosit ultimul cod de rezervă. Generează coduri noi, ca să poți intra și dacă pierzi telefonul."
With 2 or fewer it stays until closed. Keys `auth.2fa.backupLeft.*`. Shown on the launcher at 1280 (7 left) and 390 (2 left), light and dark, the four cases, and a German and Italian test.
