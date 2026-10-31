# HubCatalogApp

Hub — one app's catalog page: what it does, what it connects to, why it is recommended for this business, and on the side the price, how it is paid, the setup cost and the trial. Owner: "Încearcă gratuit 14 zile" and "Activează · 49 lei pe lună" (both continue in UpgradeDialog); member: "Recomandă aplicația" and who decides.

Shown at 1280 (desktop), 820 (tablet portrait) and 390 (phone), in light and dark, built only from the system's components.

**Direct or on request (S113).** Each app is "Direct" or "La cerere" in Founder (FounderApps). Direct: "Încearcă gratuit 14 zile" and "Activează · 49 lei pe lună" (the payment, with today's pro-rata amount, is in HubAppActivation). On request: the setup cost, a note that the Ventora team sets it up and activates it, no trial, and one button "Cere activare" (a request in Founder · Cereri). Keys `catalog.app.*` in `i18n/pricing.json`.

**Individual app (S117).** The side shows "Mentenanță · 49 lei pe lună", "Cost de implementare · 150 lei, o singură dată" and "Ce include" (the app's limits: "10 campanii pe lună", "2.000 de e-mailuri pe lună"). Keys `catalog.app.maintenanceLabel`, `catalog.app.setupValue`, `catalog.app.includes`, `limits.*` in `i18n/pricing.json`.
