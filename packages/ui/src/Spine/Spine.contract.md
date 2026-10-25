# Spine — Contract

**Pachet:** `@ventora/ui`  
**Fișier:** `packages/ui/src/Spine/Spine.tsx`  
**Status:** CONFIRMAT

## Scop
Navigarea laterală principală. Expanded (232px) pe desktop, collapsed (64px) cu toggle, bottom nav fix pe mobile (<640px).

## Props
| Prop | Tip | Default | Descriere |
|---|---|---|---|
| `items` | `NavItem[]` | — | Itemii de navigare |
| `activeId` | `string` | — | ID-ul itemului activ |
| `isCollapsed` | `boolean` | `false` | Stare comprimată |
| `onCollapsedChange` | `(collapsed: boolean) => void` | — | Toggle collapse |
| `footer` | `ReactNode` | — | Conținut la baza Spine (avatar user etc.) |
| `className` | `string` | — | Clasă suplimentară |

## NavItem
| Prop | Tip | Descriere |
|---|---|---|
| `id` | `string` | Identificator unic |
| `label` | `string` | Eticheta vizibilă |
| `icon` | `IconName` | Iconiță (obligatorie pentru mobile nav) |
| `href` | `string` | Dacă e link, nu buton |
| `badge` | `number` | Contor notificări |
| `isDisabled` | `boolean` | Dezactivat |

## Accesibilitate
- `<aside aria-label="Navigare principală">`
- Item activ: `aria-current="page"`
- Bottom nav separat cu `aria-label="Navigare mobilă"`

## Exemple
```tsx
<Spine
  items={[
    { id: 'home', label: 'Acasă', icon: 'home', href: '/' },
    { id: 'booking', label: 'Programări', icon: 'calendar', href: '/booking', badge: 3 },
  ]}
  activeId="booking"
/>
```
