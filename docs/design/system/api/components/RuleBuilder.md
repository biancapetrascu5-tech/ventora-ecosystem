# RuleBuilder

`component` · Comercial · versiunea 1.0.1

Eligibility rules for a Growth campaign: criterion, operator, value, joined by "all" or "any", with the estimated number of eligible businesses.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `criteria` | `RuleCriterion[]` | da |
| `rules` | `Rule[]` |  |
| `match` | `"all" \| "any"` |  |
| `onChange` | `(rules: Rule[]) => void` |  |
| `onMatchChange` | `(m: "all" \| "any") => void` |  |
| `estimate` | `number` |  |
| `className` | `string` |  |

## Evenimente

`onChange`, `onMatchChange`

## Stări

- match-all
- match-any
- empty
- stacked
- with-estimate

Mai mult: `components/RuleBuilder/README.md`, exemplele: `components/RuleBuilder/preview.html`.
