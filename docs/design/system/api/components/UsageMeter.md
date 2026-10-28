# UsageMeter

`component` · Feedback · versiunea 1.0.1

Consumption against a subscription limit, shown calmly: what is used, what is left, a warning near the limit and a controlled block at the limit. It never uses red and nothing is lost: only the next new item pauses. The words come from the glossary: "abonament", "pachet în plus", "Cere alt abonament" — never "plan".

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `label` | `string` | da |
| `used` | `number` | da |
| `limit` | `number` |  |
| `unit` | `string` |  |
| `warnAt` | `number` |  |
| `onUpgrade` | `() => void` |  |
| `onBuy` | `() => void` |  |
| `buyLabel` | `string` |  |
| `owner` | `string` |  |
| `onNotifyOwner` | `() => void` |  |
| `compact` | `boolean` |  |
| `format` | `(n: number) => string` |  |

## Evenimente

`onBuy`, `onNotifyOwner`, `onUpgrade`

## Stări

- ok
- warn-owner
- warn-member
- limit-owner
- limit-member
- unlimited
- with-unit
- compact-warn
- compact-limit

Mai mult: `components/UsageMeter/README.md`, exemplele: `components/UsageMeter/preview.html`.
