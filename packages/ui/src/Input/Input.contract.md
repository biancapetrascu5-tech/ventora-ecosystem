# Input — Contract

## Scop
Câmp de introducere text de o singură linie.
**Când NU se folosește:** pentru mai mult de ~3 rânduri — folosește `Textarea`.

## Props

| Prop | Tip | Default | Descriere |
|---|---|---|---|
| `type` | `string` | `'text'` | text / email / password / tel / number / search |
| `isInvalid` | `boolean` | `false` | Aplică stilul de eroare |
| `iconStart` | `LucideIcon` | — | Icon în stânga |
| `iconEnd` | `LucideIcon` | — | Icon în dreapta (înlocuit de clearButton când `onClear` e prezent) |
| `prefix` | `ReactNode` | — | Text sau element prefixat (ex. „+40") |
| `suffix` | `ReactNode` | — | Text sau element sufixat (ex. „lei") |
| `onClear` | `() => void` | — | Activează butonul X de ștergere |
| `clearLabel` | `string` | `'Șterge'` | Etichetă accesibilă pentru butonul de ștergere |
| Toate props HTML input | — | — | `placeholder`, `disabled`, `readOnly`, `autoComplete`, etc. |

## Stări
- **default**: bordură `--control-border`
- **hover**: bordură `--control-border-hover`
- **focus**: bordură `--primary` + inel de focus
- **disabled**: opacitate 40%, fundal `--sunken`, cursor `not-allowed`
- **readOnly**: fundal `--sunken`, bordură `--line`, fără inel la focus
- **invalid**: bordură `--danger`

## Accesibilitate
- `aria-invalid` setat automat când `isInvalid=true`
- Conectat la `FormField` via `aria-describedby` (gestionat de FormField)
- Butonul de ștergere are `aria-label` obligatoriu, localizat de consumator
- `iconStart` și `iconEnd` sunt `aria-hidden`

## Responsive
- Lățime 100% din container
- Înălțime fixă `--control-md` (36px) — zona de atingere suficientă pe mobil

## Teme
Light/dark via tokeni CSS.

## Localizare
- `placeholder` trebuie localizat de consumator
- `clearLabel` trebuie localizat (default în română: `'Șterge'`)

## Exemple

```tsx
<Input placeholder="Caută" iconStart={SearchIcon} />
<Input type="email" placeholder="email@exemplu.com" isInvalid />
<Input prefix="+40" type="tel" placeholder="7xx xxx xxx" />
<Input
  value={search}
  onChange={e => setSearch(e.target.value)}
  onClear={() => setSearch('')}
  clearLabel="Șterge căutarea"
/>
```
