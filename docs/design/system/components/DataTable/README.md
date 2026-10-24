# DataTable

The one table for every list of records: sorting, filters, selection, row actions, bulk bar, pagination, empty and loading — and a list layout on narrow screens.

**Props.**
- `columns` — `[{ key, header, render?(row), sortable?, align?: 'end', width?, primary?, secondary?, trailing?, muted? }]`. `primary` is the row's name (bold, the list title on mobile); `secondary` columns join into the list's meta line; `trailing` (usually the status) sits at the right of each list item.
- `rows`, `rowKey(row)` (defaults to `row.id`).
- `sort` `{ key, dir }` / `onSortChange` (cycles asc → desc → none; the consumer sorts, server-side).
- `selectable`, `selected` (keys) / `onSelectedChange`, `bulkActions` `[{ label, icon?, onClick, destructive? }]` — the bulk bar replaces nothing and sits sticky above the header while anything is selected.
- `rowActions(row)` → Menu items (kebab on each row; put the destructive one last).
- `toolbar` (search, filter buttons, active filter pills), `pagination` (Pagination props), `loading` (skeleton rows), `empty` (an EmptyState: first use, no results with "Șterge filtrele", or error), `onRowClick` (opens a Drawer), `activeRow` (the row whose Drawer is open — marked with a peach edge), `density` (`default` 44px rows, `dense` 36px), `layout` (`auto` | `table` | `list`), `caption`.

**Responsive.** Below 640px of its own width (a container query, so it also works inside a Drawer) the table becomes a list of 44px+ items: title, meta line, trailing status, kebab. Page-size and page numbers hide; prev/next remain.

**Numbers** use tabular figures and `align: 'end'`; money shows the unit ("120 lei").
