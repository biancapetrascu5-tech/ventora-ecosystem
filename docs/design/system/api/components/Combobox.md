# Combobox

`component` · Forms · versiunea 1.0.1

Type to filter and pick one or many values — the search field for long lists (clients, services, staff).

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `options` | `(Option<V> \| OptionGroup<V>)[]` | da |
| `value` | `V \| V[]` |  |
| `defaultValue` | `V \| V[]` |  |
| `onChange` | `(v: V \| V[]) => void` |  |
| `multiple` | `boolean` |  |
| `placeholder` | `string` |  |
| `invalid` | `boolean` |  |
| `disabled` | `boolean` |  |
| `loading` | `boolean` |  |
| `onQueryChange` | `(q: string) => void` |  |
| `filter` | `boolean` |  |
| `icon` | `string` |  |
| `emptyText` | `string` |  |
| `size` | `"sm" \| "md" \| "lg"` |  |
| `defaultOpen` | `boolean` |  |
| `defaultQuery` | `string` |  |
| `id` | `string` |  |

## Evenimente

`onChange`, `onQueryChange`

## Stări

- open-filtered
- no-results
- multiple
- selected
- invalid
- disabled
- loading

## Note

Open list (portaled popover) and its no-results state are shown open only in the Light frame; Dark/DE/IT show the same fields closed.

Mai mult: `components/Combobox/README.md`, exemplele: `components/Combobox/preview.html`.
