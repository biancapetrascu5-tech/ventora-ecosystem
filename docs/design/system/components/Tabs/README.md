# Tabs

Switch between sibling sections of one record or page; the active tab has an ink label and a 2px `primary` underline.

**Props.** `items` `[{ value, label, icon?, count?, countTone?: 'attention', disabled? }]`, `value` / `onChange`, `label` (accessible name), `size`, `children` (a node, or a function of the active value, rendered in the tab panel).

Counts are neutral; a count that needs action uses `countTone: 'attention'` (peach). The list scrolls horizontally when labels do not fit (German), never wraps. Arrow keys, Home and End move between tabs.
