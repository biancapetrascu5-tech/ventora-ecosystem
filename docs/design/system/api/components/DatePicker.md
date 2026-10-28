# DatePicker

`component` · Forms · versiunea 1.0.1

Choose a date, a date range or a time; weeks start on Monday in every language.

## Proprietăți

| prop | tip | obligatorie | din |
| --- | --- | --- | --- |
| `mode` | `"date" \| "range" \| "time"` |  | DatePicker |
| `value` | `string \| Date \| [Date, Date]` |  | DatePicker |
| `defaultValue` | `string \| Date \| [Date, Date]` |  | DatePicker |
| `onChange` | `(v: any) => void` |  | DatePicker |
| `placeholder` | `string` |  | DatePicker |
| `min` | `Date` |  | DatePicker |
| `max` | `Date` |  | DatePicker |
| `isDisabled` | `(d: Date) => boolean` |  | DatePicker |
| `step` | `number` |  | DatePicker |
| `timeFrom` | `string` |  | DatePicker |
| `timeTo` | `string` |  | DatePicker |
| `today` | `Date` |  | DatePicker |
| `invalid` | `boolean` |  | DatePicker |
| `disabled` | `boolean` |  | DatePicker |
| `size` | `"sm" \| "md" \| "lg"` |  | DatePicker |
| `open` | `boolean` |  | DatePicker |
| `defaultOpen` | `boolean` |  | DatePicker |
| `id` | `string` |  | DatePicker |
| `mode` | `"date" \| "range"` |  | Calendar |
| `value` | `any` |  | Calendar |
| `onChange` | `(v: any) => void` | da | Calendar |
| `min` | `Date` |  | Calendar |
| `max` | `Date` |  | Calendar |
| `isDisabled` | `(d: Date) => boolean` |  | Calendar |
| `today` | `Date` |  | Calendar |

## Evenimente

`onChange`

## Stări

- open
- calendar-date
- calendar-range
- today
- selected
- unavailable
- date-value
- range-value
- time-value
- empty
- invalid
- disabled

## Note

Open popover (with Azi/Golește footer) and time list shown open only in the Light frame; other frames show the calendar inline via Calendar.

Mai mult: `components/DatePicker/README.md`, exemplele: `components/DatePicker/preview.html`.
