# RuleBuilder

Eligibility rules for a Growth campaign: criterion, operator, value, joined by "all" or "any", with the estimated number of eligible businesses.

**Props.** `criteria` (the only criteria that exist as options: `{value, label, operators, values?, unit?}`), `rules`, `match` (`all` | `any`), `onChange`, `onMatchChange`, `estimate` (number; shown as "Aproximativ {n} afaceri eligibile").

**Rules.** Sensitive criteria are never passed in, so they cannot be chosen. The count is an estimate and never a list: no business can be identified from a rule. Under 520px each rule stacks (criterion, operator, value) with the remove button top right.
