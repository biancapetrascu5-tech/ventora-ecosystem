# LineChart

A measure over time — revenue per month — with an optional grey comparison (last year) and the running period in peach.

**Props.** `labels`, `series` `[{ label, values, color: 1–5 | 'compare' }]`, `nowIndex` + `nowLabel` (the still-running period: a dashed segment and a peach point), `title`, `description`, `unit`, `format(v)`, `height`, `area` (a 10% wash under the main series).

**Rules.** 2px lines with round joins, one axis, clean ticks, legend from two series up, crosshair tooltip with every series' value, "Vezi ca tabel". On narrow widths every other month label is shown, always including the last one.
