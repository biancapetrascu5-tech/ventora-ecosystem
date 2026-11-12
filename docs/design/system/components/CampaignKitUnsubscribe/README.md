# CampaignKitUnsubscribe

CampaignKit — the public unsubscribe / preferences page (S139, set 3). ClientDeskConsent's public page (same shell: the business's logo, name and address), client-facing ("dumneavoastră"). Romanian only for now; keys `marketing.un.*` in `i18n/marketing.json`.

**Preferences** (from "Preferințe" in any e-mail): the channels — e-mail, SMS (the masked number, 9:00–20:00), WhatsApp; how often — "Ca până acum" or "Mai rar" (at most one message a month per channel) as the alternative to unsubscribing; "Salvează preferințele", "Mă dezabonez de la toate". A Notice on every page: "Mesajele despre programări continuă" — confirmations, reminders and changes are not marketing.

**One-click unsubscribe** (the link in the e-mail footer): "V-am dezabonat", "M-am răzgândit", "Alege alte preferințe", the hint about "Mai rar".

**States.** "Gata, vă scriem mai rar"; unsubscribed from everything (the business can't subscribe them again, only they can); "M-am răzgândit" — a confirmation e-mail before they receive offers again; the link expired (links last 90 days; a new one by e-mail, sent only if the address is on the list).

**SMS.** Replying STOP to the Ventora Systems short number: the confirmation SMS ("Reamintirile pentru programari continua"), not taken from the business's pack.

Unsubscribing goes into the shared suppression list (CampaignKitContacts, ClientDesk). Shown at 1280, 820 and 390, light and dark.
