# Kanban

`component` · Data · versiunea 1.0.1

Cards in stages — the ClientDesk pipeline, the TaskBoard board. Each column shows its name, the number of cards and an optional summary (the stage's value); a `tone: 'done'` column ("Gata", "Câștigate") gets the lime check.

## Proprietăți

| prop | tip | obligatorie | din |
| --- | --- | --- | --- |
| `columns` | `KanbanColumn[]` | da | Kanban |
| `cards` | `KanbanCardProps[]` | da | Kanban |
| `renderCard` | `(card: KanbanCardProps, ctx: { columns: KanbanColumn[]; onMove?(id: string, col: string): void; }) => ReactNode` |  | Kanban |
| `onMove` | `(id: string, col: string) => void` |  | Kanban |
| `defaultColumn` | `string` |  | Kanban |
| `label` | `string` |  | Kanban |
| `id` | `string` | da | KanbanCard |
| `col` | `string` | da | KanbanCard |
| `title` | `string` | da | KanbanCard |
| `subtitle` | `string` |  | KanbanCard |
| `tag` | `string` |  | KanbanCard |
| `amount` | `string` |  | KanbanCard |
| `people` | `string[]` |  | KanbanCard |
| `due` | `{ label: string; tone?: "danger" \| "done" \| "neutral" \| "attention"; icon?: string; }` |  | KanbanCard |
| `meta` | `string[]` |  | KanbanCard |
| `progress` | `{ done: number; total: number; }` |  | KanbanCard |
| `onOpen` | `() => void` |  | KanbanCard |
| `onMove` | `(id: string, col: string) => void` |  | KanbanCard |
| `columns` | `KanbanColumn[]` |  | KanbanCard |
| `active` | `boolean` |  | KanbanCard |

## Evenimente

`onMove`, `onOpen`

## Stări

- default
- done-column
- empty-column
- active-card
- due-attention
- narrow-single-stage

Mai mult: `components/Kanban/README.md`, exemplele: `components/Kanban/preview.html`.
