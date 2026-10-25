# Drawer — Contract

**Pachet:** `@ventora/ui`  
**Fișier:** `packages/ui/src/Drawer/Drawer.tsx`  
**Status:** CONFIRMAT

## Scop
Panou lateral care glisează din dreapta. Full-screen pe mobile (<640px). Folosit pentru formulare lungi, setări detaliate, previzualizare.

## Componente exportate
- `Drawer` — panoul lateral
- `DrawerTrigger` — wrapper trigger
- `DrawerHeader`, `DrawerBody`, `DrawerFooter` — slot-uri

## Props
| Prop | Tip | Default | Descriere |
|---|---|---|---|
| `title` | `string` | — | Titlul obligatoriu |
| `children` | `ReactNode` | — | Conținut body |
| `footer` | `ReactNode` | — | Acțiuni footer |
| `isDismissable` | `boolean` | `true` | Esc/click overlay închide |

## Accesibilitate
- RAC: focus trap, Esc, `role="dialog"`, `aria-modal`
- Animație slide-in respectă `prefers-reduced-motion`

## Exemple
```tsx
<DrawerTrigger>
  <Button>Setări avansate</Button>
  <Drawer title="Setări avansate" footer={<Button variant="primary">Salvează</Button>}>
    <FormField label="Timeout">
      <Input type="number" defaultValue="30" />
    </FormField>
  </Drawer>
</DrawerTrigger>
```
