# FounderBackupCodes

"Coduri de rezervă" in Founder Control Center (S84): one minimal page in the Founder shell, opened by "Generează coduri noi" from the toast after a sign-in with a backup code (S81). It reuses the Hub pieces: the 6-digit field and its errors from HubTwoFactorVerify, and the code list with "Descarcă" / "Copiază" and the required tick from HubTwoFactorSetup step 3. Romanian only (S57); every text is a key in `i18n/two-factor.json` (`auth.2fa.codes.*`, plus the existing step-3 and error keys).

**States.**
1. **Codes left:** "Ți-au rămas {n} din 10." and "Când generezi coduri noi, cele vechi nu mai merg.", with "Generează coduri noi".
2. **Confirmation:** "Confirmă cu codul din aplicație" / "Ca să generăm coduri noi, introdu codul care apare acum în aplicația de autentificare.", "Cod de 6 cifre" (numeric keyboard, `autocomplete="one-time-code"`), "Generează codurile" and "Renunță".
3. **Wrong code:** "Codul nu se potrivește. Introdu codul care apare acum în aplicație."
4. **Checking:** Button `loading`.
5. **Too many wrong codes (S61):** Notice danger "Ai încercat de prea multe ori" / "Poți încerca din nou peste 15 minute, la ora {time}.", field and button disabled.
6. **The new codes, shown only once:** "Ai coduri noi. Cele vechi nu mai merg.", the 10 codes (8 digits in two groups), "Descarcă" (`ventora-coduri-de-rezerva.txt`) and "Copiază", and the required tick "Le-am salvat într-un loc sigur"; "Continuă" is disabled until it is ticked.

Shown at 1280 and 390, in light and dark.
