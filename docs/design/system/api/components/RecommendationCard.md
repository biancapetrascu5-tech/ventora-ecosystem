# RecommendationCard

`component` · Comercial · versiunea 1.0.1

One recommendation in a page, tied to what the business already does. Anatomy: the "Recomandare" label and a menu with "Amintește-mi mai târziu" (in a week / in a month) · the app icon (AppIcon) or a Lucide icon for a pack or a plan · a short title · one sentence about the benefit, in the business's context · the cost line (price and period, or "Gratuit 14 zile. Apoi 79 lei pe lună, doar dacă alegi să continui.") · the main action · "Nu mă interesează".

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `app` | `AppKey` |  |
| `icon` | `string` |  |
| `title` | `string` | da |
| `benefit` | `string` |  |
| `cost` | `string` |  |
| `role` | `"owner" \| "member"` |  |
| `actionLabel` | `string` |  |
| `actionIcon` | `string` |  |
| `onAction` | `() => void` |  |
| `decider` | `string` |  |
| `onRecommend` | `() => void` |  |
| `recommended` | `boolean` |  |
| `status` | `"pending" \| "activated" \| "declined"` |  |
| `onDismiss` | `() => void` |  |
| `onRemindLater` | `(period: "week" \| "month") => void` |  |
| `proactive` | `boolean` |  |

## Evenimente

`onAction`, `onDismiss`, `onRecommend`, `onRemindLater`

## Stări

- owner
- trial
- extra-pack
- member
- member-pending
- member-activated
- member-declined
- not-proactive
- narrow
- after-dismiss-toast
- after-remind-toast

Mai mult: `components/RecommendationCard/README.md`, exemplele: `components/RecommendationCard/preview.html`.
