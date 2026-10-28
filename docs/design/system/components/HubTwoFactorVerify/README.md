# HubTwoFactorVerify

Two-step check at sign-in, after the password. The page is AuthLayout (S63), like HubSignIn. The code is asked at every sign-in with the password (S59); locked after 5 wrong codes, for 15 minutes (S61). Shown at 1280 and 390, in light and dark; texts from `i18n/two-factor.json`.

**The screen.**
- "Încă un pas", with "Intri ca {email}." and "Intră cu alt cont".
- "Cod de 6 cifre" (numeric keyboard, `autocomplete="one-time-code"`) and "Intră în cont".
- "Folosește un cod de rezervă" turns the field into "Cod de rezervă" ("Fiecare cod de rezervă merge o singură dată."). "Folosește codul din aplicație" turns it back.
- There is no "Ține minte acest dispozitiv".

**States.**
- Wrong code.
- Backup code that doesn't match.
- Backup code already used: "Ai folosit deja acest cod de rezervă. Încearcă alt cod din listă."
- Checking.
- Account locked for now, with the time: Notice danger "Contul e blocat temporar" / "Au fost prea multe încercări greșite. Poți intra din nou după ora {time}."
- Verification session expired after 10 minutes: Notice neutral "Au trecut mai mult de 10 minute" / "Din motive de siguranță, intră din nou cu e-mailul și parola.", with "Înapoi la autentificare" back to sign-in.

**"Nu mai am acces la telefon și nici la coduri".** A short screen: "Recuperează accesul", "Scrie-ne de pe adresa contului și te ajutăm să recuperezi accesul după ce îți confirmăm identitatea.", the address, "Scrie-ne pe e-mail" and "Înapoi". The address is support@ventorasystems.com (S62), from the key `auth.2fa.recovery.email`; the same in Founder. There is no automatic reset.
