# CampaignKitCampaigns

CampaignKit — Campanii (S137, set 1). Romanian only for now; keys `marketing.camp.*`, `marketing.st.*`, `marketing.ch.*` in `i18n/marketing.json`.

**The list.** Name (with channel and audience under it), channel (E-mail / SMS), scheduled for, short results ("97% livrate · 11,2% click · 0,4% dezabonări", "Trimis 62%", "Oprită după 112 trimise"), state. States: Ciornă, În aprobare, Programată, Se trimite, Trimisă, Pe pauză, Oprită (StatusPill). Filters: search, channel, state, period. Row actions by state: Editează / Deschide, Duplică, Pune pe pauză, Reia, Oprește, Șterge ciorna. On phones the table is a list: name, results, state.

**Pause and stop.** Pause (Dialog): the campaign doesn't leave at its time; it can be resumed (after the date: choose a new time). Stop (Dialog, danger): what was sent can't be taken back; to send to the rest, duplicate it. Both go into the campaign's log.

**The internal approval.** A member's campaign goes to the owner (admins and the owner schedule directly). The owner opens it in a Drawer: channel, audience, how many receive it and how many are excluded, when, subject, the checks, the e-mail preview; "Trimite-mi un test", "Respinge", "Aprobă". Reject (Dialog): the reason is required and reaches the author in the notification and in the campaign; the campaign goes back to draft. Approved: a Toast, the author is notified; until real sending is turned on, the campaign waits.

**States.** Filtered (in approval), duplicated (Toast: a draft with the same content and audience), a member's view, nothing found.

The sample results show how the list will look after sending is turned on. Shown at 1280, 820 and 390, light and dark.

**S146.** The "Calendar" view (month, week) is drawn in CampaignKitCalendar; a campaign's sending progress and failed messages in CampaignKitSending.
