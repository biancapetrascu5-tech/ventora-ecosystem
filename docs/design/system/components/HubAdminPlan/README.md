# HubAdminPlan

Business administration — plan and usage: the current plan and its apps, the card used for purchases (brand and last four digits, or "Adaugă card"), this month's usage with UsageMeter (normal, near the limit with "Cumpără SMS-uri în plus", at the limit with buy + "Cere alt abonament"), extra packs the owner buys with the card ("Cumpără · 49 lei") or requests ("Doar la cerere", or no saved card → "Cere activare"), and invoices for both the subscription and each purchase.

Shown at 1280 (desktop), 820 (tablet portrait) and 390 (phone), in light and dark; tablet/dark shows a business without a saved card. Click "Cumpără" to open the purchase dialog.

After the product review: usage that needs action comes first; the estimate "La ritmul de acum, ajungi la limită pe 27 octombrie." appears only when there is enough data to be sure; the pack that solves a usage above 80% is offered first, in a GrowthSlot; each invoice has "Descarcă" in the row; "Cere alt abonament".

**Without the Growth Engine (S111).** Until the Growth Engine ships: no GrowthSlot and no recommendations. Nothing takes their place — "Pachete în plus" starts right under its description, so there is no gap. The pack that solves a usage above 80% stays first in the list, with a factual line under it: "Ai folosit 862 din 1.000 luna aceasta." The UsageMeter near the limit keeps its own "Cumpără SMS-uri în plus". The newest purchase whose invoice isn't issued yet shows "Factura se emite" (neutral) instead of "Plătită" and the download. Keys in `i18n/commercial.json`.

**S112.** The members quota is "Locuri în echipă" (DE "Teamplätze", IT "Posti nel team"); the pack is "5 locuri în echipă în plus".

**How the business pays (S113).** "Plătești lunar: 349 lei · următoarea plată pe 17 noiembrie 2026". Usage starts from zero on the subscription's day of the month, not on the 1st: the section is "Consum: 17 oct. – 16 nov." with "Consumul pornește de la zero pe 17 noiembrie."; one-time packs are "valabil până pe 16 noiembrie"; invoices cover "17 oct. – 16 nov.". Yearly payment, discounts, the invoice lines and pro-rata purchases are drawn in HubPlanBilling.
