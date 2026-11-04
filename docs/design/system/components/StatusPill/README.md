# StatusPill

The state of a record in one or two words, with an icon or dot — colour is never the only signal.

**Tones and their only meanings.** `attention` (peach) — now, in progress, needs your action: "În desfășurare", "Necesită confirmare". `done` (lime) — finished, confirmed, paid: "Confirmată", "Achitată". `danger` — failed, overdue: "Restantă", "Eșuată". `neutral` — everything else: "Ciornă", "Anulată de client", "Neconfirmată".

**Props.** `tone`, `children` (the word), `icon` (override the default, or `false` for a dot), `size`. Don't invent tones per app; map each app's states onto these four.

**EasyBook appointments (S116, D-B-11).** Așteaptă plata `neutral` + wallet · Neconfirmată `neutral` + clock · Confirmată `neutral` + check · În desfășurare `attention` · Încheiată `done` + check-check · Anulată `neutral` + x · Nu a venit `danger` + circle-x (S116-D8, see BookingStatuses). Keys `booking.status.*` in `i18n/booking.json`.
