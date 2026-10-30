# FounderTwoFactor

Two-step sign-in in Founder Control Center: the same screens as HubTwoFactorSetup and HubTwoFactorVerify, with the Founder mark: AuthLayout with `brand="founder"` (S63).
- **The panel:** the Ventora mark next to "Founder", "Control Center" and "Instrumentul intern al echipei Ventora". There is no language selector.
- **Required for everyone:** "Contul Founder are acces la toate afacerile, așa că îl protejăm cu un al doilea pas. În Founder e obligatoriu pentru toți."
- **Backup codes:** 8 digits in two groups (S60, S104); a wrong or already used code gets one message (S105).
- **Language:** Founder stays in Romanian (S57), but every text is a key in `i18n/two-factor.json`.
- **Shown:** 1280 and 390, in light and dark — activation step 1 and verification as full screens, then on phone step 2 with a wrong code, step 3, the backup code, locked, and no access.
- **After a sign-in with a backup code (S81):** the same Toast as in HubTwoFactorVerify, shown for the four cases (7, 2, 1 and 0 codes left). In Founder, "Generează coduri noi" opens FounderBackupCodes (S84).
