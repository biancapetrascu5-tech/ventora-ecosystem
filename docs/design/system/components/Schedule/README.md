# Schedule

The calendar grid behind every time-based view: day (one column), week (seven day columns) and resources (one column per person, room or chair), with the peach "now" line.

**Props.** `columns` `[{ id, label, sub?, person?, today?, closed? }]`, `events` `[{ id, col, start: 'HH:MM', end, title, subtitle?, status }]`, `from` / `to` (hours shown), `now` ('HH:MM'), `nowColumn` (the today column in week view; other days get a faint dashed line), `onEventClick(event)`, `onSlotClick(columnId, 'HH:MM')` (snaps to 15 minutes — create here), `activeId`, `height` (the grid scrolls inside it), `minColumnWidth`.

**Statuses.** `confirmed` (neutral fill), `unconfirmed` (dashed outline — waiting for the client), `now` (peach fill, navy text — the only peach in the grid), `done` (sunken, with a lime check), `cancelled` (dashed, struck through), `noshow` (danger tint), `blocked` (hatched — breaks, time off). Overlapping appointments share the column side by side.

**Sizes.** One hour is `schedule-hour-height` (64px); the hours column is `schedule-gutter`. Appointments of 30 minutes or less show time and title on one line; under an hour the subtitle hides.

**Responsive.** The grid scrolls horizontally inside itself when columns don't fit (week or many resources on a phone); the page never does. On phones prefer the day view with a person picker, or the Agenda.
