# Drawer

`component` · Overlays · versiunea 1.0.1

A side panel over the current list for a record's detail or a longer form; full screen under 640px with a back arrow.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `contained` | `boolean` |  |
| `layout` | `"auto" \| "side" \| "full"` |  |
| `open` | `boolean` | da |
| `onOpenChange` | `(o: boolean) => void` |  |
| `title` | `ReactNode` | da |
| `subtitle` | `ReactNode` |  |
| `actions` | `ReactNode` |  |
| `children` | `ReactNode` |  |
| `footer` | `ReactNode` |  |
| `width` | `string \| number` |  |
| `modal` | `boolean` |  |

## Evenimente

`onOpenChange`

## Stări

- side-over-list
- active-row
- full-screen-back
- modal-trigger

## Note

Modal trigger now starts closed; the drawer is shown contained in each frame.

Mai mult: `components/Drawer/README.md`, exemplele: `components/Drawer/preview.html`.
