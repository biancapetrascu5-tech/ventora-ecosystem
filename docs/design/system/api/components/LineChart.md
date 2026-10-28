# LineChart

`component` · Data · versiunea 1.0.1

A measure over time — revenue per month — with an optional grey comparison (last year) and the running period in peach.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `labels` | `string[]` | da |
| `series` | `{ label: string; values: number[]; color?: 2 \| 1 \| 3 \| 4 \| 5 \| "compare"; }[]` | da |
| `nowIndex` | `number` |  |
| `nowLabel` | `string` |  |
| `title` | `string` | da |
| `description` | `string` |  |
| `unit` | `string` |  |
| `format` | `(v: number) => string` |  |
| `height` | `number` |  |
| `area` | `boolean` |  |
| `actions` | `ReactNode` |  |

## Evenimente

—

## Stări

- default
- compare-series
- now-period
- single-series
- no-area
- narrow

## Note

The hover crosshair tooltip needs a pointer and is not shown statically.

Mai mult: `components/LineChart/README.md`, exemplele: `components/LineChart/preview.html`.
