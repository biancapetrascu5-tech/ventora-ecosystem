# ClientDeskForms

ClientDesk — public forms (S134, CR.17). Romanian only for now; keys `crm.forms.*` in `i18n/crm.json`. Under Leaduri › Formulare; the public page follows BookingPublic.

**The list.** Name, fields, submissions in 30 days, conversion lead → deal, state ("Activ" / "Oprit"); menu: edit, publish, submissions, stop / start, delete. All forms have the background anti-robot check and a submission limit.

**The editor** (tabs):
- **Câmpuri:** basic data and the business's own fields ("Câmp al afacerii"), required / optional, order, remove; the name is required plus phone or e-mail; no medical fields (they don't exist in ClientDesk); "Mesaj" goes on the lead as a note.
- **După trimitere:** a new lead with source "Formular site · {form}", owner or rotation, tags, the transactional confirmation e-mail (template), optionally a deal in "Contact nou"; the thank-you message or a redirect.
- **Consimțământ:** separate boxes, unticked by default and optional, for marketing e-mail and SMS (SMS only if the form asks for the phone); the text editable within Ventora's rules (channel and business name, at most 160 characters); the privacy-policy link; the text ticked, date, time and form are saved on the contact.
- **Publicare:** the hosted page (the business's logo and colour), the embed code, the QR code (PNG, SVG), the anti-robot check with no visible CAPTCHA, submissions per hour from the same address (over it → Spam).

**The public page** ("dumneavoastră"): the business's name and address, the title and lead, the fields, the two unticked boxes ("Bifele sunt opționale"), "Trimite cererea", the privacy line; field errors with a summary; sent ("V-am trimis o confirmare la…"); a stopped form ("Ne puteți suna la…").

**States.** No forms; the plan limit (5 active, "Formular nou" disabled); submissions marked as spam (why: anti-robot, over the limit, many links; "Nu e spam: creează leadul"; deleted after 30 days).

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S134, forms and reports).**
- **Forms per plan.** Recommendation: 5 active forms in the base plan, unlimited stopped ones; more in the larger plan.
- **Unconverted submissions.** Recommendation: leads from forms that are never converted are deleted after 12 months (like disqualified leads); spam after 30 days.
- **A form that creates a deal directly.** Recommendation: allowed only as an option per form (off by default), for offer forms; otherwise the deal is made when the lead is converted.
- **Who sees reports.** Recommendation: owner and admins everything; a member only their own numbers and no Contacte / E-mail tabs.
- **Report export.** Recommendation: numbers only, owner and admins, written to the log.
- **Conversion and open rates.** Recommendation: "opened" stays indicative and is counted only for contacts with marketing consent.
