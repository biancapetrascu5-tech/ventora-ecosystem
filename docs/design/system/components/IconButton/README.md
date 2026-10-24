# IconButton

A square button carrying a single Lucide icon; `label` is required and becomes the accessible name and the native tooltip.

**Props.** `icon`, `label` (required, a verb: "Editează", "Acțiuni"), `variant` (`quiet` default, `secondary`, `primary`), `size` (`sm` 28, `md` 36, `lg` 44), `pressed` (toggle buttons), `badge` (a number, or `true` for a dot — always peach because it means "needs your attention"), `loading`, `disabled`.

**Use for** row actions (the kebab `ellipsis-vertical`), toolbar tools, close buttons. **Don't** use an icon alone for an action people would not recognise without a word; use Button with `icon` instead.
