# Radio / RadioGroup — Contract

## Scop
Selector mutual exclusiv dintr-un grup.

## Radio Props

| Prop | Tip | Descriere |
|---|---|---|
| `children` | `ReactNode` | Label asociat |
| `value` | `string` | **Obligatoriu** — valoarea opțiunii |
| `isDisabled` | `boolean` | Dezactivat individual |

## RadioGroup Props

| Prop | Tip | Default | Descriere |
|---|---|---|---|
| `label` | `string` | — | Titlul grupului |
| `value` | `string` | — | Valoare controlată |
| `defaultValue` | `string` | — | Valoare inițială necontrolată |
| `onChange` | `(v: string) => void` | — | Callback |
| `isDisabled` | `boolean` | `false` | Dezactivează tot grupul |
| `isInvalid` | `boolean` | `false` | Stare de eroare |
| `orientation` | `'vertical' \| 'horizontal'` | `'vertical'` | Direcția de layout |

## Exemple

```tsx
<RadioGroup label="Mărime" value={size} onChange={setSize}>
  <Radio value="sm">Mic</Radio>
  <Radio value="md">Mediu</Radio>
  <Radio value="lg">Mare</Radio>
</RadioGroup>
```
