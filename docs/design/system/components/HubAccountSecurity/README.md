# HubAccountSecurity

Contul tău · Securitate in the Hub (Faza 2): changing the password, and two-step sign-in for a member who doesn't have it on. Same shell as HubAccount (Spine item "Securitate"). Every text is a key: `i18n/account-security.json` (`account.security.*`, 6 languages), the requirements and the reqs error from `i18n/password-reset.json` (`auth.reset.req.*`, `auth.reset.error.reqs`, `auth.reset.saving`), the activation steps from `i18n/two-factor.json`. The `account.security.*` names are the design system's; align them with the code's before integration. Shown at 1280 and 390, in light and dark, with a German and Italian test.

**"Schimbă parola" (S100).** A Dialog (a sheet on phones) over Securitate:
- "Parola actuală" (`autocomplete="current-password"`), with "Ai uitat parola?" beside the label (opens HubPasswordReset with the address filled in).
- "Parola nouă" (`autocomplete="new-password"`, with the field's own "Arată parola") and the live requirements, as on the reset: at least 10 characters, a digit, a capital letter (Ă, Â, Î, Ș, Ț count). Lime when met, announced as they tick.
- "Rămâi conectat pe acest dispozitiv. Pe celelalte te scoatem din cont."
- "Renunță" / "Schimbă parola".

States: requirements ticking while typing; all met; wrong current password ("Parola actuală nu se potrivește."); current password missing ("Scrie parola actuală."); requirements not met on submit ("Parola nu îndeplinește încă toate cerințele de mai jos."); saving (Button `loading`, "Renunță" disabled); done: the dialog closes, the approved Toast "Parola e schimbată." / "Pe celelalte dispozitive va trebui să intri din nou.", the row says "Schimbată azi." and the other devices leave "Dispozitive conectate". The e-mail "Parola contului tău a fost schimbată" goes out in the "celelalte dispozitive" variant (S78, S82).

**Two-step sign-in for a member (S108).** Optional for members, mandatory for the owner (S58).
- Off: "Autentificare în doi pași" with the pill "Neactivă", "Opțională pentru rolul tău. Când e activă, la fiecare intrare cu parola îți cerem și un cod din aplicația de autentificare." and "Activează". No "Coduri de rezervă" row.
- "Activează" opens the three steps of HubTwoFactorSetup in a Dialog over Securitate: the QR code and the key, the code, the 10 backup codes shown once with the required tick. Step 1 says "Un al doilea pas îți protejează contul chiar dacă cineva îți află parola." (`auth.2fa.setup.s1.leadMember`); "Renunță" replaces "Ieși din cont".
- On: the pill "Activă", the Toast "Autentificarea în doi pași e activă.", and the "Coduri de rezervă" row. *Proposal:* a member can turn it off with "Dezactivează", confirmed with the code from the app (danger dialog); the owner can't.
