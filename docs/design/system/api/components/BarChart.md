# BarChart

`component` · Data · versiunea 1.0.1

Columns for periods or days, horizontal bars for categories ranked by size. Built on the chart tokens.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `data` | `{ label: string; value: number; compare?: number; now?: boolean; nowLabel?: string; share?: string; }[]` | da |
| `orientation` | `"vertical" \| "horizontal"` |  |
| `title` | `string` | da |
| `description` | `string` |  |
| `unit` | `string` |  |
| `format` | `(v: number) => string` |  |
| `compareLabel` | `string` |  |
| `color` | `2 \| 1 \| 3 \| 4 \| 5` |  |
| `height` | `number` |  |
| `actions` | `ReactNode` |  |

## Evenimente

—

## Stări

- vertical
- compare
- now
- hover
- table
- horizontal
- narrow

## Note

phone layout (bar under label) is a viewport media query (<768px) and cannot show inside the card

Mai mult: `components/BarChart/README.md`, exemplele: `components/BarChart/preview.html`.
