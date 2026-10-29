# IconButton — Contract

## Scop
Buton cu un singur icon, fără text vizibil. Include tooltip obligatoriu.
**Când NU se folosește:** când există spațiu pentru text — preferă `Button` cu Icon.

## Props

| Prop | Tip | Default | Descriere |
|---|---|---|---|
| `icon` | `LucideIcon` | — | **Obligatoriu.** Iconul |
| `label` | `string` | — | **Obligatoriu.** Etichetă accesibilă + text tooltip |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Dimensiunea butonului |
| `isDisabled` | `boolean` | `false` | Dezactivat |
| `onPress` | `() => void` | — | Acțiunea |
| `className` | `string` | — | Clasă adițională |

## Stări
Identice cu Button: hover, pressed, focus-visible, disabled.

## Accesibilitate
- `aria-label={label}` — obligatoriu, furnizat automat
- Tooltip — apare la hover și la focus cu 600ms delay (per spec RAC)
- Zona de atingere min 44×44px pe mobil (CSS media query)

## Localizare
`label` trebuie localizat de consumator.

## Exemple

```tsx
<IconButton icon={XIcon} label="Închide" onPress={onClose} />
<IconButton icon={FilterIcon} label="Filtrează" size="sm" />
```

## Anti-exemple

```tsx
// ❌ Fără label
<IconButton icon={XIcon} onPress={onClose} />

// ❌ Dacă ai loc pentru text, folosește Button
<IconButton icon={PlusIcon} label="Adaugă" /> // → <Button><Icon icon={PlusIcon} />Adaugă</Button>
```
