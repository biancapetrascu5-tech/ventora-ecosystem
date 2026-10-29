# Avatar

`component` · Status · versiunea 1.0.1

A person or business: photo, or initials on `avatar-bg`; AvatarGroup stacks several with a "+n" remainder.

## Proprietăți

| prop | tip | obligatorie | din |
| --- | --- | --- | --- |
| `name` | `string` | da | Avatar |
| `src` | `string` |  | Avatar |
| `size` | `"sm" \| "md" \| "lg" \| "xs" \| "xl"` |  | Avatar |
| `shape` | `"circle" \| "square"` |  | Avatar |
| `status` | `Tone \| "offline"` |  | Avatar |
| `people` | `{ name: string; src?: string; }[]` | da | AvatarGroup |
| `max` | `number` |  | AvatarGroup |
| `size` | `"sm" \| "md" \| "lg" \| "xs" \| "xl"` |  | AvatarGroup |

## Evenimente

—

## Stări

- xs
- sm
- md
- lg
- xl
- statusDone
- statusAttention
- statusDanger
- statusNeutral
- statusOffline
- square
- group
- groupOverflow

## Note

photo (src) not shown: no sample photo asset in the design system

Mai mult: `components/Avatar/README.md`, exemplele: `components/Avatar/preview.html`.
