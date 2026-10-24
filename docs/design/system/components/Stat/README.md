# Stat

One number with its label, an optional change against a named period and a short hint. The top row of HR, Finance and Analytics.

**Props.** `label`, `value` (already formatted, e.g. "48.250 lei"), `unit` (small text after the value: "din 6"), `delta` `{ value: '+12%', period: 'față de oct. 2025', direction?: 'up'|'down', good?: boolean }`, `hint`, `icon`, `tone` (`neutral` | `attention`), `onClick` (the whole tile becomes a button that opens the list behind the number).

**Rules.** The change is coloured by whether it is good, not by its direction (`done-ink` good, `danger-ink` bad), always with an arrow and the signed number, never colour alone. `tone="attention"` (peach mark, value in `attention-ink`) only when the number asks for action, like overdue invoices. Value in DM Sans 600 at `stat-value-size`, tabular figures. Lay several out with the `v-stats` grid (auto-fit, 200px minimum; two per row on phones).
