# Toast

`component` · Overlays · versiunea 1.0.1

A brief confirmation after an action, with "Anulează" (undo) whenever the action can be reversed.

## Proprietăți

| prop | tip | obligatorie | din |
| --- | --- | --- | --- |
| `title` | `ReactNode` | da | Toast |
| `description` | `ReactNode` |  | Toast |
| `tone` | `Tone` |  | Toast |
| `onUndo` | `() => void` |  | Toast |
| `action` | `{ label: string; onClick?(): void; }` |  | Toast |
| `duration` | `number` |  | Toast |
| `loading` | `boolean` |  | Toast |
| `onDismiss` | `() => void` |  | Toast |
| `children` | `ReactNode` |  | ToastProvider |
| `duration` | `number` |  | ToastProvider |

## Evenimente

`onDismiss`, `onUndo`

## Stări

- neutral
- undo
- done
- attention
- action
- danger
- loading

Mai mult: `components/Toast/README.md`, exemplele: `components/Toast/preview.html`.
