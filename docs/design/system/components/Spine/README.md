# Spine

The app's navigation: app name (click to return to the Hub launcher), grouped items, an optional footer (usually a compact UsageMeter), "Restrânge meniul" at the bottom — and the bottom nav on mobile.

**Props.** `app` (key from `APPS`) or `appName` + `appIcon`, `sections` `[{ label?, items: [{ id, label, icon, badge?, badgeTone?, href?, onClick?, disabled? }] }]`, `activeId`, `onNavigate(item)`, `onBackToHub`, `footer`, `collapsed` / `defaultCollapsed` / `onCollapsedChange`, `bottomItems` (ids for the mobile bar; defaults to the first four, the rest go under "Mai multe").

**You are here.** The active item gets `selected` ground, a strong label and the peach `attention-mark` bar at the Spine's edge (bottom nav: a bar on top) — the only place peach marks location. Badges are peach because they count things that need you.

Item labels truncate in the Spine (full label as tooltip when collapsed); keep them to one or two words in every language.

**Collapsing (S118).** The control sits at the bottom of the Spine, under the footer, as an item: chevron-left + "Restrânge meniul". Collapsed, only the chevron pointing right is left, named "Extinde meniul" (tooltip and accessible name). The header keeps the app name and the grid icon (back to the Hub); there is no collapse control in the header any more. From 768 to 1023px the Spine is on icons by width and the control is hidden.
