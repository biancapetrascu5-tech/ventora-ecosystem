# Combobox — Contract

## Scop
Selector cu căutare liberă din listă. Folosit când `Select` nu e suficient (>15 opțiuni sau căutare necesară).

## Props

| Prop | Tip | Default | Descriere |
|---|---|---|---|
| `options` | `ComboboxOption[]` | — | **Obligatoriu** — `{value, label, isDisabled?}` |
| `value` | `string` | — | Valoare controlată |
| `defaultValue` | `string` | — | Valoare inițială necontrolată |
| `onChange` | `(value: string) => void` | — | Callback la selecție |
| `placeholder` | `string` | — | Placeholder câmp de căutare |
| `isDisabled` | `boolean` | `false` | Dezactivat |
| `isInvalid` | `boolean` | `false` | Stare de eroare |
| `noResultsLabel` | `string` | `"Niciun rezultat"` | Text când nu există rezultate — localizează |

## Accesibilitate
- Rol ARIA: `combobox` (RAC)
- Filtrare automată prin RAC
- Navigare: săgeți sus/jos, Enter selectează, Esc închide

## Exemple

```tsx
<Combobox
  options={cities}
  placeholder="Caută oraș..."
  noResultsLabel="Niciun oraș găsit"
  onChange={setCity}
/>
```
