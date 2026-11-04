# BookingDeposit

EasyBook — the deposit through Stripe inside the public booking (S116 b): the amount, what is left to pay at the salon and the salon's deposit policy are shown before paying; then success, failure and "Așteaptă plata". Keys `booking.deposit.*` in `i18n/booking.json`, 6 languages.

**The payment step.** "Prețul serviciului / Avans, acum / La salon", the three policy lines (refund within the free-cancellation window, kept after it or on a no-show, always refunded when the salon cancels), the checkbox "Am citit politica salonului pentru avans." (unchecked: "Plătește 50 lei" stays disabled), the card form in `StripeSlot`, "Plata e procesată de Stripe. Salon Aurora nu vede datele cardului." and the hold timer (15 minutes).

**States.** Bank confirmation (3-D Secure); failed ("Nu s-a retras niciun ban." + the bank's reason, "Încearcă din nou"); paid (the appointment becomes "Confirmată"); waiting for payment (the client closed the page; the status "Așteaptă plata" until the hold ends, the e-mail brings them back); expired (the time is released, "Alege altă oră").

**Decided (S116, 4 Nov. 2026).**
- S116-D4 · Payment in the page (Stripe Payment Element in `StripeSlot`), no redirect to Stripe Checkout.
- S116-D5 · The time is held 15 minutes while the client pays.
- S116-D6 · "Păstrează cardul pentru plățile următoare" is off for clients of a business.

Shown at 1280 and 390, in light and dark, with DE/IT and EN/FR/ES tests.
