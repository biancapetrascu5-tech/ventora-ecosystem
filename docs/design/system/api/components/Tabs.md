# Tabs

`component` · Navigation · versiunea 1.0.1

Switch between sibling sections of one record or page; the active tab has an ink label and a 2px `primary` underline.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `items` | `TabItem[]` | da |
| `value` | `string` |  |
| `defaultValue` | `string` |  |
| `onChange` | `(v: string) => void` |  |
| `label` | `string` |  |
| `size` | `"sm" \| "md"` |  |
| `children` | `ReactNode \| ((value: string) => ReactNode)` |  |

## Evenimente

`onChange`

## Stări

- default
- active
- count
- count-attention
- disabled
- icon
- small
- overflow-scroll

Mai mult: `components/Tabs/README.md`, exemplele: `components/Tabs/preview.html`.
