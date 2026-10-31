# FounderDiscounts

Discounts (S113). In FounderBusinessBilling, "Reduceri active" lists the business's discounts — on what, how much, how long, the reason and who added it — with "Încheie reducerea" (confirmation: the price returns from the next invoice; issued invoices don't change).

**"Adaugă o reducere".** On the whole subscription or on one line (an added app, a monthly pack); a percentage (1–100%) or a fixed amount in the business's currency (at most the line's price); once (next invoice), a number of months, or permanent; reason required (into the log; the client doesn't see it). A preview shows the next invoice: full price, discount, total. 100% = free: the invoice shows the full price, the discount and a total of 0.

**"Reduceri"** — a new Spine entry under "Model comercial": every permanent discount across all businesses ("Toate active" shows the temporary ones too), with an empty state.

Shown at 1280 and 390, light and dark. Romanian only (S57); keys `founder.discounts.*` in `i18n/founder-pricing.json`.
