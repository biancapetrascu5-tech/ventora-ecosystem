# Dialog

`component` · Overlays · versiunea 1.0.1

A modal decision that blocks the page: confirm, a short form, a destructive choice.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `open` | `boolean` | da |
| `onOpenChange` | `(o: boolean) => void` |  |
| `title` | `ReactNode` | da |
| `description` | `ReactNode` |  |
| `children` | `ReactNode` |  |
| `footer` | `ReactNode` |  |
| `size` | `"md" \| "wide"` |  |
| `tone` | `"danger" \| "default" \| "attention"` |  |
| `icon` | `string` |  |
| `dismissible` | `boolean` |  |
| `initialFocus` | `RefObject<HTMLElement>` |  |
| `inline` | `boolean` |  |
| `className` | `string` |  |

## Evenimente

`onOpenChange`

## Stări

- danger
- default-form
- attention
- wide
- non-dismissible
- modal-trigger

## Note

Bottom-sheet layout under 640px depends on viewport width and is not shown; the modal trigger now starts closed so the frames stay visible.

Mai mult: `components/Dialog/README.md`, exemplele: `components/Dialog/preview.html`.
