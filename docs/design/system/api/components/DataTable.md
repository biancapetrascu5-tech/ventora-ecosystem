# DataTable

`component` · Data · versiunea 1.0.1

The one table for every list of records: sorting, filters, selection, row actions, bulk bar, pagination, empty and loading — and a list layout on narrow screens.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `columns` | `Column<R>[]` | da |
| `rows` | `R[]` | da |
| `rowKey` | `(row: R) => string \| number` |  |
| `sort` | `{ key: string; dir: "asc" \| "desc"; }` |  |
| `onSortChange` | `(s: { key: string; dir: "asc" \| "desc"; }) => void` |  |
| `selectable` | `boolean` |  |
| `selected` | `(string \| number)[]` |  |
| `onSelectedChange` | `(keys: (string \| number)[]) => void` |  |
| `rowActions` | `(row: R) => MenuItem[]` |  |
| `bulkActions` | `{ label: string; icon?: string; onClick?(): void; destructive?: boolean; }[]` |  |
| `toolbar` | `ReactNode` |  |
| `pagination` | `PaginationProps` |  |
| `loading` | `boolean` |  |
| `loadingRows` | `number` |  |
| `empty` | `ReactNode` |  |
| `onRowClick` | `(row: R) => void` |  |
| `activeRow` | `string \| number` |  |
| `density` | `"default" \| "dense"` |  |
| `layout` | `"auto" \| "table" \| "list"` |  |
| `caption` | `string` |  |

## Evenimente

`onRowClick`, `onSelectedChange`, `onSortChange`

## Stări

- selected-bulk-bar
- sorted
- active-row
- row-actions
- toolbar-filters
- pagination
- dense
- list
- loading
- empty-first-use
- empty-no-results
- empty-error

Mai mult: `components/DataTable/README.md`, exemplele: `components/DataTable/preview.html`.
