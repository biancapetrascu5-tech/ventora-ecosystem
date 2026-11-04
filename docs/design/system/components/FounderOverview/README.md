# FounderOverview

Founder · "Prezentare", the first page after sign-in: the numbers that matter today, what needs you, the businesses close to a limit and the latest businesses created. Romanian only (S57); keys `founder.overview.*` in `i18n/founder-overview.json`.

**The numbers.** Four `Stat` cards: "Afaceri active" and "Venit lunar recurent" (with the change against last month), "Afaceri în probă" (how many end in 3 days), "Plăți eșuate" (tone `attention` when there is at least one, with the amount to collect).

**"Au nevoie de tine".** An `AttentionList`, newest first by kind: new Hub requests ("Deschide cererile", FounderRequests); open support requests ("Deschide suportul", FounderSupportInbox); failed payments (`danger`, "Deschide plățile", FounderBusinessBilling); exceptions that expire within 7 days (with "Prelungește"); Stripe disputes (`danger`, "Răspunde în Stripe", with the deadline). Peach only for what waits for you; red for money at risk.

**Close to limits.** The businesses over 80% of a limit this month: business, limit, a `ProgressBar` with "948 din 1.000", and "Vezi toate în Consum" (FounderUsage).

**Recently created.** A `DataTable`: business, bundle or apps, created, status ("Proprietarul n-a intrat încă", "În probă", "Activă"); "Vezi toate afacerile".

**States.** All good ("Nimic nu te așteaptă", failed payments 0); the first day ("Nicio afacere încă" + "Afacere nouă"); loading error (Notice `danger`, "Încearcă din nou", skeleton cards; "Datele afacerilor nu sunt afectate.").

Shown at 1280 and 390, in light and dark, with the Spine's "Restrânge meniul" at the bottom (S118).
