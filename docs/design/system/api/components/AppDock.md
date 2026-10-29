# AppDock

`component` · Hub · versiunea 1.1.0

The launcher's "Aplicațiile tale": a row of app icons on one raised sheet; on hover or keyboard focus an icon opens into the app's card above the row. Hub launcher only.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `apps` | `DockApp[]` | da |
| `onOpen` | `(e: any, app: AppKey, name: string, launch: { from: DOMRect; fromCard: DOMRect; iconEl: Element; }) => void` |  |
| `label` | `string` |  |
| `className` | `string` |  |

## Evenimente

`onOpen`

## Stări

- rest
- hover
- focus
- firstOpensInward
- lastOpensInward
- liveAttention
- badge
- phoneGrid

## Note

prefers-reduced-motion (instant swap) cannot be forced in a static preview

Mai mult: `components/AppDock/README.md`, exemplele: `components/AppDock/preview.html`.
