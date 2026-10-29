# FounderOwnerRecovery

Recovering an owner's access (Lotul 2.5c, docs/ops/PROCEDURA-RECUPERARE-OWNER.md), from the business page (S95; FounderBusiness → "Mai multe" → "Recuperează accesul proprietarului"), in a Drawer (full screen on phones). Romanian only (S57); keys `founder.recovery.*` in `i18n/founder-support.json` (approved, S98).

**Fields (S87).**
- "Proprietarul": a Select of the business's active owners.
- "Referința cererii" (the request on support@ventorasystems.com): required, at most 255 characters (S93).
- "Motiv": required, 10–1.000 characters with a counter (S93); goes into the business log.
- "Verificări", three Checkboxes: e-mailul contului (the request comes from the account address, or the owner answered our e-mail sent to it, S98); telefonul afacerii (the number from the contract or invoicing, never the one in the request); confirmarea scrisă a altui admin activ.
- "Adresa contului e compromisă" (Toggle): the e-mail check is disabled and doesn't count; phone + admin become required.
- The rule, live under the checks: at least 2; with a compromised address, phone + admin. Lime "Verificările respectă regula." when it holds.
- "Am verificat identitatea conform procedurii".
- "Ce resetăm": B "2FA și parola" (default; a link for a new password, valid one hour) or A "Doar 2FA" (only if the owner confirmed by phone that they have the password).
- "Codul tău de autentificare": the Founder's current code.
- "Recuperează accesul" (danger) stays disabled until the rule holds, identity is ticked and the code has 6 digits; the server checks the rule again.

No fields for documents, screenshots or e-mail contents: nothing is stored.

**Confirmation.** A danger Dialog "Recuperezi accesul pentru {ownerName}?": the owner's sessions close; two-step sign-in is erased and set up again at the next sign-in; with B the password is erased and a link for a new password, valid one hour, goes to the owner's address; the action goes into the business log.

**States.** Empty (disabled), filled, compromised address without the admin (rule not met), compromised with phone + admin and variant A, confirmation, wrong code ("Codul nu se potrivește…"), too many wrong codes (5 → locked 15 minutes, with the time, as S61), refused by the server ("Verificările nu respectă regula" — nothing changed), sending, done with B and with A (what happens next for the owner).

Shown at 1280 and 390, in light and dark.
