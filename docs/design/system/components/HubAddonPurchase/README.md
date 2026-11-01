# HubAddonPurchase

The extra-pack purchase flow over the plan screen, at desktop (review with a saved card), tablet (processing; payment refused) and phone (success with the limit rising; no saved card — the place of Stripe's form), in light and dark. On phones the dialog is a bottom sheet with full-width buttons above the bottom bar.

After the product review: a card that expires this month is flagged before paying; the default quantity is what covers the need, not the maximum; after success the main button resumes what the person was doing.

**Paid, invoice on its way (S111).** When the payment went through but SmartBill hasn't issued the invoice yet: "Plata a reușit", "Pachetul e activ și limita a crescut deja.", the before/after usage, and one neutral line with a clock, "Factura ți-o trimitem pe e-mail imediat ce e emisă, de obicei în câteva minute." No "Vezi factura", nothing that suggests a problem with the payment. Keys in `i18n/commercial.json` (`billing.purchase.*`).
