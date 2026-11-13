# FounderNotifications

Founder — the bell and the automatic stop (S136, P22, 5.8, D5-11). Romanian only for now; keys `founder.notifications.*` in `i18n/founder.json`.

**The bell** (NotificationsPanel in the Founder ContextBar): automatic stops, support requests, invoices not issued, setup requests; unread with a dot, "Marchează toate ca citite".

**The page.** Tabs "Necitite · n" and "Toate", a type filter, rows with icon, title, one sentence, type and time, "Nou" on the unread, "Vezi".

**Automatic stop.** The Growth Engine stops a campaign or an offer on its own for one of four reasons: too many "Nu mă interesează" (above the disturbance threshold, 5% by default), complaints (3 from owners in 24 h), budget reached (trials or discounts used up), error (the offer no longer matches the commercial model). The notification says what stopped and why. "Vezi" opens a Drawer: the Notice "Campania s-a oprit singură" (nothing deleted, statistics stay), reason, what stopped (and what stays on), when, by whom ("Growth Engine (automat)"), how many businesses saw it; the four reasons with their thresholds (changed in Growth › Control); "Vezi campania", "Închide", "Repornește".

**"Repornește", with confirmation** (Dialog): the threshold stays the same — if nothing changed, it stops again; "Ce ai schimbat" is required and goes into the log; "Anunță-mă dacă se oprește din nou" (bell and e-mail) is checked by default. Businesses that said "Nu mă interesează" don't see it again for 30 days, whatever happens. After: a Toast "Am repornit „…”".

**States.** Unread; all; empty ("Nicio notificare").

Every stop and restart is in the Growth log.

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S136, Faza 5).**
- **Who approves translations.** Recommendation: only Bianca (Founder owner) in v1; later a translator role per language, never the AI.
- **AI proposals.** Recommendation: always a draft marked "Propunere AI · neverificată"; no bulk approval of AI texts.
- **Fallback language.** Recommendation: none — an offer without approved texts in a business's language is simply not shown (drawn).
- **Automatic-stop thresholds.** Recommendation: disturbance 5% after at least 100 impressions, 3 complaints in 24 h, budget, error (drawn); changed only in Growth › Control, with a log entry.
- **Restart.** Recommendation: "Ce ai schimbat" required, same threshold; a second automatic stop in 7 days blocks restart for 24 h.
- **Analytics minimum group.** Recommendation: 5 businesses (drawn), for every figure and every filter combination.
- **Analytics retention.** Recommendation: aggregated daily totals kept 24 months; raw server events 90 days.
- **Launcher sentence.** Recommendation: only "programări azi" from EasyBook in v1 (drawn); other apps add a chip only after a product review.
- **Member's recommendations.** Recommendation: visible only to the member and the owner; notification only on activation (drawn); "Nu acum" can be re-sent after 30 days.

**S148.** Clopoțelul are jos „Vezi toate”, spre pagina Notificări (`onSeeAll` pe NotificationsPanel); la fel în toate ecranele Founder. Cheia `founder.notifications.seeAll` în `i18n/founder.json`, 6 limbi.
