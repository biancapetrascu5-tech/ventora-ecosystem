# Agenda

`component` · Data · versiunea 1.0.1

The day as a list — for the Today screen and for phones — with the peach "now" line between what's done and what's next, and the appointment in progress highlighted with its elapsed time.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `items` | `{ id: string; start: string; end: string; title: string; subtitle?: string; staff?: string; status?: EventStatus; }[]` | da |
| `now` | `string` |  |
| `onSelect` | `(item: any) => void` |  |
| `activeId` | `string` |  |
| `showStaff` | `boolean` |  |

## Evenimente

`onSelect`

## Stări

- done
- noshow
- cancelled
- now
- unconfirmed
- blocked
- confirmed
- active
- nowLine
- noStaff

Mai mult: `components/Agenda/README.md`, exemplele: `components/Agenda/preview.html`.
