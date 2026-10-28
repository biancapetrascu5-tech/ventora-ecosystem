# Schedule

`component` · Data · versiunea 1.0.1

The calendar grid behind every time-based view: day (one column), week (seven day columns) and resources (one column per person, room or chair), with the peach "now" line.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `columns` | `{ id: string; label: string; sub?: string; person?: string; today?: boolean; closed?: string; }[]` | da |
| `events` | `ScheduleEvent[]` | da |
| `from` | `number` |  |
| `to` | `number` |  |
| `now` | `string` |  |
| `nowColumn` | `string` |  |
| `onEventClick` | `(e: ScheduleEvent) => void` |  |
| `onSlotClick` | `(columnId: string, time: string) => void` |  |
| `height` | `string \| number` |  |
| `minColumnWidth` | `number` |  |
| `activeId` | `string` |  |

## Evenimente

`onEventClick`, `onSlotClick`

## Stări

- confirmed
- unconfirmed
- now
- done
- cancelled
- noshow
- blocked
- overlap
- closed-column
- today-column
- active
- resources-view
- week-view

Mai mult: `components/Schedule/README.md`, exemplele: `components/Schedule/preview.html`.
