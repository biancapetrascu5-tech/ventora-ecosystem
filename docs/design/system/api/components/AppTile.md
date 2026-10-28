# AppTile

`component` · Hub · versiunea 1.0.1

One app in the Hub, in exactly one of four access states — only "Disponibilă" opens.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `layout` | `"icon" \| "tile" \| "row"` |  |
| `app` | `AppKey` |  |
| `name` | `string` |  |
| `description` | `string` |  |
| `icon` | `string` |  |
| `access` | `AccessState` |  |
| `reason` | `string` |  |
| `grantedBy` | `string` |  |
| `onOpen` | `(e: any, name: string) => void` |  |
| `onRequestAccess` | `() => void` |  |
| `onWriteUs` | `() => void` |  |
| `onSeeStatus` | `() => void` |  |
| `badge` | `number` |  |
| `state` | `ForcedState` |  |
| `recommendation` | `{ reason: string; cost?: string; }` |  |
| `onDetails` | `() => void` |  |
| `onDismiss` | `() => void` |  |
| `onRemindLater` | `(period: "week" \| "month") => void` |  |

## Evenimente

`onDetails`, `onDismiss`, `onOpen`, `onRemindLater`, `onRequestAccess`, `onSeeStatus`, `onWriteUs`

## Stări

- available
- hover
- focus
- pressed
- badge
- unavailable
- notInRole
- notInRoleNoOne
- notInPlan
- layoutRow
- layoutIcon

Mai mult: `components/AppTile/README.md`, exemplele: `components/AppTile/preview.html`.
