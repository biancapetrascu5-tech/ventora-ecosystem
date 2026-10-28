# PortalPresence

`component` · Hub · versiunea 1.0.1

Portal in the business launcher: not an app the business works in, but its page for clients — shown as its own card under the AppDock, never as one more icon.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `status` | `"published" \| "hidden" \| "draft"` |  |
| `canManage` | `boolean` |  |
| `onManage` | `() => void` |  |
| `onPreview` | `() => void` |  |
| `previewHref` | `string` |  |
| `compact` | `boolean` |  |
| `className` | `string` |  |

## Evenimente

`onManage`, `onPreview`

## Stări

- published
- hidden
- draft
- member-readonly
- compact

Mai mult: `components/PortalPresence/README.md`, exemplele: `components/PortalPresence/preview.html`.
