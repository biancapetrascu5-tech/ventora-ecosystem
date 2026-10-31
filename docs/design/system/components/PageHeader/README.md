# PageHeader

The page's title block inside the content: optional breadcrumbs, title, one-line description, meta pills, actions, tabs.

**Props.** `title`, `description`, `breadcrumbs` `[{ label, href?, onClick? }]`, `meta` (StatusPills), `actions` (secondary buttons first, at most one primary, overflow in a kebab Menu), `tabs` (a Tabs element). Actions wrap under the title when space runs out (German), they never shrink the title.

**On the phone (S112).** Keep the actions: they wrap under the title. Show the same pair as on desktop — the main action and a kebab "Mai multe acțiuni" Menu — and move everything else into the menu; never drop actions below 768px.
