# FileUpload

A drop zone plus a file list with per-file progress, success and error.

**Props.** `files` — `[{ id, name, size, status: 'uploading' | 'done' | 'error', progress?, error? }]` (the consumer owns uploading); `onSelect(File[])`, `onRemove(file)`, `onRetry(file)`, `accept`, `multiple`, `maxSize` (bytes, shown as "Maximum 10 MB per fișier"), `hint`, `disabled`, `invalid`.

**States.** Hover, drag-over (solid `primary` border on `selected`, text "Eliberează pentru a încărca"), disabled, error on the zone (FormField error) or on a single file (its own message with a retry). Done files show `circle-check`; the list stays neutral, success is the word "Încărcat".
