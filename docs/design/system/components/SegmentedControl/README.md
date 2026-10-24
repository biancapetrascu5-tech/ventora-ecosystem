# SegmentedControl

Switch between two to five views of the same content (Zi / Săptămână / Resurse; Listă / Calendar).

**Props.** `options` `[{ value, label, icon?, disabled? }]`, `value` / `onChange`, `label` (accessible group name), `size`, `block` (stretches to fill), `iconOnly` (labels move to tooltip and aria-label).

Arrow keys move the selection (roving tabindex). The selected segment is a raised `sheet` chip with a `control-border` edge — never peach, which is reserved for "now".
