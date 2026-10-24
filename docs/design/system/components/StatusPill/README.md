# StatusPill

The state of a record in one or two words, with an icon or dot — colour is never the only signal.

**Tones and their only meanings.** `attention` (peach) — now, in progress, needs your action: "În desfășurare", "Necesită confirmare". `done` (lime) — finished, confirmed, paid: "Confirmată", "Achitată". `danger` — failed, overdue: "Restantă", "Eșuată". `neutral` — everything else: "Ciornă", "Anulată de client", "Neconfirmată".

**Props.** `tone`, `children` (the word), `icon` (override the default, or `false` for a dot), `size`. Don't invent tones per app; map each app's states onto these four.
