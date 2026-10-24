# Button

Runs an action; the label is always a verb in sentence case ("Confirmă", "Trimite reamintire"), never "OK".

**Variants.** `primary` (navy; inverted to off-white in dark) at most once per view, for the action the screen exists for. `secondary` for every other action. `quiet` inside toolbars, tables and dense rows. `danger` only for an irreversible action, and only after the user chose it (in a Dialog footer or a Menu), never as the first thing on a page.

**Props.** `variant`, `size` (`sm` desktop-only toolbars, `md` default, `lg` = touch height), `icon` / `iconEnd` (Lucide names), `loading`, `disabled`, `block`, `href` (renders a link), plus any native button attribute.

**States.** Default, hover, focus-visible (2px `focus-ring`, 2px offset), pressed, disabled (`ink-disabled` on `sunken`), loading (spinner replaces the leading icon, label stays so the width never jumps, `aria-busy`). A button has no error state: errors live on the field or in a Toast.

**Do.** Name the outcome: "Salvează programarea", "Trimite invitația". Keep the label on one line; it truncates rather than wraps. **Don't.** "OK", "Da", "Click aici", Title Case, emoji, two primaries side by side.

**Mobile.** Every control grows to `control-lg` (44px) under 640px or on coarse pointers; in Dialog footers buttons stack full-width with the primary on top.
