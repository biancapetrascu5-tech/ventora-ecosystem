# Select

`component` · Forms · versiunea 1.1.0

Pick one value from a short list; a custom listbox, never the native `<select>`.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `options` | `(Option<V> \| OptionGroup<V>)[]` | da |
| `value` | `V` |  |
| `defaultValue` | `V` |  |
| `onChange` | `(v: V) => void` |  |
| `placeholder` | `string` |  |
| `invalid` | `boolean` |  |
| `disabled` | `boolean` |  |
| `loading` | `boolean` |  |
| `size` | `"sm" \| "md" \| "lg"` |  |
| `icon` | `string` |  |
| `defaultOpen` | `boolean` |  |
| `id` | `string` |  |
| `state` | `ForcedState` |  |

## Evenimente

`onChange`

## Stări

- default
- placeholder
- open
- grouped
- option-disabled
- hover
- focus
- pressed
- invalid
- disabled
- loading
- small
- large

Mai mult: `components/Select/README.md`, exemplele: `components/Select/preview.html`.
