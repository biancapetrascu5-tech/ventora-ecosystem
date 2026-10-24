# Toggle

An on/off setting that takes effect immediately (no Save button); role `switch`.

**Props.** `label`, `description`, `checked` / `onChange`, `loading` (while the change is saved — spinner in the thumb), `invalid` (the save failed; pair with a Toast that says why), `disabled`, `labelPosition` (`end` default, `start` for settings lists where the switch aligns right).

**Don't** use a Toggle inside a form that has a submit button — use Checkbox there.
