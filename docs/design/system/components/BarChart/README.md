# BarChart

Columns for periods or days, horizontal bars for categories ranked by size. Built on the chart tokens.

**Props.** `data` `[{ label, value, compare?, now?, nowLabel?, share? }]`, `orientation` (`vertical` | `horizontal`), `title`, `description`, `unit`, `format(v)`, `compareLabel`, `color` (1–5), `height`.

**Rules.** One series in `chart-1`; the comparison is always grey (`chart-compare`), next to it, with a legend; the running period (`now`) is peach (`chart-now`) and its tick label is in `attention-ink`. Bars are at most 24px with a 4px rounded end on a square base; a clean scale (0 / 50 / 100 / 150 …); gridlines 1px `chart-grid`. Hover or focus shows a tooltip; "Vezi ca tabel" switches to the same numbers as a table. Horizontal bars: label, bar, value and share on one row; on phones the bar moves under the label.
