# FounderSetupRequests

Requests with implementation (lot 3.8, proposed, S121): an app the team sets up for the business before it starts. Drawn as the parts FounderRequests gets: the row in the list and the detail. Romanian only (S57); keys `founder.setup.*` in `i18n/founder-commercial.json`. The owner's side is HubSetupRequest.

**States.** Cerută → Acceptată de client → Confirmată de echipă → Plătită → În lucru → Pornită; plus Anulată (before payment) and Rambursată (after payment). Peach when the next step is the team's (Cerută, Acceptată, Plătită); neutral while it waits for the client; lime when it is live.

**The detail** (Drawer): the steps, what the business pays ("Implementare: {amount}, o singură dată, înainte de lucru"; "Mentenanță: {amount} pe lună, din ziua în care pornește aplicația") and when the app's subscription starts. The next step and its button:
- Cerută: "Trimite oferta" (implementation, maintenance, estimated start, a message for the client);
- Acceptată: "Confirmă" the start date;
- Confirmată: waits for payment; "Retrimite linkul de plată";
- Plătită: "Începe lucrul";
- În lucru: "Pornește aplicația".

**Going live.** Dialog "Pornești {app} pentru {business}?": the app appears in the Hub; its subscription starts today, the first payment now, prorated to the renewal date. Toast with the owner's notification and e-mail.

**Cancelling.** From the menu: "Anulează cererea…" before payment, "Anulează și rambursează…" after it (also while "În lucru") — the payment goes back to the card with a storno invoice; "Motiv" is required and the owner sees it in the Hub and by e-mail.

Shown at 1280 and 390, light and dark. The subscription start and the refund rule are "DE DECIS" in the README decision register (S121).

**DE DECIS (S121).**
- **When the app's subscription starts.** Recommendation: on the day the team presses "Pornește aplicația", not when the implementation is paid (drawn this way); the first payment is prorated to the renewal date.
- **Refund on cancel.** Recommendation: the whole implementation, with a storno invoice, until the app is live (also while "În lucru"; drawn this way); after it's live, no refund from this flow, only through Suport. Alternative: full refund only until "În lucru".
