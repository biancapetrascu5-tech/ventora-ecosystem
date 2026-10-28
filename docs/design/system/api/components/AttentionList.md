# AttentionList

`component` · Feedback · versiunea 2.0.0

"Au nevoie de tine": the few things that need a person, each with its own action, at the top of every app's Today screen.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `items` | `{ id: string \| number; icon?: string; tone?: "danger" \| "neutral" \| "attention"; title: ReactNode; meta?: ReactNode; time?: string; actions?: { label: string; icon?: string; primary?: boolean; quiet?: boolean; onClick?(): void; }[]; }[]` | da |
| `empty` | `ReactNode` |  |

## Evenimente

—

## Stări

- neutral
- attention
- danger
- with-actions
- with-time
- empty

Mai mult: `components/AttentionList/README.md`, exemplele: `components/AttentionList/preview.html`.
