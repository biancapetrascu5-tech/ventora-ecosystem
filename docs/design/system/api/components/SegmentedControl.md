# SegmentedControl

`component` · Forms · versiunea 1.0.1

Switch between two to five views of the same content (Zi / Săptămână / Resurse; Listă / Calendar).

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `options` | `Option<V>[]` | da |
| `value` | `V` |  |
| `defaultValue` | `V` |  |
| `onChange` | `(v: V) => void` |  |
| `label` | `string` | da |
| `size` | `"sm" \| "md"` |  |
| `block` | `boolean` |  |
| `disabled` | `boolean` |  |
| `iconOnly` | `boolean` |  |

## Evenimente

`onChange`

## Stări

- default
- selected
- with-icons
- icon-only
- option-disabled
- disabled
- small
- block

## Note

Hover/focus have no forced state prop and are not shown.

Mai mult: `components/SegmentedControl/README.md`, exemplele: `components/SegmentedControl/preview.html`.
