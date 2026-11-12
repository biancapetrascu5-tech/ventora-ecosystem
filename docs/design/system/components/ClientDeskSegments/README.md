# ClientDeskSegments

ClientDesk — segments (S130, CR-UI.2). Romanian only for now; keys `crm.segments.*` in `i18n/crm.json`.

**Save as segment** (Dialog from the filtered list): name, the rules (RuleBuilder, starting from the applied filters), "Se potrivesc acum: 312 contacte", who sees it ("Doar eu" / "Toată echipa"). A segment updates itself: new contacts that match go in, those that no longer match go out.

**Criteria** (the only ones that exist): client state, source, tag, owner, last visit, date added, company, marketing consent per channel, birthday. The EasyBook "Risc ridicat" note, blocked clients and health data can never be used — they are not criteria.

**The list.** Name, rules in one line, number of contacts now, who created it; the predefined segment "N-au mai venit de 60 de zile" (badge "Predefinit", created by ClientDesk; you change only the days); row menu: open, edit, copy, delete.

**The predefined segment.** "Câte zile" (7–365) and the live count; the list (last visit, owner, phone) with selection; "Folosește segmentul": export, a CampaignKit campaign; "132 dintre ei au acceptat e-mailuri de marketing. O campanie ajunge doar la aceștia." Nobody matches: "Nimeni nu se potrivește acum".

**Edit** (Drawer): name, rules, count, who sees it, delete.

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S130).**
- **The RuleBuilder heading.** Done in S139: `subject="contact"`, "Contactul trebuie să îndeplinească"; the count is shown by the screen, not by `estimate`.
- **Days for the predefined segment.** Recommendation: 60 by default, changed per business, 7–365.
- **Who sees a segment.** Recommendation: "Toată echipa" by default; a member sees in it only their contacts and the unassigned ones.

**S139.** RuleBuilder now reads "Contactul trebuie să îndeplinească" (`subject="contact"`).
