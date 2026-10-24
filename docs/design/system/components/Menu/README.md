# Menu

A list of actions opened from a trigger — the kebab on rows, "Creează", account menus.

**Props.** `trigger` (a Button or IconButton element; Menu wires `aria-haspopup`, `aria-expanded`), `items` — `{ label, icon?, description?, shortcut?, onSelect, disabled?, destructive?, checked? }`, `{ separator: true }`, `{ heading }`, `{ render: node }` for a custom row; `placement` (`bottom-end` default), `label`, `width`, `open` / `defaultOpen` / `onOpenChange`.

**Rules.** Destructive actions go last, after a separator, in `danger-ink` — and open a confirming Dialog. Disabled items stay visible so people learn the action exists. Keyboard: arrows, Home/End, Enter/Space, Esc returns focus to the trigger. Positioned with `getBoundingClientRect` in a portal; flips when out of room.
