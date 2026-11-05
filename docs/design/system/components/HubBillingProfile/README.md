# HubBillingProfile

Hub · Abonament și consum: the data the business's invoices are issued on (D-3.6-1, S121), read-only. Keys `billing.profile.*`, `billing.issuer`, `billing.vatNote` in `i18n/commercial.json`, 6 languages.

**The section.** "Date de facturare": "Factura se emite pe:" (name · persoană juridică / fizică), CUI and Nr. Reg. Com. for a company, the address, the invoice e-mail. Under it: "Datele le schimbă echipa Ventora Systems, ca facturile să rămână corecte. Schimbarea se vede de la următoarea factură."; "Facturile le emite Ventora Systems SRL, Sibiu." and the VAT line (a proposal, to confirm with the accountant).

**"Cere o schimbare".** A Dialog "Ce vrei să schimbi în datele de facturare?" with "Datele noi" (required) sends a support request; it shows in HubSupport and on the Founder card (FounderBillingProfile). Sent: Toast "Am primit cererea. Îți răspundem la Suport și pe e-mail." and, until the team saves it, "Ai cerut o schimbare pe {date}. O facem în cel mult o zi lucrătoare."

**Who sees it.** The data and the button only for the owner; a member or admin sees one line: "Datele de facturare le vede și le poate cere schimbate doar proprietarul."

Shown at 1280 and 390, light and dark, with a German and Italian test.

**DE DECIS (S121).**
- **VAT line** "Ventora Systems SRL nu este înregistrată în scopuri de TVA: prețurile nu conțin TVA.": a proposal, to confirm with the accountant before it ships.
- **"O facem în cel mult o zi lucrătoare."** Recommendation: the same term as support replies (Founder flags a request with no reply after one working day).
