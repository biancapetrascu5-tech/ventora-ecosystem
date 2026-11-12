# RuleBuilder

Eligibility rules for a Growth campaign: criterion, operator, value, joined by "all" or "any", with the estimated number of eligible businesses.

**Props.** `criteria` (the only criteria that exist as options: `{value, label, operators, values?, unit?}`), `rules`, `match` (`all` | `any`), `onChange`, `onMatchChange`, `estimate` (number; shown as "Aproximativ {n} afaceri eligibile").

**Rules.** Sensitive criteria are never passed in, so they cannot be chosen. The count is an estimate and never a list: no business can be identified from a rule. Under 520px each rule stacks (criterion, operator, value) with the remove button top right.

**`subject` (S139, 1.1.0).** The fixed line above the rules depends on what the rules are about: `subject="business"` (default) — "Afacerea trebuie să îndeplinească", only in Growth; `subject="contact"` — "Contactul trebuie să îndeplinească", in ClientDesk and CampaignKit. Both in the 6 languages (`matchLabel`, `matchLabelContact` in the library texts). `estimate` still speaks of businesses; ClientDesk and CampaignKit show their own count under the rules.
