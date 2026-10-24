# AttentionList

"Au nevoie de tine" — the few things that need a person now, each with its own action, at the top of every app's Today screen.

**Props.** `items` `[{ id, icon, tone?: 'danger', title, meta?, time?, actions?: [{ label, icon?, primary?, quiet?, onClick }] }]`, `empty` (what to show when there is nothing: usually nothing at all). The icon sits on a peach tint (attention); money owed or errors use `tone: 'danger'`. Keep it short — three to five items; the rest belongs in a list.
