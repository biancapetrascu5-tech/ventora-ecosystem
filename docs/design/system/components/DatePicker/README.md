# DatePicker

Choose a date, a date range or a time; weeks start on Monday in every language.

**Props.** `mode` (`date` → `Date`, `range` → `[Date, Date]`, `time` → `"HH:MM"`), `value` / `defaultValue` / `onChange`, `min`, `max`, `isDisabled(date)` (e.g. closed on Sundays), `step` / `timeFrom` / `timeTo` for time slots, `today` (for tests), `placeholder`, `invalid`, `disabled`.

**Calendar.** Month and weekday names come from `Intl` in the active locale. Today carries a peach ring (it is "now"); the selected day is a `primary` fill; a range fills between with `selected`; unavailable days are struck through, not just greyed. Keyboard: arrows move by day/week, PageUp/PageDown by month, Home/End to week edges, Enter selects. The footer offers "Azi" and "Golește".

Dates display as the locale's short numeric form (24.10.2026 in RO and DE, 24/10/2026 in FR and ES).
