# FounderAutomations

Founder · "Automatizări" (D4-23, D4-24): the builder (trigger → conditions → steps, whitelist only), turning an automation on or off per business with a reason in the audit log, and the run log. A new Spine entry "Automatizări" under "Sistem". Romanian only (S57); keys `founder.automations.*` in `i18n/founder-automations.json`, the automations' names in `i18n/automations.json`.

**The 6 v1 automations** (real examples on every screen): Mulțumire după programare (2 hours after "Încheiată", with the review request); Reactivarea clientului inactiv (after X weeks set by the salon); La mulți ani (optional discount); Alertă: client cu „Risc ridicat” (owner); Rezumatul zilei (each member, 07:00); Limita aproape atinsă (a quota over 80%, the same notification as S115). The reminder before an appointment belongs to EasyBook, not here.

**Builder.** Name; trigger and when (Select, whitelist only); conditions (all must hold; otherwise the run is skipped and the log says why); steps (they only send messages or notifications, never change data); "Adaugă un pas" lists only the whitelist; "Salvează automatizarea", "Trimite un test pe adresa mea"; businesses get the new version at the next run.

**Per business.** Who has it on, the business's own setting, since when and the audit line ("{who} a pornit-o pe {date} · motiv: …"); "Pornește…" / "Oprește…" open a Dialog with "Motiv" (required) and the support reference (optional). The UsageMeter of automated messages for the business.

**Run log.** All / Reușite / Eșuate / Sărite, with the reason ("Clientul nu are adresă de e-mail", "Adresa respinge e-mailurile…", "Limita de mesaje automate a afacerii e atinsă"); a failed run has "Rulează din nou".

**Decided (S116, 4 Nov. 2026).**
- S116-D19 · The whitelist is the triggers and steps shown; steps only send messages, never change data.
- S116-D20 · The UsageMeter counts messages sent; skipped runs do not count.
- S116-D21 · "Limita aproape atinsă" is the same mechanism as the S115 notification, not a second message.

Shown at 1280 and 390, in light and dark.
