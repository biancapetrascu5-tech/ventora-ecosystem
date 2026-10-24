# Select — Contract

## Scop
Selector dintr-o listă de opțiuni predefinite.
**Niciodată** `<select>` nativ — folosește întotdeauna acest component.
**Când NU se folosește:** pentru >50 opțiuni sau căutare liberă — folosește `Combobox`.

## Props

| Prop | Tip | Default | Descriere |
|---|---|---|---|
| `options` | `SelectOption[]` | — | **Obligatoriu.** Lista de opțiuni `{value, label, isDisabled?}` |
| `value` | `string` | — | Valoarea controlată |
| `defaultValue` | `string` | — | Valoarea inițială necontrolată |
| `onChange` | `(value: string) => void` | — | Callback la schimbare |
| `placeholder` | `string` | — | Text afișat când nimic nu e selectat |
| `isDisabled` | `boolean` | `false` | Dezactivat |
| `isInvalid` | `boolean` | `false` | Stare de eroare |
| `name` | `string` | — | Numele câmpului pentru formulare HTML |
| `id` | `string` | — | ID pentru asocierea cu `<label>` |

## Stări
- **default**: bordură control-border
- **hover**: bordură control-border-hover, fundal state-hover
- **focus-visible**: inel de focus, bordură primară
- **open**: popover vizibil
- **disabled**: opacitate 40%, fundal sunken
- **invalid**: bordură danger

## Accesibilitate
- Rol ARIA: `combobox` (gestionat de RAC)
- Tastatură: Space/Enter deschide, săgeți navighează, Esc închide
- Anunță opțiunea selectată screen reader-ului
- Marcaj checklist (✓) pentru opțiunea selectată

## Responsive
- Lățime 100%
- Popover min-width egal cu trigger-ul

## Teme
Popover folosește `--raised` pentru suprafață.

## Localizare
`placeholder` și `label` trebuie localizate de consumator.

## Exemple

```tsx
<Select
  options={[
    { value: 'ro', label: 'Română' },
    { value: 'en', label: 'English' },
  ]}
  placeholder="Alege limba"
  onChange={setLocale}
/>
```

## Anti-exemple

```tsx
// ❌ Niciodată select nativ
<select>...</select>

// ❌ Nu hardcoda placeholder
<Select placeholder="Choose..." /> // → localizează: „Alege"
```
