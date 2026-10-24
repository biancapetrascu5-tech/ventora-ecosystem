# FormField

The wrapper every form control sits in: label, required marker, helper text and error message, wired with `id` and `aria-describedby`.

**Props.** `label`, `required` (adds " *" plus a screen-reader "(obligatoriu)"), `optional` (adds "(opțional)" — use when most fields are required, otherwise mark the required ones), `helper`, `error` (replaces the helper, adds the `circle-alert` icon and sets `invalid` on the child), `labelHidden`, `counter` (a node shown at the right of the label), `id`.

**Child.** Exactly one control (Input, Textarea, Select, Combobox, DatePicker, FileUpload). FormField clones it with `id`, `aria-describedby`, `invalid` and `required`.

**Error text** says what to do, calmly, in the second person: "Adresa nu pare completă. Verifică după @." — never "Câmp invalid". Labels wrap onto two lines rather than truncate, so German labels fit.
