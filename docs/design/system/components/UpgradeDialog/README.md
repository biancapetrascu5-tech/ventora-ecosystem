# UpgradeDialog

The pack / plan / trial dialog. It opens only after the person acts: a locked feature, the limit, or "Vezi opțiunile". It extends the limit dialog (UsageMeter) and shares its payment states with AddonPurchase (`PayProcessing`, `PaySuccess`, `PayError` in billing), so both read the same.

**Steps (`step`).** `options` — a title about what the person tried, what happened (UsageMeter), 1–3 options with price, period, setup cost and what is included, and "Nu se pierde nimic din ce ai." · `confirm` — a separate step with what turns on, when, the price, the setup cost, the total today and the card (last four digits); "Plătește 39 lei", "Începe perioada de probă" or, for a plan, "Cere alt abonament" (plan changes stay a request: "Nu plătești nimic acum…") · `processing` · `success` (the limit rises at once, the invoice is ready) · `error` (what happened, what you can do) · `trial` (the end date and what follows).

**Trial.** No card and no automatic payment: when the trial ends the app pauses, the data stays, and continuing is an explicit choice ("Activează · 79 lei pe lună").

**Roles.** `owner` (and an admin allowed to buy) chooses and pays. `member` (and an admin without buying rights) sees the options read-only, who decides (`decider`) and "Recomandă".

**Rules.** Nothing activates in one click from a recommendation; the cost is always visible before confirmation; no countdowns, no "last places", no pre-ticked options, no guilt in the refusal. On phones it is a bottom sheet (`sheet`) with full-width buttons.
