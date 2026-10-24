# AddonPurchase

The dialog in which the business owner buys an extra pack ("pachet în plus") with the card: review → processing → success or error. Plan changes are never bought here — they stay a request ("Cere alt abonament").

**Props.** `addon` `{ name, description, price, icon, max, note }`, `quantity` / `defaultQuantity` / `onQuantityChange` (stepper with − and +, 44px targets on touch), `card` `{ brand, last4, expiry }` or `null`, `onChangeCard`, `cardSlot` (mount Stripe's card Element here when there is no saved card — the system only frames it), `state` (`review` | `processing` | `success` | `error`), `error` `{ title, message }` (from the payment provider, in plain words), `usage` `{ label, used, limitBefore, limitAfter }` (shown on success), `invoice` `{ number, onOpen }`, `onPay(quantity, total)`, `onRetry`, `onUseOtherCard`, `onDone`, `currency`, `format`, plus Dialog's `open` / `onOpenChange`, `inline`, `sheet`.

**States.**
- *Review* — the pack, quantity, total ("Prețul e final, nu se adaugă TVA."), the saved card (only brand and last four digits) with "Schimbă cardul", or — without a card — the framed place of Stripe's form and "Salvează cardul pentru cumpărări viitoare". Buttons: "Renunță" and "Plătește 98 lei".
- *Processing* — spinner, "Nu închide fereastra", the dialog cannot be dismissed, the pay button is busy.
- *Success* — "Plata a reușit", the limit before and after (it rises immediately), the invoice number with "Vezi factura", "Gata".
- *Error* — a danger Notice with the bank's reason and "Nu ți s-a retras niciun ban de pe card.", what you can do (try again, another card, call the bank), "Folosește alt card" and "Încearcă din nou".

**Where it opens.** "Cumpără · 49 lei" on HubAdminPlan, and "Cumpără … în plus" from a UsageMeter at or near its limit — owner only. Packs marked "Doar la cerere", or any pack while the business has no saved card, show "Cere activare" instead. Every purchase gets its own invoice in the invoice list.
