# Agenda

The day as a list — for the Today screen and for phones — with the peach "now" line between what's done and what's next, and the appointment in progress highlighted with its elapsed time.

**Props.** `items` `[{ id, start, end, title, subtitle?, staff?, status }]`, `now` ('HH:MM'), `onSelect(item)`, `activeId`, `showStaff`. An item whose time contains `now` becomes "În desfășurare" automatically. Every row has a status pill with a word; rows are 44px+ touch targets.
