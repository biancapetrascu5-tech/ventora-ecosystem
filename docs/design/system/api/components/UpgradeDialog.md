# UpgradeDialog

`component` · Comercial · versiunea 1.1.0

The pack / plan / trial dialog. It opens only after the person acts: a locked feature, the limit, or "Vezi opțiunile". It extends the limit dialog (UsageMeter) and shares its payment states with AddonPurchase (`PayProcessing`, `PaySuccess`, `PayError` in billing), so both read the same.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `open` | `boolean` |  |
| `onOpenChange` | `(o: boolean) => void` |  |
| `inline` | `boolean` |  |
| `sheet` | `boolean` |  |
| `title` | `string` |  |
| `description` | `string` |  |
| `usage` | `{ label: string; used: number; limit: number; unit?: string; }` |  |
| `options` | `UpgradeOption[]` | da |
| `value` | `string` |  |
| `onChange` | `(id: string) => void` |  |
| `role` | `"owner" \| "member"` |  |
| `decider` | `string` |  |
| `onRecommend` | `() => void` |  |
| `recommended` | `boolean` |  |
| `step` | `"options" \| "confirm" \| "processing" \| "success" \| "error" \| "trial"` |  |
| `summary` | `{ what?: string; when?: string; price?: string; setup?: string; total?: string; }` |  |
| `card` | `{ brand: string; last4: string; expiry?: string; }` |  |
| `cardSlot` | `ReactNode` |  |
| `error` | `{ title?: string; message?: string; }` |  |
| `success` | `{ title?: string; hint?: string; usage?: { label: string; used: number; limitBefore: number; limitAfter: number; }; invoice?: { number: string; onOpen?(): void; }; }` |  |
| `trial` | `{ text: string; reminder?: string; }` |  |
| `onContinue` | `(id: string) => void` |  |
| `onBack` | `() => void` |  |
| `onPay` | `() => void` |  |
| `onRetry` | `() => void` |  |
| `onUseOtherCard` | `() => void` |  |
| `onDone` | `() => void` |  |
| `doneLabel` | `string` |  |

## Evenimente

`onBack`, `onChange`, `onContinue`, `onDone`, `onOpenChange`, `onPay`, `onRecommend`, `onRetry`, `onUseOtherCard`

## Stări

- options
- options-member
- confirm-pack
- confirm-plan
- confirm-trial
- processing
- success
- error
- trial
- sheet

Mai mult: `components/UpgradeDialog/README.md`, exemplele: `components/UpgradeDialog/preview.html`.
