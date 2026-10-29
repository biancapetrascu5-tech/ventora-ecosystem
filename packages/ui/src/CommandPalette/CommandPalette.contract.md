# CommandPalette — Contract

**Pachet:** `@ventora/ui`  
**Fișier:** `packages/ui/src/CommandPalette/CommandPalette.tsx`  
**Status:** CONFIRMAT

## Scop
Căutare rapidă + lansare comenzi via Cmd/Ctrl+K. Overlay full-screen. Nu se folosește pentru căutare de date (DataTable are filtru propriu).

## Props
| Prop | Tip | Default | Descriere |
|---|---|---|---|
| `commands` | `CommandDef[]` | — | Lista de comenzi disponibile |
| `placeholder` | `string` | `'Caută comandă...'` | Placeholder input |
| `isOpen` | `boolean` | — | Stare controlată |
| `onOpenChange` | `(open: boolean) => void` | — | Callback stare |

## CommandDef
| Prop | Tip | Descriere |
|---|---|---|
| `id` | `string` | Identificator unic |
| `label` | `string` | Eticheta vizibilă |
| `icon` | `IconName` | Iconiță opțională |
| `group` | `string` | Grupare (secțiuni vizuale) |
| `onSelect` | `() => void` | Acțiune la selectare |

## Accesibilitate
- `role="listbox"`, `role="option"`, `aria-selected`
- ArrowDown/Up navighează; Enter selectează; Esc închide
- Shortcut Cmd/Ctrl+K toggle

## Exemple
```tsx
<CommandPalette
  commands={[
    { id: 'new-booking', label: 'Programare nouă', icon: 'plus', group: 'Booking', onSelect: () => router.push('/booking/new') },
    { id: 'settings', label: 'Setări', icon: 'settings', onSelect: () => router.push('/settings') },
  ]}
/>
```
