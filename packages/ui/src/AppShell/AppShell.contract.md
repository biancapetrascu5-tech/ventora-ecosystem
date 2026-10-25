# AppShell — Contract

**Pachet:** `@ventora/ui`  
**Fișier:** `packages/ui/src/AppShell/AppShell.tsx`  
**Status:** CONFIRMAT

## Scop
Frame-ul complet al aplicației. Combină ContextBar (sus), Spine (stânga) și conținut (restul). Responsive fără cod suplimentar.

## Props
| Prop | Tip | Default | Descriere |
|---|---|---|---|
| `spine` | `ReactNode` | — | Componenta `Spine` |
| `contextBar` | `ReactNode` | — | Componenta `ContextBar` |
| `children` | `ReactNode` | — | Conținutul principal (Sheet etc.) |
| `className` | `string` | — | Clasă suplimentară |

## Exemple
```tsx
<AppShell
  contextBar={<ContextBar logo={<Logo />} title="Booking" actions={<IconButton icon="bell" label="Notificări" />} />}
  spine={<Spine items={navItems} activeId="bookings" />}
>
  <Sheet>
    <PageHeader title="Programări" />
    <DataTable ... />
  </Sheet>
</AppShell>
```
