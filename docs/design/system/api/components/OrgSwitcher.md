# OrgSwitcher

`component` · Hub · versiunea 1.0.1

Shows the business you are working in and your role; switches between the businesses you belong to.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `orgs` | `Org[]` | da |
| `currentId` | `string \| number` |  |
| `onChange` | `(id: string \| number) => void` |  |
| `compact` | `boolean` |  |
| `defaultOpen` | `boolean` |  |

## Evenimente

`onChange`

## Stări

- default
- open
- search
- single
- compact
- long-name

## Note

Hover has no forced state prop and is not shown.

Mai mult: `components/OrgSwitcher/README.md`, exemplele: `components/OrgSwitcher/preview.html`.
