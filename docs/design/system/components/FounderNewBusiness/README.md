# FounderNewBusiness

New business + owner invitation in one step: business, plan (always the current version), optional 14-day trial without a card, included apps, owner name and e-mail. The invitation preview shows exactly the e-mail the owner receives; accounts are created only from invitations.

**Currency and billing (S113).** "Moneda afacerii" (Lei / Euro): every price, invoice and payment of the business is in this currency, in any interface language; it cannot change after the first invoice. "Plata" (Lunar / Anual): the plan list shows the price for the chosen currency and billing, the yearly one with the saving. The invitation states the price. Keys `founder.new.*` in `i18n/founder-pricing.json`.

**What the business buys (S117).** "Ce cumpără": a bundle (only those on sale now, or "Fără bundle"), individual apps (apps in the bundle are shown included and can't be added again), the currency and monthly / yearly. A summary lists each line with its price, the total, the implementation paid once at the first invoice, and the team seats. The invitation says what the owner gets and what they pay. The second board shows a business in euro, yearly, with three individual apps and no bundle. Keys `founder.new.*`.

**Layout (S119).** "Începe cu 14 zile de probă" is centred on the height of the "Bundle" field's box, not on the line of its helper text.

**Billing data (S121, D-3.6-1).** A section "Date de facturare" before "Ce cumpără", with the form shared with FounderBillingProfile: persoană juridică / fizică, company name, CUI checked for the RO format and control digit, Nr. Reg. Com., address, invoice e-mail. "CUI" moved here from "Afacerea". The second board has a company from Germany ("Cod de TVA", "Nr. de înregistrare"); a third board shows the errors. Keys `founder.billingProfile.*` in `i18n/founder-commercial.json`.
