# BookingOnlineSettings

EasyBook — Setări › Rezervări online (S146). One screen that gathers what the public page does, from decisions already taken (S116, S125, S127, S129, B.7b); the S144 help articles point here. Keys `booking.online.*` in `i18n/booking.json`, 6 languages; the setup steps reuse `onboarding.guide.s.*`, the save bar `booking.payments.save` / `.unsaved`.

**Sections.** The booking page (on / off with a StatusPill, the link with "Copiază linkul" and "Previzualizează", "Descarcă codul QR"); which services appear online (DataTable: service, who does it, an online toggle; a service nobody does is "Ascuns online" with "Alege cine îl face", S129; a service can be phone only); deposit and guarantee (which services, how much, the card saved as a guarantee, the late-cancellation fee — a Notice says it is never charged automatically, S127; "Schimbă în Plăți și avans"); moving and cancelling by the client (until how many hours before, default 2 h; one online move per appointment; the free-cancellation window comes from Setări › General, S125); booking questions (a link to the S127 builder); blocked clients refused online (locked rule, with the count and "Vezi lista") and "Avans obligatoriu pentru „Risc ridicat”" (B.7b); the message after booking (Textarea, at most 300 characters).

**States.** Not set up (the first 3 steps of the S140 guide not done: the steps with "Făcut" / "De făcut", "Deschide ghidul", the page toggle disabled), on, off (the phone shown to clients, a peach Notice with the date), a member without settings rights (read only, a neutral Notice, everything disabled, no save bar).

Shown at 1280, 820 and 390, light and dark, with a DE (1280) and IT (390) label test.

**DE DECIS (S146).**
- **Confirmation mode and booking limits.** The S144 articles `help.settingsOnline.confirm` and `.rules` say they are set here; they stay in Setări › General (BookingSettings, "Reguli"). Recommendation: keep them in General and correct the two articles in the next text pass; this screen only links the free-cancellation window.
- **The message after booking.** Recommendation: plain text, no links, the same in every language the client picks (the business writes it once).
- **Services online.** Recommendation: the toggle only hides a service from the public page; the team can still book it from the calendar.
