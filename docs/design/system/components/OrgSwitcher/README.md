# OrgSwitcher

Shows the business you are working in and your role; switches between the businesses you belong to.

**Props.** `orgs` `[{ id, name, role }]`, `currentId`, `onChange(id)`, `compact`. With one business it renders as static text. A search field appears from seven businesses. There is deliberately no "Adaugă afacere": businesses are created by the Ventora team and people join by invitation.

**Suspended business (S112).** An org with `suspended: true` shows "{role} · Acces oprit" (key `accessStopped`, 6 languages) and a lock instead of the tick; the row is `disabled` and `aria-disabled` and choosing it does nothing. The current business is never a suspended one — when the only business is suspended, the Hub shows HubBusinessSuspended instead. The same rows appear in AccountMenu on the phone.
