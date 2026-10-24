# Drawer

A side panel over the current list for a record's detail or a longer form; full screen under 640px with a back arrow.

**Props.** `open` / `onOpenChange`, `title`, `subtitle`, `actions` (icon buttons in the header), `children`, `footer`, `width` (defaults to `drawer-width`), `modal` (false keeps the list interactive).

Open it from a DataTable row with `onRowClick` and mark that row with `activeRow`. Only one Drawer at a time; for a second level, navigate inside it.
