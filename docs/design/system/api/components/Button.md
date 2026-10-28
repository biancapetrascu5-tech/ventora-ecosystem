# Button

`component` · Actions · versiunea 1.1.0

Runs an action; the label is always a verb in sentence case ("Confirmă", "Trimite reamintire"), never "OK".

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `variant` | `"primary" \| "secondary" \| "quiet" \| "danger"` |  |
| `size` | `"sm" \| "md" \| "lg"` |  |
| `icon` | `string` |  |
| `iconEnd` | `string` |  |
| `loading` | `boolean` |  |
| `block` | `boolean` |  |
| `href` | `string` |  |
| `state` | `ForcedState` |  |
| `type` | `"button" \| "submit" \| "reset"` |  |
| `disabled` | `boolean` |  |
| `onClick` | `(e: any) => void` |  |
| `className` | `string` |  |
| `id` | `string` |  |
| `style` | `any` |  |
| `title` | `string` |  |
| `role` | `string` |  |

## Evenimente

`onClick`

## Stări

- default
- hover
- focus
- pressed
- disabled
- loading
- sm
- md
- lg
- iconEnd
- link
- block
- truncated

Mai mult: `components/Button/README.md`, exemplele: `components/Button/preview.html`.
