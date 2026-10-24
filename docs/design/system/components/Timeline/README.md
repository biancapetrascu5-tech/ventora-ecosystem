# Timeline

Stages of a project as bars across weeks, with the peach "Azi" line and milestones. The Projects "Cronologie" view.

**Props.** `periods` `[{ label, current? }]`, `rows` `[{ id, label, sub?, start, end, status: 'planned'|'active'|'late'|'done', progress?, statusLabel? }]` or a milestone row `{ id, label, milestone, milestoneLabel }` (positions in period units, fractions allowed), `today` (period units), `label`, `minPeriodWidth`.

**Reading.** The label sits next to its bar, so short bars stay readable. Active: neutral bar with its progress fill; late: `attention-soft` with an `attention-mark` edge and "Întârziată 2 zile"; done: lime with a check; milestone: a navy diamond with its date. The stage names stay fixed on the left while the weeks scroll inside the component on narrow screens.
