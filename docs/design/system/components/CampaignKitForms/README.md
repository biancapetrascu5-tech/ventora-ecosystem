# CampaignKitForms

CampaignKit — Formulare (S138, set 2). Romanian only for now; keys `marketing.fm.*` in `i18n/marketing.json`.

**The same engine as ClientDeskForms** (shared in Core): fields, publishing (link, embed), anti-spam and the monthly limit are the same; "Câmpuri" and "Publicare" are drawn in ClientDeskForms. CampaignKit forms add marketing contacts.

**The list.** Name and where it lives, submissions (30 days), new contacts, double opt-in ("Cu confirmare"), state.

**After submitting.** A submission creates (or completes) a marketing contact, puts it in a list with a tag, and — when ClientDesk is active — "Și lead în ClientDesk" (with who takes it); without ClientDesk the toggle is off and explains why. Someone who doesn't tick consent becomes a contact but gets no campaigns.

**Consent.** "Dublu opt-in" (on by default here): a confirmation e-mail, and the subscription starts only after the button in it. One consent tick per channel (e-mail, SMS), separate, never pre-ticked, never required (locked rule); their texts name the business.

**The public form** (client-facing, "dumneavoastră"): first name, e-mail, phone (only for SMS), the two ticks, "Mă abonez", the privacy line; a wrong address; "Verificați e-mailul" (resend); the confirmation e-mail ("Confirm abonarea", "Dacă nu ați cerut asta, ignorați e-mailul"); "Gata, v-ați abonat".

**States.** Empty ("Niciun formular de abonare").

Shown at 1280, 820 and 390, light and dark.

**S146 · Publicare.** The "Publicare" tab, in CampaignKit's style: "Publicat din {data}", the form link with "Copiază linkul" and the QR code, "Pe site-ul tău" with the embed code (a code block, "Copiază codul", "Previzualizează pe o pagină de test"), the domain it works on; a draft has no link or code yet (`marketing.fm.pb.*`, 6 languages). The same link, code and QR were already in ClientDeskForms (S134). DE / IT test.
