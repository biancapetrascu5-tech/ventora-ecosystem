# ClientDeskAutomations

ClientDesk — automations (S133, CR.13). Romanian only for now; keys `crm.auto.*` in `i18n/crm.json`. Visual reference: HubAutomations.

**Only predefined automations**, switched on or off by the business — no free builder ("Spune-ne ce îți lipsește din „Suport”"). The six: new unassigned lead → round-robin; lead with no reply for 24 h → task; deal stuck 14 days → task; deal won → tag "Client" + follow-up task after 7 days; client inactive 90 days → segment "Reactivare"; site form → new lead + confirmation e-mail ("Trimite e-mail"). Each row: what triggers it, what it does, its setting in one line, last run and runs in 30 days, "Setări", the toggle.

**Settings** (Drawer): on / off (applies from now on, not backwards), when, what it does, last run, runs; simple settings — the members of the rotation (skip who is on leave), the template (transactional only) and the owner for the form automation, with the note that a confirmation is transactional.

**Run history.** Filter by automation and result; for whom, what it did, when, result: "Făcut", "Sărit" (e.g. "Fără consimțământ pentru e-mail"), "Eșuat" (e.g. "Adresa de e-mail nu există"). Commercial e-mails skip contacts without consent and those on the suppression list.

**States.** None switched on (with the two recommended ones); switched on (Toast).

Shown at 1280, 820 and 390, light and dark.
