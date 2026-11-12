# ClientDeskConsent

ClientDesk — consent per channel and unsubscribe (S133, CR.15). Romanian only for now; keys `crm.consent.*` in `i18n/crm.json`. Extends the consent section of ClientDeskContact.

**On the contact.** Marketing e-mail, SMS and WhatsApp, each: "Dat" / "Retras" / "Necunoscut"; source (site form, EasyBook booking — a separate box, unticked by default, import with proof, manual with a reason); when; the text accepted; "Retrage" or "Înregistrează". The history of changes (when, what, source, who). Booking messages and replies to requests need no consent.

**Recording** (Dialog): source, reason and proof (FileUpload) and the text are required — without them "Dat" can't be set (field errors and a Notice). **Withdrawing** (Dialog): anyone, at once, no proof; the contact leaves sequences and commercial automations immediately.

**Public unsubscribe page** (no login, "dumneavoastră"): the business's name and address, the channels as boxes, "Nu mai vreau nimic de marketing", "Salvează", the note that booking messages keep coming; confirmation with "M-am răzgândit".

**Suppression list** (owner and admins): addresses and numbers with the reason (unsubscribed, bounced, reported as spam) and where it came from; the business can't remove them — only the person, subscribing again from a form; three bounces in a row add an address automatically.

Shown at 1280, 820 and 390, light and dark.
