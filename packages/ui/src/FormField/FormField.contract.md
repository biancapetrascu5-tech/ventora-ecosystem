# FormField — Contract

## Scop
Wrapper pentru câmpuri de formular: label, hint, mesaj de eroare, asociere ARIA.

## Props

| Prop | Tip | Default | Descriere |
|---|---|---|---|
| `label` | `string` | — | **Obligatoriu** — eticheta câmpului |
| `children` | `ReactNode \| (props) => ReactNode` | — | **Obligatoriu** — câmpul propriu-zis |
| `hint` | `string` | — | Text de ajutor (ascuns când apare eroarea) |
| `error` | `string` | — | Mesaj de eroare (activează starea invalid) |
| `required` | `boolean` | `false` | Adaugă `*` vizual (câmpul tot trebuie `required` nativ) |

## Render prop

Când `children` este funcție, primește:
- `id`: string — legătura label↔câmp
- `isInvalid`: boolean — transmis la `Input`/`Select`/etc.
- `aria-describedby`: string | undefined — pointer spre hint/error

## Exemple

```tsx
<FormField label="Email" required error="Adresă invalidă">
  {({ id, isInvalid, 'aria-describedby': describedBy }) => (
    <Input id={id} isInvalid={isInvalid} aria-describedby={describedBy} type="email" />
  )}
</FormField>

<FormField label="Descriere" hint="Maxim 500 caractere">
  <Textarea rows={4} />
</FormField>
```
