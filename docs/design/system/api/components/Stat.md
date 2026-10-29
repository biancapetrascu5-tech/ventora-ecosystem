# Stat

`component` · Data · versiunea 1.0.1

One number with its label, an optional change against a named period and a short hint. The top row of TeamSpace, MoneyDesk and DataView.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `label` | `string` | da |
| `value` | `ReactNode` | da |
| `unit` | `string` |  |
| `delta` | `{ value: string; period?: string; direction?: "up" \| "down"; good?: boolean; }` |  |
| `hint` | `string` |  |
| `icon` | `string` |  |
| `tone` | `"neutral" \| "attention"` |  |
| `onClick` | `() => void` |  |

## Evenimente

`onClick`

## Stări

- default
- delta-good
- delta-bad
- attention
- clickable
- unit
- hint
- icon

Mai mult: `components/Stat/README.md`, exemplele: `components/Stat/preview.html`.
