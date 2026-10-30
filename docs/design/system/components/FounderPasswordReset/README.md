# FounderPasswordReset

A new password from "Ai uitat parola?" in Founder Control Center: the same screens and states as HubPasswordReset, on AuthLayout with `brand="founder"` (S63).
- **The panel:** the Ventora mark next to "Founder", "Control Center" and "Instrumentul intern al echipei Ventora". No language selector (S57, S80).
- **Two-step sign-in is required for everyone in Founder (S58),** so "Parola e schimbată" always says "După parolă îți cerem și codul din aplicația de autentificare."
- **Password requirements (S103):** at least 12 characters in Founder ("Cel puțin 12 caractere", `auth.reset.req.lengthFounder`), a digit and a capital letter; the Hub stays at 10.
- **Language:** Romanian only, but every text is a key in `i18n/password-reset.json`.
- **Shown:** 1280 and 390, in light and dark — the four screens, then on phone too many requests, requirements not met, link expired, link already used and saving.
