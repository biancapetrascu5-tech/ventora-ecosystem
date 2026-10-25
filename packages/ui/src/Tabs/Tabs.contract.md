# Tabs — Contract

**Pachet:** `@ventora/ui`  
**Fișier:** `packages/ui/src/Tabs/Tabs.tsx`  
**Status:** CONFIRMAT

## Scop
Navigare cu tab-uri pentru conținut secționat. Nu se folosește pentru navigare între pagini (folosești `Link`/`router`).

## Props
| Prop | Tip | Default | Descriere |
|---|---|---|---|
| `items` | `TabItem[]` | — | Definiția tab-urilor |
| `defaultSelectedKey` | `string` | primul tab | Tab selectat inițial |
| `selectedKey` | `string` | — | Tab selectat controlat |
| `onChange` | `(key: string) => void` | — | Callback la schimbare |
| `fullWidth` | `boolean` | `false` | Tab-urile ocupă lățimea completă |
| `className` | `string` | — | Clasă suplimentară pe root |

## TabItem
| Prop | Tip | Descriere |
|---|---|---|
| `id` | `string` | Identificator unic |
| `label` | `string` | Eticheta vizibilă |
| `children` | `ReactNode` | Conținut panou |
| `isDisabled` | `boolean` | Tab dezactivat |

## Accesibilitate
- `role="tablist"`, `role="tab"`, `role="tabpanel"` — generate automat de RAC
- Navigare: Tab → intră în tablist; ArrowLeft/Right → mișcă între tab-uri
- Tab dezactivat nu e focusabil

## Exemple
```tsx
<Tabs
  items={[
    { id: 'general', label: 'General', children: <GeneralSettings /> },
    { id: 'security', label: 'Securitate', children: <SecuritySettings /> },
  ]}
/>
```
