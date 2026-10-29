# Timeline

`component` · Data · versiunea 1.1.0

Stages of a project as bars across weeks, with the peach "Azi" line and milestones. The TaskBoard "Cronologie" view.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `periods` | `{ label: string; current?: boolean; }[]` | da |
| `rows` | `({ id: string; label: string; sub?: string; start: number; end: number; status?: "done" \| "planned" \| "active" \| "late"; progress?: number; statusLabel?: string; } \| { id: string; label: string; sub?: string; milestone: number; milestoneLabel?: string; })[]` | da |
| `today` | `number` |  |
| `label` | `string` |  |
| `minPeriodWidth` | `number` |  |

## Evenimente

—

## Stări

- planned
- active
- late
- done
- milestone
- today
- current-period
- narrow-scroll

Mai mult: `components/Timeline/README.md`, exemplele: `components/Timeline/preview.html`.
