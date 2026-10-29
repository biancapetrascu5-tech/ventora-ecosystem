# HubTwoFactorSetup

Turning on two-step sign-in. It is required for the owner at the first sign-in after becoming owner. There is no "Sari peste" and no "Dezactivează" for the owner. The page is the AuthLayout component (S63), like HubSignIn and HubInvite: the brand panel, the sheet with the form and, on phones, the band with the logo and language. Locked after 5 wrong codes, for 15 minutes (S61). Shown at 1280 and 390, in light and dark, built only from the system's components. Every text is a key in `i18n/two-factor.json`, in the 6 languages.

**Steps** ("Pasul {n} din 3" above the title):
1. **The QR code and the key.**
   - "Protejează-ți contul".
   - "Contul de proprietar are acces la tot, așa că îl protejăm cu un al doilea pas."
   - The QR code for the authenticator app. It is dark on light in both themes, so phones can read it.
   - "Ce aplicație folosesc?" opens a Dialog (a sheet on phones) that names Google Authenticator, Microsoft Authenticator and 1Password.
   - The key as text, in groups of 4, with "Copiază" (which becomes "Copiat").
   - "Continuă".
2. **The code.**
   - "Cod de 6 cifre": numeric keyboard, `autocomplete="one-time-code"`.
   - "Activează" and "Înapoi la codul QR".
   - States:
     - wrong code: "Codul nu se potrivește. Introdu codul care apare acum în aplicație.";
     - checking: Button `loading`;
     - too many attempts: Notice danger "Ai încercat de prea multe ori" / "Poți încerca din nou peste 15 minute, la ora {time}.", with the field and button disabled.
3. **The 10 backup codes, shown only once.**
   - "Autentificarea în doi pași e activă." (neutral, with an icon).
   - The codes: 8 digits in two groups.
   - "Descarcă" (file `ventora-coduri-de-rezerva.txt`) and "Copiază".
   - The required tick "Le-am salvat într-un loc sigur". "Continuă" is disabled until it is ticked.

"Ieși din cont" stays available on steps 1 and 2. It is not a skip: at the next sign-in the flow starts again.
