# ContextBar

`component` · Shell · versiunea 1.1.0

The top bar of an app: business switcher, search (opens the CommandPalette, shows ⌘K), "Creează", notifications, account.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `title` | `ReactNode` |  |
| `org` | `ReactNode` |  |
| `onSearch` | `() => void` |  |
| `searchLabel` | `string` |  |
| `createItems` | `MenuItem[]` |  |
| `onCreate` | `() => void` |  |
| `createLabel` | `string` |  |
| `notifications` | `ReactNode` |  |
| `account` | `ReactNode` |  |
| `leading` | `ReactNode` |  |

## Evenimente

`onCreate`, `onSearch`

## Stări

- desktop
- tablet
- mobile
- brandzone-launcher

Mai mult: `components/ContextBar/README.md`, exemplele: `components/ContextBar/preview.html`.
