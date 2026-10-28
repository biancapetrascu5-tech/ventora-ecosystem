# ProgressBar

`component` · Feedback · versiunea 1.0.1

Progress of a task the user started (import, export, upload, setup).

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `value` | `number` |  |
| `label` | `string` |  |
| `showValue` | `boolean` |  |
| `size` | `"sm" \| "md" \| "lg"` |  |
| `tone` | `"default" \| "done"` |  |

## Evenimente

—

## Stări

- zero
- running
- done
- indeterminate
- small
- medium
- large

## Note

tone='done' below 100% is not shown (lime is reserved for done).

Mai mult: `components/ProgressBar/README.md`, exemplele: `components/ProgressBar/preview.html`.
