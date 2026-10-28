# CommandPalette

`component` · Navigation · versiunea 1.0.1

Search and run anything from anywhere — pages, people, records, commands — with ⌘K / Ctrl+K.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `open` | `boolean` | da |
| `onOpenChange` | `(o: boolean) => void` |  |
| `groups` | `{ label: string; items: CommandItem[]; }[]` | da |
| `placeholder` | `string` |  |
| `onQueryChange` | `(q: string) => void` |  |
| `loading` | `boolean` |  |
| `inline` | `boolean` |  |

## Evenimente

`onOpenChange`, `onQueryChange`, `onSelect`

## Stări

- open-active-item
- loading
- no-results

## Note

Full-screen mobile layout depends on viewport width and is not shown.

Mai mult: `components/CommandPalette/README.md`, exemplele: `components/CommandPalette/preview.html`.
