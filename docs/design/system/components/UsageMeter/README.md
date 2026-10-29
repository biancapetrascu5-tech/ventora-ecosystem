# UsageMeter

Consumption against a subscription limit, shown calmly: what is used, what is left, a warning near the limit and a controlled block at the limit. It never uses red and nothing is lost: only the next new item pauses. The words come from the glossary: "abonament", "pachet în plus", "Cere alt abonament" — never "plan".

**Props.**
- `label`, `used` and `limit`. Leaving out `limit` shows "Nelimitat".
- `unit`, `warnAt` (default 0.8) and `format(n)`.
- `onBuy`: the owner buys an extra pack. Shows the primary action, whose label is `buyLabel` (default "Cumpără un pachet în plus"). Put the price in the label: `buyLabel="Cumpără pachet · 49 lei"`.
- `onUpgrade`: request another subscription. Shows "Cere alt abonament", as a quiet button next to `onBuy`, or as the primary button when there is no `onBuy`.
- `owner`: for anyone who is not the owner, the owner's name. Shows "Pachetele în plus le poate cumpăra doar {nume} (proprietar)."
- `onNotifyOwner`: together with `owner`, shows "Anunță proprietarul".
- `compact`: for the Spine footer.

**Who sees what.** Pass `onBuy` and `onUpgrade` only to the owner. Pass `owner` and `onNotifyOwner` to everyone else. Then nobody sees a button they cannot use.

**States.**
- **Below `warnAt`:** `primary` fill and "Mai ai 688".
- **From `warnAt`:**
  - peach fill and "Te apropii de limita abonamentului · Mai ai 138" in `attention-ink`;
  - the owner gets a small secondary "Cumpără pachet · 49 lei";
  - everyone else sees who can buy.
- **At the limit:** a peach panel with a lock and "Ai atins limita abonamentului."
  - **Owner:** the panel adds "Nu se pierde nimic din ce ai. Ca să adaugi altele, cumpără un pachet în plus sau cere alt abonament." The primary action is "Cumpără pachet · {preț}", the secondary "Cere alt abonament".
  - **Everyone else:** "Pachetele în plus le poate cumpăra doar Bianca Petrașcu (proprietar)." and "Anunță proprietarul".
- **Unlimited:** "Nelimitat", with no bar.
- **Compact:** the same messages, smaller; at the limit, only the action that applies to the person.

The preview shows every state in Light and Dark frames, plus German and Italian.
