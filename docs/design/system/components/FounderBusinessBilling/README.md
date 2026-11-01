# FounderBusinessBilling

The commercial part of one business in Founder Control Center (S111): the "Plăți și facturi" tab of FounderBusiness. Romanian only (S57); every text is a key in `i18n/founder-commercial.json` (`founder.billing.*`).

**Abonament.** The plan, the price, the renewal date and how it is paid: "Plătește cu cardul Visa ···· 4242" or "Plată manuală, prin transfer bancar". With manual payment and an open invoice, a peach Notice "Factura {invoice} așteaptă plata prin transfer" (amount, issue date, due date) with "Confirmă încasarea".

**Istoricul cumpărărilor.** A DataTable, newest first: what, date, amount, how it was paid, the invoice number and the status — "Plătită" (lime), "Așteaptă plata" (peach), "Rambursată", "Stornare", "Factura se emite" (neutral: the payment went through, SmartBill hasn't issued the invoice yet). Row menu: "Vezi factura"; "Confirmă încasarea…" for an invoice waiting for a transfer; "Rambursează…" for card payments.

**Refund.** A danger Dialog "Rambursezi {amount} către {business}?": the payment (what, date, card, invoice), what happens — the money goes back to the card, usually in 5–10 working days; the storno invoice is issued and the original stays in the history as "Rambursată"; the pack stops and the limit goes back to the plan's — and "Motiv" (required, 10–1.000 characters, into the business log). States: missing reason, refunding (button `loading`), Stripe refuses (Notice danger, nothing changes), done (Toast "Am rambursat {amount}. Factura de stornare {storno} e emisă."; the row is "Rambursată" and the storno invoice appears on top).

**Confirming a bank transfer.** For a subscription on manual payment: "Confirmă încasarea pentru {invoice}", with "Data încasării" and "Suma încasată" (filled with the invoice amount). If the amount differs, a peach Notice says so and asks to confirm only when the whole sum arrived. The invoice becomes "Plătită", the subscription goes on, the action goes into the log; Toast "Am confirmat încasarea pentru {invoice}."

Shown at 1280 and 390, in light and dark.

**Discounts (S113).** The tab gets "Reduceri active" with "Adaugă o reducere" and "Încheie reducerea" in the row menu; drawn in FounderDiscounts. Discounts apply to the next invoices; issued invoices never change.
