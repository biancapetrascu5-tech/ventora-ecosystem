# Textarea — Contract

## Scop
Câmp de text multi-linie.

## Props

| Prop | Tip | Default | Descriere |
|---|---|---|---|
| `isInvalid` | `boolean` | `false` | Aplică stilul de eroare |
| `noResize` | `boolean` | `false` | Blochează resize-ul manual |
| Toate props HTML textarea | — | — | `placeholder`, `rows`, `disabled`, `readOnly`, etc. |

## Stări
Identice cu Input: hover, focus, disabled, readOnly, invalid.

## Responsive
- Lățime 100%
- Înălțime minimă 2.5× `--control-md`

## Exemple

```tsx
<Textarea placeholder="Descrie serviciul" rows={4} />
<Textarea isInvalid noResize placeholder="Mesaj" rows={3} />
```
