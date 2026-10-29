# Timeline

Stages of a project as bars across weeks, with the peach "Azi" line and milestones. The TaskBoard "Cronologie" view.

**Props.** `periods` `[{ label, current? }]`, `rows` `[{ id, label, sub?, start, end, status: 'planned'|'active'|'late'|'done', progress?, statusLabel? }]` or a milestone row `{ id, label, milestone, milestoneLabel }` (positions in period units, fractions allowed), `today` (period units), `label`, `minPeriodWidth`.

**Reading.** The label sits next to its bar, so short bars stay readable. Active: neutral bar with its progress fill; late: `attention-soft` with an `attention-mark` edge and "Întârziată 2 zile"; done: lime with a check; milestone: a navy diamond with its date. The stage names stay fixed on the left while the weeks scroll inside the component on narrow screens.

**Opening and "today" (P-2, S71).** When the periods do not all fit, Timeline opens scrolled so that today sits at about a third of the visible width: you see a little of what has passed and mostly what comes next. The "today" label always stays on screen: centred on the line when it fits, otherwise moved inwards (also when you scroll the line out of view).
