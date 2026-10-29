# ContextBar — Contract

**Pachet:** `@ventora/ui`  
**Fișier:** `packages/ui/src/ContextBar/ContextBar.tsx`  
**Status:** CONFIRMAT

## Scop
Bara de sus a aplicației. Înălțime fixă 56px (`--contextbar-height`). Conține logo, titlul aplicației și acțiunile globale (notificări, cont).

## Props
| Prop | Tip | Default | Descriere |
|---|---|---|---|
| `logo` | `ReactNode` | — | Logo-ul aplicației |
| `title` | `string` | — | Numele aplicației |
| `actions` | `ReactNode` | — | IconButton-uri din dreapta |
| `className` | `string` | — | Clasă suplimentară |

## Accesibilitate
- Renderizat ca `<header role="banner">`

## Exemple
```tsx
<ContextBar
  logo={<Logo variant="mark" />}
  title="Booking"
  actions={<>
    <IconButton icon="bell" label="Notificări" variant="quiet" />
    <IconButton icon="settings" label="Setări" variant="quiet" />
  </>}
/>
```
