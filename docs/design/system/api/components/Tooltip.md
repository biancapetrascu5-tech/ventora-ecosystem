# Tooltip

`component` · Overlays · versiunea 1.0.1

A short label for an icon-only control or a truncated value, on hover and keyboard focus (400ms delay); never essential information.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `content` | `ReactNode` | da |
| `shortcut` | `string[]` |  |
| `placement` | `string` |  |
| `delay` | `number` |  |
| `open` | `boolean` |  |
| `children` | `ReactElement` | da |

## Evenimente

—

## Stări

- closed
- open-top
- open-bottom
- open-right
- shortcut

## Note

Light/Dark frames show the tooltip pinned in place (static .v-tooltip markup), because the live tooltip renders outside the frame and takes the page theme.

Mai mult: `components/Tooltip/README.md`, exemplele: `components/Tooltip/preview.html`.
