# ClientDeskTemplates

ClientDesk — e-mail templates (S133, CR.14; D-CRM-16: Ventora Systems controls the structure). Romanian only for now; keys `crm.tpl.*` in `i18n/crm.json`.

**The list.** Name, type — "Tranzacțional" or "Comercial" with "Necesită consimțământ" —, where it is used (automation, sequence, by hand), who changed it and when; menu: edit, copy, versions, delete.

**The editor.** The business edits only the name, the type, the subject and the body, with variables (`{prenume}`, `{companie}`, `{responsabil}`, `{link_programare}`) and a fallback when the first name is missing. Fixed, shown locked: the header (the business's logo and name, from the Hub profile), the signature (the sending member's name, role and phone), the legal footer (the business's details and unsubscribe) — it can't be deleted or changed. Preview with a real contact (Mail), "Trimite-mi un test" (not written to the contact's history), "Versiuni" (who, when, what changed; restore; e-mails already sent keep their text).

**States.** Unknown variable (`{link_programre}`: the field error, a Notice, save disabled); a contact without a first name (the greeting becomes "Bună ziua!"); a commercial template (sent only with consent; the others are skipped, with the reason in the history).

Shown at 1280, 820 and 390, light and dark.
