# Select

Pick one value from a short list; a custom listbox, never the native `<select>`.

**Props.** `options` — `[{ value, label, description?, icon?, disabled? }]` or groups `[{ label, options: [...] }]`; `value` / `defaultValue` / `onChange(value)`; `placeholder` (defaults to "Alege" in the current language); `loading`; `invalid`; `disabled`; `size`.

**Keyboard.** Arrow keys open and move, Enter/Space choose, Home/End jump, typing letters jumps to a match, Esc closes. The popover flips above the field when there is no room below and is portalled to `body` (z-index `z-popover`).

**Use Combobox instead** when the list is longer than ~10 items or people know what they are looking for.
