# Dialog — Contract

**Pachet:** `@ventora/ui`  
**Fișier:** `packages/ui/src/Dialog/Dialog.tsx`  
**Status:** CONFIRMAT

## Scop
Modal de confirmare sau formular. Bottom sheet pe mobile (<640px). Nu se folosește pentru notificări non-blocante (folosești Toast).

## Componente exportate
- `Dialog` — modalul în sine
- `DialogTrigger` — wrapper pentru trigger
- `DialogHeader`, `DialogBody`, `DialogFooter` — slot-uri de layout

## Props Dialog
| Prop | Tip | Default | Descriere |
|---|---|---|---|
| `title` | `string` | — | Titlul obligatoriu |
| `children` | `ReactNode` | — | Conținut body |
| `tone` | `'default'\|'danger'\|'attention'` | `'default'` | Tonul vizual |
| `isDismissable` | `boolean` | `true` | Se poate închide cu Esc/click overlay |
| `footer` | `ReactNode` | — | Acțiunile din footer |

## Accesibilitate
- RAC gestionează focus trap, Esc, `role="dialog"`, `aria-modal`
- `title` e obligatoriu pentru `aria-label`

## Exemple
```tsx
<DialogTrigger>
  <Button variant="danger">Șterge cont</Button>
  <Dialog title="Confirmare ștergere" tone="danger" footer={
    <><Button variant="quiet" onPress={close}>Anulează</Button>
      <Button variant="danger" onPress={handleDelete}>Șterge</Button></>
  }>
    Această acțiune este ireversibilă.
  </Dialog>
</DialogTrigger>
```
