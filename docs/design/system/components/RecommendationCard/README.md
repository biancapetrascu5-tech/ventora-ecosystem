# RecommendationCard

One recommendation in a page, tied to what the business already does. Anatomy: the "Recomandare" label and a menu with "Amintește-mi mai târziu" (in a week / in a month) · the app icon (AppIcon) or a Lucide icon for a pack or a plan · a short title · one sentence about the benefit, in the business's context · the cost line (price and period, or "Gratuit 14 zile. Apoi 79 lei pe lună, doar dacă alegi să continui.") · the main action · "Nu mă interesează".

**Props.** `app` or `icon`, `title`, `benefit`, `cost`, `role` (`owner` | `member`), `actionLabel` + `actionIcon` + `onAction` (owner: "Vezi opțiunile", "Încearcă gratuit 14 zile", "Cumpără · 49 lei" — none of them activates anything; they open UpgradeDialog), `decider` + `onRecommend` + `recommended` (member: "Recomandă aplicația", "Ajunge la {nume} (proprietar).", then the status pill), `onDismiss`, `onRemindLater(period)`, `proactive` (false when the person asked for it, e.g. from the catalog: no dismiss and no remind).

**After the choice.** "Nu mă interesează" → the card goes and a Toast says "Am înțeles, nu-ți mai arătăm asta." with "Anulează". "Amintește-mi mai târziu" → "Bine, îți amintim peste o săptămână." with "Anulează".

**Responsive.** Full width on phones; below 300px of its own width the action takes the full row.

**Member's list.** After "Recomandă aplicația" the member sees the state of each recommendation (`status`): "În așteptare", "Activată" or "Nu acum". There is no notification when it is declined; the member is notified only when the app is turned on. The line under the action reads "Ajunge la {nume} (proprietar)."
