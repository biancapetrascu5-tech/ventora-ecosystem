# BookingSmsSettings

EasyBook — Settings · "Trimitere SMS": how the business's SMS leave (Ventora, the business phone, or off), the business phone's live state, what happens when the phone isn't available, and the sending hours. A new tab of BookingSettings, between "Reamintiri" and "Rezervări online". Built only from existing components (SheetSection, RadioGroup, StatusDot, Stat, Toggle, DatePicker, Notice, UsageMeter, AccessBadge, Dialog, Toast).

Shown at 1280, 820 and 390, light and dark, with every state from SPEC_ECRANE_SMS §1 below the screens, and a German (820) and Italian (390) label test.

**Sections.**
- *Cum pleacă SMS-urile* — RadioGroup with descriptions: "Prin Ventora", "De pe telefonul afacerii", "Dezactivat".
- *Telefonul afacerii* — name (renamable), number, StatusDot (S8: "Conectat" neutral and filled; "Deconectat" peach only with messages waiting; "Niciun telefon conectat" a hollow ring), battery, signal, app version; today's four Stats (each opens the message list filtered): "Trimise azi", "În așteptare", "Fără confirmare", "Nu au plecat"; the sending capacity and tomorrow's load; "Trimite un SMS de probă", "Conectează alt telefon", "Deconectează telefonul" (with a confirmation), "Vezi toate mesajele".
- *Dacă telefonul nu e disponibil* — no backup by default; e-mail backup (free); backup through Ventora (S14: consumes the plan's SMS, asks for confirmation; "Fără confirmare" messages never go out again this way).
- *Ore de trimitere* — the sending window (09:00–20:00) and the window for day-before reminders (10:00–19:00), spread over the whole interval.

**States.** No method chosen · through Ventora (UsageMeter) · phone not connected yet · disconnected with messages waiting (the only peach case) · low battery · old app on the phone · tomorrow over capacity · member (read-only) · EasyBook app manager (S12: test SMS, rename, hours) · not in the plan (AccessBadge + who decides + "Cere alt abonament" for the owner) · off (S13) · confirm backup through Ventora · confirm disconnect · test SMS sent (Toast).

**Roles (S12).** Owner and admin change everything. The EasyBook app manager sees the state, sends a test SMS, renames the phone and changes the hours. Members only see the state.

**Not here (§11).** No commercial offer, no technical terms, no option to send marketing messages from the business phone.

**Corrections after review (25 Oct 2026, S20–S24).** "Vezi ce poți face" opens a Dialog with four checks on the phone, then "Conectează alt telefon" and "Trimite un SMS de probă". Waiting messages expire at their time, and the disconnect dialog says so. Capacity numbers follow ~40/hour (420 reminders vs ~360). "Prin Ventora" buy button is "Cumpără un pachet în plus · {preț}" for the owner only; admin and manager get "Recomandă un pachet în plus"; members get no action. Stats are 4 in a row on desktop and tablet, 2×2 on phone. Email reminders link to the Reamintiri tab.
