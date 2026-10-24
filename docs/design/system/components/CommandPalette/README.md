# CommandPalette

Search and run anything from anywhere — pages, people, records, commands — with ⌘K / Ctrl+K.

**Props.** `open` / `onOpenChange`, `groups` `[{ label, items: [{ id?, label, description?, icon?, shortcut?, keywords?, onSelect }] }]`, `placeholder`, `onQueryChange` + `loading` (server results), `inline` (docs). Bind the shortcut with `useHotkey('mod+k', () => setOpen(true))`; the ContextBar search button opens it too.

Arrow keys move, Enter runs, Esc closes; the footer lists those keys in the active language. Full screen on mobile.
