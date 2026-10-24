# Dialog

A modal decision that blocks the page: confirm, a short form, a destructive choice.

**Props.** `open` / `onOpenChange`, `title` (a question or the action: "Anulezi programarea Anei?"), `description` (the consequence, concretely), `children` (body), `footer` (buttons, secondary first, primary or danger last), `tone` (`default`, `danger` → `alertdialog` and a danger icon plate, `attention`), `icon`, `size` (`md`, `wide`), `dismissible`, `initialFocus`.

**Behaviour.** Focus is trapped and returns to the trigger; Esc and the scrim close it when dismissible; page scroll locks. Under 640px it becomes a bottom sheet with full-width stacked buttons.

**Copy.** The confirming button repeats the verb ("Anulează programarea"), the other keeps the status quo ("Păstrează programarea") — never "Da / Nu".
