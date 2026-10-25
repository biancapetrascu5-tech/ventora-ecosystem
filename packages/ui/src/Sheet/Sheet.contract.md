# Sheet / SheetSection — Contract

**Pachet:** `@ventora/ui`  
**Fișier:** `packages/ui/src/Sheet/Sheet.tsx`  
**Status:** CONFIRMAT

## Scop
Suprafața principală de lucru. Separă conținutul de canvas printr-o linie, nu umbră. `SheetSection` împarte o Sheet în secțiuni vizuale.

## Props Sheet
| Prop | Tip | Default | Descriere |
|---|---|---|---|
| `children` | `ReactNode` | — | Conținut |
| `className` | `string` | — | Clasă suplimentară |

## Exemple
```tsx
<Sheet>
  <SheetSection>
    <PageHeader title="Clienți" />
  </SheetSection>
  <SheetSection>
    <DataTable ... />
  </SheetSection>
</Sheet>
```
