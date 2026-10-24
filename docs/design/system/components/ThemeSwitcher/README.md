# ThemeSwitcher

Light / Dark / System — the three options every Ventora surface offers.

**Props.** `value` / `onChange` (controlled) or none (uses `useTheme()`, which stores the choice in `localStorage` under `ventora-theme` when available and sets `data-theme` on `<html>`; System follows the OS live), `iconOnly`, `size`, `block`.

Every colour in the system is a token with a light and a dark value, so switching never needs per-component work.
