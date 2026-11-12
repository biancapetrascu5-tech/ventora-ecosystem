# CampaignKitCalendar

CampaignKit — the marketing calendar of campaigns (S146, plan §5.2): a "Calendar" view of Campanii, next to "Listă". Keys `marketing.camp.view.*`, `marketing.cal.*` in `i18n/marketing.json`, 6 languages; days of the week reuse `marketing.so.dow.*`.

**Month** (7 columns, Monday first, today outlined, the grid of CampaignKitSocial) and **week** (one column per day, with the state pill and the series name). Each campaign is a chip: channel icon, time, a series mark for recurring and multi-step campaigns, name. Sundays and public holidays without sending (Setări › Trimiteri) are shaded "Fără trimiteri". A neutral Notice warns when a week would put contacts over the frequency cap. Filter by channel; previous / next / "Azi". On phones an agenda list by day. Empty month: an EmptyState with "Campanie nouă".

**Separate from Calendar postări** (CampaignKitSocial): posts stay there; the description says so.

Shown at 1280, 820 and 390, light and dark, with a DE / IT test.
