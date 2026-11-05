# FounderBillingProfile

The business's billing profile in Founder Control Center (D-3.6-1, S121): the data every invoice of the business is issued on, in FounderBusiness · "Plăți și facturi". Romanian only (S57); keys `founder.billingProfile.*` in `i18n/founder-commercial.json`.

**The card.** "Factura se emite pe" with "Editează datele de facturare": persoană juridică (company name, CUI, Nr. Reg. Com.) or persoană fizică (name), the address (street, city, county, country) and the invoice e-mail. Lead: a change applies from the next invoice; issued invoices stay as they are. On a phone the edit button sits under the data.

**Asked from the Hub.** When the owner sends "Cere o schimbare" (HubBillingProfile), a peach Notice on the card: "{name} a cerut din Hub o schimbare a datelor de facturare", the text and the request number, with "Deschide solicitarea".

**Editing.** A Drawer (full screen on a phone) with the shared form (also used in FounderNewBusiness):
- "Factura se emite pe": Persoană juridică / Persoană fizică.
- A Romanian company: CUI, checked for format (2–10 digits, optional "RO") and the control digit, with "CUI valid" in the field when it passes; Nr. Reg. Com. (e.g. J32/1234/2019).
- A company outside Romania: "Cod de TVA" with the country prefix, not checked by the CUI rule; "Nr. de înregistrare" optional; "Regiune" instead of "Județ".
- A person: name and address only, no CNP (said under the form).
- "Motivul schimbării" (required): goes into the business log; the owner gets an e-mail with the new data.
- Errors: wrong control digit, other format, Nr. Reg. Com., missing e-mail.

**Saved.** Toast "Am salvat datele de facturare. Se folosesc de la următoarea factură."

Shown at 1280 and 390, light and dark.

**DE DECIS (S121).**
- **A person without CNP.** Recommendation: the invoice is issued on name and address, no CNP asked (drawn this way). To confirm with the accountant.
- **Foreign VAT code.** Recommendation: kept with the country prefix, not checked now (no VIES); a VIES check can come later.
