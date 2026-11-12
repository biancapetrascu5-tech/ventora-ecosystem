# BookingBlockedClients

EasyBook — blocking a client (B.7, S125): the action on the client card, the salon's list of blocked clients and what a blocked client sees. Romanian only for now; keys `booking.block.*` in `i18n/booking.json`.

**Block.** "Blochează clientul…" in the card's menu. A danger Dialog: the client can no longer book online; if they try, they see only that online booking isn't possible and the salon's phone; they don't learn they are blocked or why. Bookings already made stay; the team can still book them from the calendar. "Motiv intern" (required, at least 10 characters; only the owner and admins see it). Done: the pill "Blocat" and a Notice "Blocat din {date} de {who}" with the reason and "Deblochează".

**The list.** Clienți · "Blocați · 3": client and phone, since when, the internal reason, who blocked; row menu "Fișa clientului", "Deblochează" (a Dialog; the reason stays in the business log). Empty: "Niciun client blocat".

**The public page.** "Nu putem face programarea online" — "Pentru o programare la Salon Aurora, sunați la salon: 0722 123 456." Nothing else.

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S125).**
- **Who can block.** Recommendation: the owner and admins; reception sees the pill "Blocat" but cannot block or unblock.
- **How a blocked client is recognised online.** Recommendation: by phone or e-mail, whichever matches, at the verification step; the message stays neutral.
- **The client's right to know.** To confirm with the lawyer: whether a blocked client must be told on request that they are blocked and why.
