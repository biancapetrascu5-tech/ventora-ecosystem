# Menu

`component` · Overlays · versiunea 1.0.1

A list of actions opened from a trigger — the kebab on rows, "Creează", account menus.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `trigger` | `ReactElement` | da |
| `items` | `MenuItem[]` | da |
| `placement` | `string` |  |
| `open` | `boolean` |  |
| `defaultOpen` | `boolean` |  |
| `onOpenChange` | `(o: boolean) => void` |  |
| `label` | `string` |  |
| `header` | `ReactNode` |  |
| `width` | `string \| number` |  |

## Evenimente

`onOpenChange`, `onSelect`

## Stări

- open
- heading
- shortcut
- description
- checked
- disabled
- custom-row
- separator
- destructive
- active-item

Mai mult: `components/Menu/README.md`, exemplele: `components/Menu/preview.html`.
