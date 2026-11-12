# CampaignKitAutomations

CampaignKit — Automatizări (S138, set 2). Romanian only for now; keys `marketing.au.*` in `i18n/marketing.json`.

**D-CK-12.** A neutral Notice on top: while CampaignKit is active, marketing messages to clients leave only from here; "Ne-a fost dor de dumneavoastră" from ClientDesk moved here; booking, deposit and invoice messages stay in EasyBook and ClientDesk.

**Predefined, on / off** (the ClientDeskAutomations row: icon, title, channel badge, what it does, when, last run): Bun venit după abonare, Ziua de naștere, Reactivare (after X days without an EasyBook visit), După prima programare EasyBook, Coș abandonat la pachete ("Necesită pachetele EasyBook", disabled when packages aren't active).

**Settings** (Drawer): on, the moment (days without a visit; on the birthday or before), the channel, the hour (SMS only 9:00–20:00), the template (from the CampaignKit templates), an optional promo code (EasyBook promo codes), "Respectă plafonul de frecvență" (2 marketing messages in 7 days), who it reaches, last run, sent in 30 days. Withdrawing consent takes a person out at once.

**History of runs** (Drawer): sent in 30 days, how many booked within 14 days, skipped, unsubscribed; per run: people in, sent, skipped (no consent, over the cap, sending off, bounced), result. Kept 12 months, numbers only.

**States.** Turned on (Toast: the first run is tomorrow; nothing leaves until real sending is turned on).

Shown at 1280, 820 and 390, light and dark.

**S139 · birthday and special dates.** A sixth predefined automation, "Aniversarea primei vizite" (a year after the first completed EasyBook booking). "Ziua de naștere și datele speciale" (Drawer): how many contacts have a date of birth (day and month are enough; without the year they still get the message), where it comes from (ClientDesk card, the optional EasyBook booking field, CampaignKit forms), "Cere data nașterii în formularul de abonare"; the first-visit anniversary toggle; the business's own dates (8 martie, 14 februarie, the salon's anniversary) as reminders 10 days before to prepare a campaign — nothing is sent on its own. The date of birth is optional for the client, not in reports, never used for age.
