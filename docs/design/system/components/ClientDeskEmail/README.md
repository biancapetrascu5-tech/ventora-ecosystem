# ClientDeskEmail

ClientDesk — e-mail to a contact (S133, CR.14). Romanian only for now; keys `crm.mail.*` in `i18n/crm.json`. Opens from the contact card (ClientDeskContact, "E-mail").

**Compose** (Drawer): from "Ioana Pavel · Salon Aurora", replies to the member's address, to the contact; from a template or free text; subject and body (variables already filled in); an attachment from the contact's files (no medical data); header, signature and legal footer added automatically; the month's e-mails (UsageMeter). A commercial template for a contact without consent: a red Notice, send disabled, "Alege alt șablon".

**Limit.** Near the limit (1.840 of 2.000): sequences and commercial e-mails will stop. At the limit: they wait until the 1st; replies and automatic confirmations keep going, up to 200 more; "Vezi abonamentele".

**In the history.** Each e-mail with its state: "Răspuns", "Click", "Deschis", "Respins", "Dezabonat", who sent it (a member, an automation, a CampaignKit campaign); the reply text when the mailbox is connected. Not connected: a Notice and "Conectează căsuța". "Deschis" is not guaranteed (images must load).

**As the contact receives it.** Light, desktop and phone: the business's logo and name, the text, the button, the member's signature with where replies go, why they receive it, and the legal footer (company, CUI, address, "Nu mai vreau e-mailuri de la Salon Aurora", "Trimis prin Ventora Systems").

Shown at 1280, 820 and 390, light and dark (the received e-mail is always light).

**DE DECIS (S133, for all of CR.13–15).**
- **Monthly e-mail limit.** Recommendation: per plan (2.000 in the base plan), counted for all e-mails; at the limit sequences and commercial e-mails stop until the 1st, while one-to-one replies and transactional confirmations continue up to +10%; extra e-mails sold as an add-on (like SMS).
- **Open tracking.** Recommendation: the tracking pixel only for contacts with marketing consent; transactional and one-to-one e-mails without a pixel, clicks counted through the link only. "Deschis" is shown as indicative.
- **Who creates sequences and templates.** Recommendation: owner and admins; members use them and enrol their own contacts.
- **E-mail history retention.** Recommendation: the content for 24 months, then only the line (date, subject, state); deleted together with the contact.
- **Sender address.** Recommendation: sent from Ventora Systems' domain with "Membru · Afacere" as the name and replies to the member; the business's own domain is optional and available now (S134).
- **Consent from an EasyBook booking.** Recommendation: only the separate box, unticked by default (drawn this way); the booking alone never gives consent.
- **Suppression list.** Recommendation: the business can't remove an address; only the person, by subscribing again; three bounces in a row add it automatically.
- **Where sequences live.** Recommendation: a Spine entry "Secvențe" under "Afacere" once the feature is on; drawn for now under Contacte.
- **Automatic stop.** Recommendation: always on, not configurable.

**S134 · the business's own domain (optional).** Setări › E-mail: the sender ("Membru · Afacere", replies to the member) and "Domeniul afacerii": the domain, "Verifică", the records to copy (SPF TXT, two DKIM CNAMEs, DMARC recommended) each with its state ("Negăsită încă", "Găsită", "Greșită") and a copy button; states "Neverificat" (until then e-mails leave from Ventora Systems' domain; DNS changes can take 48 hours), "Verificat" (e-mails leave from noreply@salonaurora.ro; checked daily; "Deconectează domeniul"), "Verificare eșuată" (which record is missing or wrong; sending falls back to Ventora Systems' domain). Note for an existing SPF record: add the include, don't add a second record.
