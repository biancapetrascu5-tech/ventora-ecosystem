# Combobox

Type to filter and pick one or many values — the search field for long lists (clients, services, staff).

**Props.** `options` (same shape as Select), `value` / `onChange` (a value, or an array with `multiple`), `multiple` (chosen values become chips; Backspace removes the last), `onQueryChange(q)` for server search with `filter={false}` and `loading`, `emptyText`, `icon` (defaults to `search`).

**Empty results** read "Niciun rezultat pentru „q”" in the active language. Matches search label and description, so a phone number finds the client.
