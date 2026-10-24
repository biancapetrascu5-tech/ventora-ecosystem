# Button — Contract

## Scop
Acțiunea principală sau secundară dintr-un ecran. Un singur buton `primary` per ecran.
**Când NU se folosește:** pentru navigare pură (link-uri de text) — folosește `<a>` sau Next.js `<Link>`.

## Props

| Prop | Tip | Default | Descriere |
|---|---|---|---|
| `variant` | `'primary' \| 'secondary' \| 'quiet' \| 'danger'` | `'secondary'` | Ierarhia vizuală |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Înălțimea controlului |
| `isPending` | `boolean` | `false` | Stare de loading; afișează spinner + `aria-busy` |
| `isDisabled` | `boolean` | `false` | Dezactivat; opacitate 40% |
| `href` | `string` | — | Randat ca `<a>` (RAC Link behavior) |
| `onPress` | `(e: PressEvent) => void` | — | Apăsare (mouse, touch, Enter, Space) |
| `className` | `string` | — | Clasă CSS adițională |
| `children` | `ReactNode` | — | Conținut (text + opțional Icon) |

## Variante

| Variant | Când |
|---|---|
| `primary` | Acțiunea principală — un singur pe ecran |
| `secondary` | Acțiuni secundare cu bordură |
| `quiet` | Acțiuni terțiare fără bordură |
| `danger` | Acțiuni distructive (ștergere, anulare ireversibilă) |

## Dimensiuni

| Size | Înălțime | Token |
|---|---|---|
| `sm` | 28px | `--control-sm` |
| `md` | 36px | `--control-md` |
| `lg` | 44px | `--control-lg` |

## Stări
- **default**: culori de bază per variant
- **hover** `[data-hovered]`: fundal mai închis/deschis
- **pressed** `[data-pressed]`: fundal și mai închis
- **focus-visible** `[data-focus-visible]`: inel de focus `--focus-ring`
- **disabled** `[data-disabled]`: opacitate 40%, `pointer-events: none`
- **pending** `[data-pending]`: spinner + opacitate 70%, `aria-busy`

## Accesibilitate
- Rol ARIA: `button` (nativ)
- Tastatură: `Enter` și `Space` declanșează `onPress`
- Focus trap: nu — butonul e în taborder normal
- `isPending=true` → `aria-busy="true"` + `aria-disabled` implicit prin RAC

## Comportament
- `isPending` blochează interacțiunile
- `href` → randat ca `<a>` cu comportamentul corect de link (RAC gestionează)
- `onPress` preferabil față de `onClick` pentru compatibilitate touch/pointer

## Responsive
- Zona de atingere `lg` (44px) recomandată pe mobil
- Pe ecrane mici, stack vertical (gestionat de consumer)

## Teme
Toate culorile vin din tokeni; light/dark automat.

## Localizare
Textul butonului trebuie localizat de consumator. Butoanele încep cu verb și numesc rezultatul.

## Teste
- Renderizare în toate variantele fără violări axe
- `isPending=true` → spinner vizibil, `aria-busy` prezent
- `isDisabled=true` → nu răspunde la click
- Focus cu tastatura → inel de focus vizibil

## Exemple

```tsx
// Primary
<Button variant="primary" onPress={handleSave}>Salvează</Button>

// Loading
<Button variant="primary" isPending>Se procesează</Button>

// Danger cu confirmare
<Button variant="danger" onPress={handleDelete}>Șterge programarea</Button>

// Ca link
<Button href="/settings" variant="quiet">Setări</Button>
```

## Anti-exemple

```tsx
// ❌ Nu folosi pentru navigare de text
<Button variant="quiet">Citește mai mult</Button> // → folosește <a>

// ❌ Nu folosi >1 primary pe ecran
<Button variant="primary">Salvează</Button>
<Button variant="primary">Publică</Button>

// ❌ Nu hardcoda texte
<Button variant="primary">Save</Button> // → localizează
```
