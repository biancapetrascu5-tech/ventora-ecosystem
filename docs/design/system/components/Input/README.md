# Input

Single-line text entry; wrap it in FormField for the label, helper and error.

**Props.** `type` (`text`, `email`, `password` adds a show/hide toggle, `tel`, `number`…), `icon` (leading Lucide icon), `prefix` / `suffix` (units: "lei", "%", "min"), `clearable`, `loading`, `invalid` (set automatically by FormField when it has an `error`), `disabled`, `readOnly`, `size`, plus native input attributes.

**States.** Hover darkens the border to `control-border-hover`; focus draws the 2px ring around the whole control; error is a 2px `danger` boundary plus the message below (never colour alone); disabled and read-only sit on `sunken`.

**Text.** Placeholders show an example ("Ex.: Ana Popescu"), never the label. Use `inputMode` for numeric keyboards on mobile.
