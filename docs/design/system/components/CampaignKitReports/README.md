# CampaignKitReports

CampaignKit — Rapoarte (S139, set 3). Romanian only for now; keys `marketing.rp.*` in `i18n/marketing.json`.

**Tabs.** Campanii, SMS, Automatizări, Postări; period (30 / 90 days, this year), author (owner and admins); "Exportă CSV".

**Campaigns.** Stats: e-mails sent, clicks, unsubscribes, bookings after a click (EasyBook, within 7 days), each against the previous period. The table: campaign (channel, "A/B"), sent, opened*, clicks, unsubscribes, bookings. Monthly trend (clicks and unsubscribes, LineChart) and the comparison of campaigns (clicks, BarChart). *Opens are indicative: measured only for contacts with consent, and some mail apps hide or inflate them — clicks are the measure.

**One campaign** (Drawer): sent, delivered, opened (indicative), clicks, unsubscribes, bounced, complaints, bookings within 7 days of a click; the A/B test (variants, sent, clicks, "Câștigătoare", "Varianta B a plecat automat către restul de 190 de persoane"); clicks per link; clicks per device (phone, computer, tablet); "Duplică".

**SMS.** Sent, delivered, failed (not taken from the pack), STOP; per campaign; why they failed (from SMSLink).

**Automations.** Sent, bookings after the message (14 days), rate, unsubscribes; per automation.

**Posts.** Published, reach and interactions from Meta (up to 48 hours late, only posts published through CampaignKit), failed; per post. Without Meta connected: an EmptyState pointing to the accounts.

**Export.** CSV with figures only — totals per campaign, no names, addresses or phone numbers (the contact list is exported from Contacte); owner and admins only; written to the log.

**A member** sees only their own campaigns (Notice), no export, no author filter.

Shown at 1280, 820 and 390, light and dark.
