# BookingPayments

EasyBook — Settings · "Plăți și avans" (S116 d): the salon's Stripe Connect account in 4 states and the deposit. Keys `booking.payments.*` in `i18n/booking.json`, 6 languages.

**Stripe Connect.** Neconectat ("Conectează Stripe", 10–15 minutes), În verificare (1–2 working days, clients book without a deposit meanwhile), Activ (company, IBAN ···· 4821, payout delay; "Deschide Stripe", "Deconectează…"), Cu probleme (peach: Stripe paused payments, "Rezolvă în Stripe"; deposits already paid are not affected). The money goes straight to the salon's account; Ventora Systems never touches it.

**The deposit.** "Cere avans la rezervarea online" (only once Stripe is active; appointments made by the team never ask for one); fixed amount or percentage (10–50%, with an example); all services or only chosen ones; "Cere avans clienților cu „Risc ridicat” la orice serviciu"; the 15-minute hold; Stripe's fee. **Refunds:** in full within the free-cancellation window from Settings · Rules (default), or in full any time before the appointment; when the salon cancels, always in full, automatically. "Așa vede clientul" shows the policy lines from BookingDeposit. The unsaved bar from BookingSettings.

**Decided (S116, 4 Nov. 2026).**
- S116-D13 · Stripe Connect Express (Stripe hosts the checks and the dashboard).
- S116-D14 · No Ventora Systems fee on deposits during the pilot.

**To confirm with the lawyer.** A non-refundable deposit option for consumers; it stays out until then.

Shown at 1280 and 390, in light and dark, with a DE/IT test.

**S127 (B.21).** Late-cancellation and no-show fees, and the card as guarantee, drawn in BookingMoney.
