# Menu — Contract

**Pachet:** `@ventora/ui`  
**Fișier:** `packages/ui/src/Menu/Menu.tsx`  
**Status:** CONFIRMAT

## Scop
Meniu contextual cu acțiuni. Se deschide la click/Enter pe trigger. Nu se folosește pentru navigare (folosești `Link`).

## Props
| Prop | Tip | Default | Descriere |
|---|---|---|---|
| `children` | `ReactElement` | — | Elementul trigger (Button, IconButton) |
| `items` | `MenuItemDef[]` | — | Lista plată de itemi |
| `sections` | `MenuSectionDef[]` | — | Itemi grupați cu separator |
| `onAction` | `(id: string) => void` | — | Callback la selecție |

## MenuItemDef
| Prop | Tip | Descriere |
|---|---|---|
| `id` | `string` | Identificator unic |
| `label` | `string` | Text vizibil |
| `icon` | `IconName` | Iconiță opțională |
| `isDisabled` | `boolean` | Dezactivat |
| `isDanger` | `boolean` | Culoare roșu danger |
| `shortcut` | `string` | Tastă scurtătură afișată |

## Accesibilitate
- RAC gestionează `role="menu"`, `role="menuitem"`, `aria-disabled`
- Navigare: ArrowDown/Up → itemi, Enter → selectare, Esc → închide

## Exemple
```tsx
<Menu
  items={[
    { id: 'edit', label: 'Editează', icon: 'edit' },
    { id: 'delete', label: 'Șterge', icon: 'trash', isDanger: true },
  ]}
  onAction={(id) => handleAction(id)}
>
  <IconButton icon="more-horizontal" label="Acțiuni" />
</Menu>
```
