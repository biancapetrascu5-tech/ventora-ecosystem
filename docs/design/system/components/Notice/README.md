# Notice

An inline message inside a page, form or panel — a sign-in error, an expired invitation, a plan notice — with an icon, a title, one or two sentences and optional actions.

**Props.** `tone` (`neutral` info, `attention` needs your action, `done` confirmed, `danger` error — the icon changes with it), `title`, `children`, `icon`, `actions`.

**Use it** for something that belongs to the page and stays until it is resolved. Use a Toast for a passing confirmation after an action, a FormField error for a single field, and EmptyState when the whole area is empty. Text is `ink` / `ink-secondary` on the tone's soft ground in both themes.
