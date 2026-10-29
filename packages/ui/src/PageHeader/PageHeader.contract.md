# PageHeader — Contract

**Pachet:** `@ventora/ui`  
**Fișier:** `packages/ui/src/PageHeader/PageHeader.tsx`  
**Status:** CONFIRMAT

## Scop
Titlul paginii curente + acțiunile principale. Sticky la top în Sheet.

## Props
| Prop | Tip | Default | Descriere |
|---|---|---|---|
| `title` | `string` | — | Titlul paginii (H1) |
| `subtitle` | `string` | — | Subtitlu opțional |
| `actions` | `ReactNode` | — | Butoane de acțiune din dreapta |
| `backHref` | `string` | — | URL pentru butonul înapoi |
| `className` | `string` | — | Clasă suplimentară |

## Accesibilitate
- `title` este renderizat ca `<h1>`
- `backHref` produce un `<a>` cu `aria-label="Înapoi"`

## Exemple
```tsx
<PageHeader
  title="Programări"
  subtitle="83 programări această săptămână"
  actions={<Button variant="primary" icon="plus">Programare nouă</Button>}
/>
```
