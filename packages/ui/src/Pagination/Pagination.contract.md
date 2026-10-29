# Pagination — Contract

**Pachet:** `@ventora/ui`  
**Fișier:** `packages/ui/src/Pagination/Pagination.tsx`  
**Status:** PROPUS (API schimbat în Lotul 5, aliniat 1:1 cu `Pagination` din bundle.js; versiunea anterioară, cu `totalPages`, era CONFIRMAT)

## Scop
Navigare între pagini de rezultate: intervalul afișat („61–80 din 1.284”), alegerea rândurilor pe pagină, numerele paginilor cu pauze („…”), înapoi/înainte. Varianta `compact` afișează „Pagina 2 din 13” în locul numerelor.

## Props
| Prop | Tip | Default | Descriere |
|---|---|---|---|
| `page` | `number` | — | Pagina curentă (1-based) |
| `pageSize` | `number` | — | Rânduri pe pagină |
| `total` | `number` | — | Numărul total de rânduri |
| `onPageChange` | `(page: number) => void` | — | Callback la schimbarea paginii |
| `onPageSizeChange` | `(size: number) => void` | — | Fără el nu apare alegerea rândurilor pe pagină |
| `pageSizes` | `number[]` | `[10, 20, 50, 100]` | Opțiunile pentru rânduri pe pagină |
| `compact` | `boolean` | `false` | Pentru spații înguste |
| `labels` | `PaginationLabels` | — | Textele traduse (obligatoriu, fără valori implicite) |
| `locale` | `string` | — | Pentru separatorul de mii (`fmtNumber`) |
| `className` | `string` | — | Clasă suplimentară |

`PaginationLabels`: `range(from, to, total)`, `pageOf(n, total)`, `rowsPerPage`, `prevPage`, `nextPage`. Numerele ajung deja formatate.

## Lista de pagini
`pageList(page, total)`: până la 7 pagini toate; altfel `1 … p-1 p p+1 … ultima`.

## Accesibilitate
- `<nav aria-label="Pagina N din T">`
- Butoanele de pagină au `aria-label` din `labels.pageOf` și `aria-current="page"` pe pagina activă
- Înapoi/înainte sunt `IconButton` cu `labels.prevPage` / `labels.nextPage`, dezactivate la capete
- Pauzele („…”) au `aria-hidden`

## Exemple
```tsx
<Pagination
  page={4}
  pageSize={20}
  total={1284}
  onPageChange={setPage}
  onPageSizeChange={setPageSize}
  labels={labels}
  locale="ro"
/>
```
