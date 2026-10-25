# Tooltip — Contract

**Pachet:** `@ventora/ui`  
**Fișier:** `packages/ui/src/Tooltip/Tooltip.tsx`  
**Status:** CONFIRMAT

## Scop
Informație suplimentară la hover/focus. Nu se folosește pentru conținut critic sau acțiuni.

## Props
| Prop | Tip | Default | Descriere |
|---|---|---|---|
| `content` | `string` | — | Textul tooltip-ului |
| `children` | `ReactElement` | — | Elementul trigger |
| `placement` | `Placement` | `'top'` | Poziționare față de trigger |
| `delay` | `number` | `700` | ms până la afișare |

## Accesibilitate
- RAC gestionează `role="tooltip"` și `aria-describedby` pe trigger
- Apare la focus keyboard și hover

## Exemple
```tsx
<Tooltip content="Ștergere permanentă">
  <IconButton icon="trash" label="Șterge" variant="danger" />
</Tooltip>
```
