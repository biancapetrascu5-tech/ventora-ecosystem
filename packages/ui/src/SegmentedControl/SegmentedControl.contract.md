# SegmentedControl — Contract

## Scop
Selector exclusiv cu opțiuni vizibile, ca tab-uri orizontale compacte.
Folosit pentru filtrare, vizualizări alternate, setări cu 2-5 opțiuni.

## Props

| Prop | Tip | Default | Descriere |
|---|---|---|---|
| `options` | `SegmentedControlOption[]` | — | **Obligatoriu** — `{value, label, isDisabled?}` |
| `value` | `string` | — | Valoare controlată |
| `defaultValue` | `string` | prima opțiune | Valoare inițială necontrolată |
| `onChange` | `(value: string) => void` | — | Callback la schimbare |
| `fullWidth` | `boolean` | `false` | Opțiunile ocupă lățimea disponibilă |

## Accesibilitate
- Rol ARIA: `radiogroup` / `radio` (RAC RadioGroup)
- Navigare: săgeți stânga/dreapta
- `aria-label` transmis prin props

## Limitare
- 2–5 opțiuni maxim
- Nu înlocuiește `Select` pentru liste lungi

## Exemple

```tsx
<SegmentedControl
  aria-label="Vizualizare"
  options={[
    { value: 'list', label: 'Listă' },
    { value: 'grid', label: 'Grilă' },
    { value: 'map', label: 'Hartă' },
  ]}
  value={view}
  onChange={setView}
/>
```
