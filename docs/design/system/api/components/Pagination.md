# Pagination

`component` · Data · versiunea 1.0.1

Move through pages of a list: range ("21–40 din 248"), rows per page, page numbers with gaps, previous/next.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `page` | `number` | da |
| `pageSize` | `number` | da |
| `total` | `number` | da |
| `onPageChange` | `(page: number) => void` |  |
| `onPageSizeChange` | `(size: number) => void` |  |
| `pageSizes` | `number[]` |  |
| `compact` | `boolean` |  |

## Evenimente

`onPageChange`, `onPageSizeChange`

## Stări

- default
- with-page-size
- first-page
- last-page
- single-page
- compact

Mai mult: `components/Pagination/README.md`, exemplele: `components/Pagination/preview.html`.
