# BookingFiscal

EasyBook — the fiscal printer (AMEF) through the "EasyBook Punte" bridge app (S128). Romanian only for now; keys `booking.fiscal.*` in `i18n/booking.json`.

**Setup.** Setări · Integrări · "Casa de marcat", in three steps:
1. Download EasyBook Punte (Windows, macOS) on the reception computer the printer is plugged into; the page waits for it, then shows "EasyBook Punte e pornită pe RECEPTIE-PC · versiunea 1.2.0".
2. Link the printer: model, connection (USB, serial COM, network IP), port, operator, the VAT group the services go into (from the printer; ask the accountant).
3. Print a non-fiscal test receipt. Ready: status, model, bridge, "Dezleagă casa de marcat…".

**"Finalizează programarea".** What is charged (service, the deposit paid online subtracted), what's due now, how they pay (cash, card at the location, split), "Emite bonul fiscal" on the reception printer. Done: "Am emis bonul fiscal nr. 0458."

**Errors.** The printer doesn't answer; no paper; EasyBook Punte unreachable (computer off or offline). Each with "Reîncearcă" or "Finalizează fără bon": the booking is closed and marked "Bon de emis", in a list of receipts to issue by hand.

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S128).**
- **Supported printers.** Recommendation: start with the Datecs models most common in salons, then Tremol and Daisy; the list in the bridge grows with demand.
- **Receipts for online payments.** To confirm with the accountant: whether a deposit paid online by card needs a receipt at payment or the full receipt at the visit (drawn: the full receipt at the visit, deposit subtracted).
- **Fiscal printer vs S127.** S127 recommended that EasyBook doesn't issue receipts; with the bridge it can, optionally. Recommendation: optional, from Business; without it the salon keeps its own printer.
- **The bridge offline.** Recommendation: never block closing a booking; "Bon de emis" plus a daily reminder.
