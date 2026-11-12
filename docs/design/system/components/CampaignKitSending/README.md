# CampaignKitSending

CampaignKit — a campaign's sending progress and its failed messages (S146, plan §5.2). Opens from "Se trimite" in Campanii. Keys `marketing.snd.*` in `i18n/marketing.json`, 6 languages.

**Progress.** ProgressBar ("934 din 1.506 trimise", 62%), when it started and roughly when it ends, the sending window; Stats: delivered, in progress, failed, skipped (frequency cap or unsubscribed meanwhile); pause / stop as in CampaignKitCampaigns.

**Failed messages.** DataTable: contact, address or number, the reason (address doesn't exist, mailbox full, rejected as spam, number doesn't exist, phone off 48 hours) and whether it is permanent (the address goes on the suppression list) or temporary (2 more tries within 24 hours); filter by reason; "Exportă lista"; "Deschide contactul". Failed messages aren't taken from the pack.

**States.** Sending, finished, no failed messages. Shown at 1280, 820 and 390, light and dark, with a DE / IT test.
