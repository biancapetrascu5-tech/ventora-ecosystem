# Checkbox — Contract

## Scop
Selector boolean independent sau în grup.

## Props

| Prop | Tip | Default | Descriere |
|---|---|---|---|
| `children` | `ReactNode` | — | Label asociat |
| `isInvalid` | `boolean` | `false` | Stare de eroare |
| `isSelected` | `boolean` | — | Controlat |
| `defaultSelected` | `boolean` | `false` | Inițial necontrolat |
| `onChange` | `(v: boolean) => void` | — | Callback la schimbare |
| `isDisabled` | `boolean` | `false` | Dezactivat |
| `isIndeterminate` | `boolean` | `false` | Stare intermediară (–) |
| `value` | `string` | — | Valoare pentru CheckboxGroup |

## Stări
- default, hover, pressed, focus-visible, selected, indeterminate, disabled, invalid

## Exemple

```tsx
<Checkbox>Acceptă termenii</Checkbox>
<Checkbox isSelected isIndeterminate>Selectează tot</Checkbox>
<Checkbox isInvalid>Câmp obligatoriu</Checkbox>
```
