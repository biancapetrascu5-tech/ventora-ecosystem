# Radio

`component` · Forms · versiunea 1.1.0

One choice from a small set, all options visible; use RadioGroup, which renders the fieldset, legend and error.

## Proprietăți

| prop | tip | obligatorie | din |
| --- | --- | --- | --- |
| `label` | `ReactNode` |  | Radio |
| `description` | `ReactNode` |  | Radio |
| `name` | `string` |  | Radio |
| `value` | `string \| number` |  | Radio |
| `checked` | `boolean` |  | Radio |
| `onChange` | `() => void` |  | Radio |
| `disabled` | `boolean` |  | Radio |
| `invalid` | `boolean` |  | Radio |
| `state` | `ForcedState` |  | Radio |
| `legend` | `ReactNode` |  | RadioGroup |
| `name` | `string` |  | RadioGroup |
| `options` | `Option<V>[]` | da | RadioGroup |
| `value` | `V` |  | RadioGroup |
| `defaultValue` | `V` |  | RadioGroup |
| `onChange` | `(v: V) => void` |  | RadioGroup |
| `orientation` | `"vertical" \| "horizontal"` |  | RadioGroup |
| `required` | `boolean` |  | RadioGroup |
| `error` | `ReactNode` |  | RadioGroup |
| `helper` | `ReactNode` |  | RadioGroup |
| `disabled` | `boolean` |  | RadioGroup |
| `invalid` | `boolean` |  | RadioGroup |

## Evenimente

`onChange`

## Stări

- default
- checked
- hover
- focus
- pressed
- disabled
- disabled-checked
- invalid
- group-error
- group-helper
- group-horizontal
- group-disabled
- option-disabled
- option-description

## Note

RadioGroup disabled renders without visible dimming in the bundle.

Mai mult: `components/Radio/README.md`, exemplele: `components/Radio/preview.html`.
