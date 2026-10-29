# AddonPurchase

`component` · Hub · versiunea 1.0.1

The dialog in which the business owner buys an extra pack ("pachet în plus") with the card: review → processing → success or error. Plan changes are never bought here — they stay a request ("Cere alt abonament").

## Proprietăți

| prop | tip | obligatorie | din |
| --- | --- | --- | --- |
| `open` | `boolean` |  | AddonPurchase |
| `onOpenChange` | `(o: boolean) => void` |  | AddonPurchase |
| `inline` | `boolean` |  | AddonPurchase |
| `sheet` | `boolean` |  | AddonPurchase |
| `addon` | `{ name: string; title?: string; description?: string; price: number; icon?: string; max?: number; note?: string; }` | da | AddonPurchase |
| `quantity` | `number` |  | AddonPurchase |
| `defaultQuantity` | `number` |  | AddonPurchase |
| `onQuantityChange` | `(q: number) => void` |  | AddonPurchase |
| `card` | `PaymentCardData` |  | AddonPurchase |
| `onChangeCard` | `() => void` |  | AddonPurchase |
| `cardSlot` | `ReactNode` |  | AddonPurchase |
| `state` | `"processing" \| "success" \| "error" \| "review"` |  | AddonPurchase |
| `error` | `{ title?: string; message?: string; }` |  | AddonPurchase |
| `usage` | `{ label: string; used: number; limitBefore: number; limitAfter: number; unit?: string; }` |  | AddonPurchase |
| `invoice` | `{ number: string; onOpen?(): void; }` |  | AddonPurchase |
| `onPay` | `(quantity: number, total: number) => void` |  | AddonPurchase |
| `onRetry` | `() => void` |  | AddonPurchase |
| `onUseOtherCard` | `() => void` |  | AddonPurchase |
| `onDone` | `() => void` |  | AddonPurchase |
| `currency` | `string` |  | AddonPurchase |
| `format` | `(n: number) => string` |  | AddonPurchase |
| `card` | `PaymentCardData` | da | PaymentCard |
| `onChange` | `() => void` |  | PaymentCard |
| `compact` | `boolean` |  | PaymentCard |
| `children` | `ReactNode` |  | StripeSlot |
| `saveCard` | `boolean` |  | StripeSlot |
| `onSaveCardChange` | `(v: boolean) => void` |  | StripeSlot |

## Evenimente

`onChange`, `onChangeCard`, `onDone`, `onOpenChange`, `onPay`, `onQuantityChange`, `onRetry`, `onSaveCardChange`, `onUseOtherCard`

## Stări

- review
- reviewNoCard
- processing
- success
- error
- limitReachedOwner
- limitReachedMember

Mai mult: `components/AddonPurchase/README.md`, exemplele: `components/AddonPurchase/preview.html`.
