# Toast

A brief confirmation after an action, with "Anulează" (undo) whenever the action can be reversed.

**useToast().toast({ title, description?, tone?, onUndo?, action?: { label, onClick }, duration? })** — inside VentoraProvider. Tones: `neutral` (default), `done`, `attention`, `danger`. Toasts with undo stay 8 seconds, others 6; at most three are visible; `aria-live="polite"` (danger uses `role="alert"`). Bottom-right on desktop, above the bottom nav on mobile.

**Copy.** Past tense, specific: "Programarea a fost mutată pe joi, 14:30". Errors say what to do: "Nu am putut salva. Verifică conexiunea și încearcă din nou." Prefer undo over a confirmation Dialog for anything reversible.
