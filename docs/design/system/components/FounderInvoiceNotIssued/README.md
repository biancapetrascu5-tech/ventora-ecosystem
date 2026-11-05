# FounderInvoiceNotIssued

An invoice that was not issued (D-3.6-4, D-3.6-5, S121): the payment went through, but e-Factura rejected the invoice. Part of FounderBusinessBilling ("Plăți și facturi"); the case also shows in FounderOverview · "Au nevoie de tine". Romanian only (S57); keys `founder.billing.status.notIssued`, `founder.billing.notIssued.*`, `founder.billing.manualIssue.*` in `i18n/founder-commercial.json`.

**The row.** Status "Nu s-a emis" (peach: it needs you), no invoice number. Row menu: "Reîncearcă", "Am emis-o manual…". Above the table, a Notice "Factura pentru {what} nu s-a emis" with the amount, the payment date and the reason from e-Factura, and "Corectează întâi datele de facturare, apoi reîncearcă." when the reason is in the billing data.

**Retry.** "Se reîncearcă…" (the pill spins). It fails again: a Notice with the reason and the way out. It works: the row becomes "Plătită" with the invoice number; Toast "Factura s-a emis: {invoice}. Afacerea o primește pe e-mail."

**Issued by hand.** A Dialog "Ai emis manual factura pentru {business}?": what, amount, payment date; "Seria", "Numărul", "Data emiterii", "Motiv" (required, at least 10 characters, into the business log); what happens next. Errors: a series and number already used, a reason too short. Done: status "Emisă manual" (neutral) with the series and number; Toast "Am trecut factura {invoice} ca emisă manual."

Shown at 1280 and 390, light and dark.

**Aligned with FounderBusiness and FounderDiscounts (S122).** Breadcrumb "Afaceri › Salon Aurora" (not on a phone); the tabs sit in the PageHeader, as in FounderDiscounts. The purchase history is the standard DataTable of InvoiceHistorySection, automatic widths: "Ce" (primary), "Data" (secondary), "Sumă" (right-aligned, optional), "Factura" (optional), "Stare" (trailing). Paid rows have no actions; only "Nu s-a emis" has "Reîncearcă" and "Am emis-o manual…".
