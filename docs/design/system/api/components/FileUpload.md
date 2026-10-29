# FileUpload

`component` · Forms · versiunea 1.0.1

A drop zone plus a file list with per-file progress, success and error.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `files` | `UploadFile[]` |  |
| `onSelect` | `(files: File[]) => void` |  |
| `onRemove` | `(f: UploadFile) => void` |  |
| `onRetry` | `(f: UploadFile) => void` |  |
| `accept` | `string` |  |
| `multiple` | `boolean` |  |
| `maxSize` | `number` |  |
| `hint` | `string` |  |
| `disabled` | `boolean` |  |
| `invalid` | `boolean` |  |
| `state` | `ForcedState \| "drag"` |  |
| `id` | `string` |  |

## Evenimente

`onRemove`, `onRetry`, `onSelect`

## Stări

- file-done
- file-uploading
- file-error-retry
- default
- hover
- drag-over
- zone-error
- disabled

## Note

No separate focus look on the drop zone (focus is on its inner link), so no forced focus frame.

Mai mult: `components/FileUpload/README.md`, exemplele: `components/FileUpload/preview.html`.
