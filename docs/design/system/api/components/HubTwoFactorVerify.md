# HubTwoFactorVerify

`page` · Ecrane Hub · versiunea 1.0.1 · nouă

Two-step check at sign-in, after the password. The page is AuthLayout (S63), like HubSignIn. The code is asked at every sign-in with the password (S59); locked after 5 wrong codes, for 15 minutes (S61). Shown at 1280 and 390, in light and dark; texts from `i18n/two-factor.json`.

## Evenimente

—

## Stări

- Hub — Verificarea la autentificare (după parolă)
- Codul din aplicație
- Cod de 6 cifre
- Cod de rezervă (după „Folosește un cod de rezervă”)
- Cod de rezervă
- „Nu mai am acces la telefon și nici la coduri”
- Stări · desktop (coloana formularului; panoul e ca mai sus)
- 1 · Cod greșit
- 2 · Se verifică
- 3 · Cod de rezervă deja folosit
- 4 · Cod de rezervă greșit
- 5 · Cont blocat temporar, cu ora
- 6 · Au trecut 10 minute: înapoi la autentificare
- Stări · telefon
- Cod greșit
- Cod de rezervă deja folosit
- Cont blocat temporar
- Au trecut 10 minute
- Se verifică
- Deutsch · 1280 · cod de rezervă folosit
- Backup-Code
- Italiano · 390 · blocat
- Codice di 6 cifre
- Deutsch · 390 · recuperare

## Note

States are the labelled boards and frames of the preview (Light and Dark; desktop/tablet/phone).

Mai mult: `components/HubTwoFactorVerify/README.md`, exemplele: `components/HubTwoFactorVerify/preview.html`.
