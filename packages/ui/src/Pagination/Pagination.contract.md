# Pagination — Contract

**Pachet:** `@ventora/ui`  
**Fișier:** `packages/ui/src/Pagination/Pagination.tsx`  
**Status:** CONFIRMAT

## Scop
Navigare între pagini de rezultate. Afișează butoane numerice cu elipsă pentru pagini ascunse.

## Props
| Prop | Tip | Default | Descriere |
|---|---|---|---|
| `page` | `number` | — | Pagina curentă (1-based) |
| `totalPages` | `number` | — | Numărul total de pagini |
| `onPageChange` | `(page: number) => void` | — | Callback la schimbare pagină |
| `siblingCount` | `number` | `1` | Pagini afișate în jurul celei curente |
| `className` | `string` | — | Clasă suplimentară |

## Accesibilitate
- `role="navigation"` cu `aria-label="Paginare"`
- Butoane cu `aria-label="Pagina N"` și `aria-current="page"` pe pagina activă
- Elipsa are `aria-hidden`

## Exemple
```tsx
<Pagination page={3} totalPages={12} onPageChange={setPage} />
```
