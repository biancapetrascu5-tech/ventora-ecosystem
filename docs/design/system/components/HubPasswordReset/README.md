# HubPasswordReset

A new password from "Ai uitat parola?", on AuthLayout (S63), like HubSignIn. Every text is a key in `i18n/password-reset.json` (`auth.reset.*`), in the 6 languages. Shown at 1280 and 390, in light and dark, with all the states and a German and Italian test.

**The four screens.**
1. **"Ai uitat parola?"** — "Scrie adresa contului și îți trimitem un link pentru o parolă nouă.", the e-mail (filled in from the sign-in, `autocomplete="username"`), "Trimite linkul" and "Înapoi la autentificare".
2. **"Verifică-ți e-mailul"** (S73) — "Dacă {email} este adresa unui cont Ventora, ți-am trimis acolo un link pentru o parolă nouă." and "Linkul e valabil o oră." (S55). The same screen for any address, so it never tells whether an account exists. "Nu vezi e-mailul? Uită-te și în Spam sau Promoții.", "Trimite alt link" (active after a minute; every new link cancels the old one, S74), "Folosește altă adresă" and "Înapoi la autentificare".
3. **"Alege o parolă nouă"** (from the e-mailed link) — "Pentru contul {email}." as text, one "Parolă nouă" field (`autocomplete="new-password"`) with "Arată parola" (the button `Input type="password"` already has; P2), the live requirements as in HubInvite (lime when met, announced as they tick), "Când o salvezi, te scoatem din cont pe toate dispozitivele." and "Salvează parola".
4. **"Parola e schimbată"** (S72, S79) — neutral: "Te-am scos din cont pe toate dispozitivele." and "Intră din nou cu parola nouă, pe fiecare dispozitiv pe care lucrezi." For an owner with two-step sign-in: "După parolă îți cerem și codul din aplicația de autentificare." Then "Intră în cont", back to HubSignIn with the address filled in.

**States.**
- E-mail missing: "Scrie adresa de e-mail a contului." Incomplete address: "Adresa nu pare completă. Verifică după @."
- Sending, saving: Button `loading`.
- Too many requests (5 an hour for one address, S75): Notice danger "Ai încercat de prea multe ori" / "Poți cere un link nou după ora {time}.", field and button disabled.
- Offline: Notice neutral "Nu te putem conecta acum" / "Verifică internetul și încearcă din nou."
- Requirements not met on save: "Parola nu îndeplinește încă toate cerințele de mai jos."
- **Link expired** (after an hour), or broken or unknown (S77): Notice attention "Linkul a expirat" / "Linkurile pentru o parolă nouă sunt valabile o oră. Cere unul nou și îl primești pe e-mail.", with "Cere un link nou". From an expired link of a known account it sends the new link straight away and shows "Verifică-ți e-mailul"; when the account can't be read from the link, it opens "Ai uitat parola?" with an empty field (S76).
- **Link already used:** EmptyState "Ai folosit deja acest link" / "Fiecare link merge o singură dată. Dacă ți-ai ales deja parola nouă, intră cu ea.", with "Intră în cont" and "Cere un link nou" (which opens "Ai uitat parola?" with an empty field, S76).
- Password changed for a member without two-step sign-in: no line about the code.

**After the change** an e-mail "Parola contului tău a fost schimbată" goes out through the operational template (S78; drawn in BookingSmsNotifications, keys `auth.reset.email.*`). It goes out for every password change, from Contul tău · Securitate too (S82), and it can't be turned off (S83).
