# SlotPicker

`component` · Forms · versiunea 1.0.1

Free start times for a service and a person, as a grid of buttons; taken times stay visible, disabled and struck through, so people understand the day.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `slots` | `{ time: string; available?: boolean; }[]` | da |
| `value` | `string` |  |
| `onChange` | `(time: string) => void` |  |
| `label` | `string` |  |

## Evenimente

`onChange`

## Stări

- available
- taken
- selected
- none-selected
- fully-booked

Mai mult: `components/SlotPicker/README.md`, exemplele: `components/SlotPicker/preview.html`.
