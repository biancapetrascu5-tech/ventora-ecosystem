# Icon — Contract

## Scop
Învelire uniformă a iconurilor Lucide React cu dimensiunile și strokeWidth-ul corecte din designul Ventora.
**Când NU se folosește:** pentru ilustrații decorative sau logo-uri — acestea sunt SVG-uri inline dedicate.

## Props

| Prop | Tip | Default | Descriere |
|---|---|---|---|
| `icon` | `LucideIcon` | — | **Obligatoriu.** Componenta Lucide importată |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | 16px / 20px / 24px |
| `label` | `string` | — | Etichetă accesibilă; fără label → `aria-hidden` |
| `className` | `string` | — | Clasă CSS adițională |

## Dimensiuni

| Size | px | Token |
|---|---|---|
| `sm` | 16 | `--icon-sm` |
| `md` | 20 | `--icon-md` |
| `lg` | 24 | `--icon-lg` |

## Stări
Nu are stări interactive proprii. Culoarea se moștenește din context via `color: inherit`.

## Accesibilitate
- Fără `label`: `aria-hidden="true"` automat — iconul e pur decorativ
- Cu `label`: `aria-label="{label}"` — folosit pentru butoane de icon-only
- `focusable={false}` previne focus-ul SVG-ului în IE/Edge

## Comportament
- `strokeWidth` fix la 1.75 — valoarea din design system
- Nu animat implicit; animațiile (spinner, loading) se adaugă via `className`

## Responsive
Nu are breakpoints; dimensiunea e fixă per size prop.

## Teme
Culoarea se moștenește din `var(--ink)` sau contextul părintelui.

## Localizare
`label` trebuie localizat de consumator.

## Teste
- Renderizează fără violări axe
- `aria-hidden` prezent când `label` lipsă
- `aria-label` prezent când `label` e furnizat

## Exemple

```tsx
// Decorativ (cel mai comun)
<Icon icon={CalendarIcon} size="md" />

// Accesibil (în IconButton)
<Icon icon={XIcon} size="md" label="Închide" />

// Spinner (animat extern)
<Icon icon={Loader2Icon} size="md" className={spinnerStyles.spin} aria-label="Se încarcă" />
```

## Anti-exemple

```tsx
// ❌ Nu folosi lucide direct în componente
<Calendar size={20} />

// ❌ Nu hardcoda dimensiunea în px
<Icon icon={CalendarIcon} size={20} />
```
