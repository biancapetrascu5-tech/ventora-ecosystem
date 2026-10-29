# FileUpload — Contract

## Scop
Zonă de încărcare fișiere cu drag-and-drop și buton de browse.

## Props

| Prop | Tip | Default | Descriere |
|---|---|---|---|
| `title` | `string` | — | Text principal în dropzone |
| `hint` | `string` | — | Text secundar (extensii acceptate, dimensiune max) |
| `accept` | `string` | — | MIME types acceptate, ex. `"image/*,.pdf"` |
| `multiple` | `boolean` | `false` | Permite mai multe fișiere |
| `maxSize` | `number` | — | Dimensiune maximă per fișier (bytes) — fișierele mai mari sunt ignorate silențios |
| `isDisabled` | `boolean` | `false` | Dezactivat |
| `isInvalid` | `boolean` | `false` | Stare de eroare |
| `onChange` | `(files: File[]) => void` | — | Callback la adăugare/eliminare |
| `removeLabel` | `string` | `"Elimină"` | Prefix pentru aria-label al butonului de eliminare |

## Accesibilitate
- `role="button"` + `tabIndex=0` pe dropzone
- Enter/Space activează browse
- Buton de eliminare cu `aria-label` complet
- `aria-label` pe lista de fișiere

## Exemple

```tsx
<FileUpload
  title="Încarcă documente"
  hint="PDF, DOCX — max 10MB"
  accept=".pdf,.docx"
  multiple
  maxSize={10 * 1024 * 1024}
  onChange={setFiles}
/>
```
