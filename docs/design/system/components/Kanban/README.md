# Kanban

Cards in stages — the ClientDesk pipeline, the TaskBoard board. Each column shows its name, the number of cards and an optional summary (the stage's value); a `tone: 'done'` column ("Gata", "Câștigate") gets the lime check.

**Props.** `columns` `[{ id, label, summary?, count?, tone?, empty? }]`, `cards` `[{ id, col, … }]`, `renderCard(card, { columns, onMove })` (default: `KanbanCard`), `onMove(cardId, columnId)`, `defaultColumn`, `label`.

**KanbanCard.** `title`, `subtitle`, `tag`, `amount`, `people` (avatars), `due` `{ label, tone, icon }` (peach only for today or late), `meta`, `progress` `{ done, total }`, `onOpen`, `onMove` + `columns` (adds the "Mută în „…”" menu), `active`. The card body is one button; the kebab is always visible.

**Responsive.** Columns scroll sideways inside the component, never the page. Below 640px of its own width it shows one stage at a time, chosen from a row of 44px stage chips with their counts. Moving never depends on dragging: every card can be moved from its menu, by keyboard or touch.
