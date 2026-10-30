# FounderSignIn

Signing in to Founder Control Center (S101). The page is AuthLayout with `brand="founder"`: the Ventora mark next to "Founder", "Control Center" and "Instrumentul intern al echipei Ventora". Romanian only (S57): no language selector, no note about invitations, no "Ține-mă minte". Every text is a key in `i18n/founder-auth.json` (`founder.signIn.*`); align the names with the code's before integration.

**The form.** "Bine ai revenit" / "Intră în Founder Control Center.", "E-mail" (`autocomplete="username"`), "Parolă" (`autocomplete="current-password"`) with "Ai uitat parola?" beside the label (FounderPasswordReset), "Intră în cont". After the password comes the code (FounderTwoFactor; mandatory in Founder, S58).

**States.**
- Wrong e-mail or password: Notice danger "E-mailul sau parola nu sunt corecte" / "Verifică-le și încearcă din nou.", with "Ai uitat parola?"; the password field is marked.
- Checking: Button `loading` ("Intri în cont…").
- Too many attempts (S102): Notice danger "Ai încercat de prea multe ori" / "Poți încerca din nou peste 15 minute, la ora {time}.", fields and button disabled.

Shown at 1280 and 390, in light and dark.
