# Toggle — Contract

## Scop
Switch on/off pentru setări și preferințe. Intern este RAC `Switch`.

## Props

| Prop | Tip | Default | Descriere |
|---|---|---|---|
| `children` | `ReactNode` | — | Label |
| `isSelected` | `boolean` | — | Controlat |
| `defaultSelected` | `boolean` | `false` | Inițial necontrolat |
| `onChange` | `(v: boolean) => void` | — | Callback |
| `isDisabled` | `boolean` | `false` | Dezactivat |
| `isInvalid` | `boolean` | `false` | Stare de eroare |

## Stări
- off (default), on (selected), hover, pressed, focus-visible, disabled, invalid

## Exemple

```tsx
<Toggle>Notificări email</Toggle>
<Toggle isSelected onChange={setEnabled}>Mod întuneric</Toggle>
<Toggle isDisabled>Funcție indisponibilă</Toggle>
```
