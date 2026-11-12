# CampaignKitSeries

CampaignKit — recurring and multi-step campaigns (S146, plan §5.2). Keys `marketing.ser.*` in `i18n/marketing.json`, 6 languages.

**Campaign type** at the "Când pleacă" step of Campanie nouă: O singură dată / Recurentă / În mai mulți pași (radio cards).

**Recurring.** How often (weekly / monthly), the day, the time, until when (a date, a number of times, until stopped); the audience is recalculated for each send; the next three sends are listed.

**Multi-step.** Up to 5 messages (e-mail or SMS) with pauses of 1–30 days, optionally only for those who didn't click the previous step; at 5 a neutral Notice. Stops for a contact: they book in EasyBook, they click the main button, and always when they unsubscribe or withdraw consent (locked).

**A running series.** Where the contacts are (per step), "Pune seria pe pauză", "Oprește seria" (Dialog, danger: nothing more leaves, it can't be resumed, duplicate to start again).

The frequency cap applies to every message of a series. Shown at 1280, 820 and 390, light and dark, with a DE / IT test.

**DE DECIS (S146).**
- **Steps and automations.** Recommendation: multi-step campaigns are for one audience chosen once; the predefined automations (CampaignKitAutomations) stay for triggers (subscribe, birthday, reactivation).
- **A recurring campaign and approval.** Recommendation: a member's series is approved once, as a whole; changing the content sends it back to approval.
