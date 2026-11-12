# ClientDeskSettings

ClientDesk — settings (S132, CR-UI.9). Romanian only for now; keys `crm.settings.*` in `i18n/crm.json`.

**Tabs:** Pipeline-uri, Câmpuri proprii, Etichete și surse, Motive, Scoring, EasyBook și reguli.

**Pipelines.** The pipeline picker (default badge, "2 din 2"; "Pipeline nou" disabled at the limit), its name, the stages in order with name, default probability and the number of deals, move up / down, delete; "Câștigat" (always last, 100%) and "Pierdut" (outside the pipeline, with a reason) are fixed. Deleting a stage with deals asks where to move them.

**Own fields.** Name, type (text, number, amount, date, list, yes / no), required, where they appear (contacts, leads, deals, companies), as a column in the contact list, in the import; "5 din 30 câmpuri". A required field doesn't block old contacts or EasyBook contacts. The note: no fields for medical data.

**Tags and sources.** Tags with how many contacts use them: rename, "Unește cu…" (the contacts get the other tag, segments follow), delete. Lead sources: the built-in ones can be renamed or hidden, not deleted; your own can be deleted.

**Reasons.** Lost reasons (ordered; "Motivul e obligatoriu la „Pierdut”") and disqualification reasons. A deleted reason stays on old deals, leads and reports.

**Scoring.** On / off (off: no score, the inbox sorts by date, the rules stay saved); the rules with points; "Lead „fierbinte” de la 70" (shown in "Au nevoie de tine"). No sensitive data and no EasyBook no-show data in the score.

**EasyBook and rules.** The EasyBook link on / off, with what flows (one way) and what never does ("Risc ridicat", blocked clients, health data). Turning it off asks first: contacts stay as ordinary contacts and start counting toward the limit (with the numbers). The days: deal stuck after 14, client inactive after 90, new for 30, lead with no reply after 24 hours.

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S132).**
- **EasyBook link off.** Recommendation: the contacts stay and count toward the limit (drawn this way); turning it back on relinks them by phone and e-mail. If that puts the business over 3.000, nothing is deleted, adding stops.
- **Own fields.** Recommendation: at most 30; the type is locked once the field has values; a deleted field is kept 30 days.
- **Who changes the settings.** Recommendation: owner and admins only; every change goes into the business log.
- **Built-in sources.** Recommendation: can be hidden, not deleted, so EasyBook and the site form always have a source.

**S133.** Automations (ClientDeskAutomations), e-mail templates (ClientDeskTemplates) and the suppression list (ClientDeskConsent) open from the settings.
