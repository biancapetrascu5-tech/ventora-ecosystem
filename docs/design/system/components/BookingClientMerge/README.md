# BookingClientMerge

EasyBook — the client card: "Îmbină cu alt client" (B.7, S139). Completes BookingClientCard. Romanian only for now; keys `booking.merge.*` in `i18n/booking.json`. Owner and admins only.

**Where.** "Îmbină cu alt client" in the card's header (in the menu on phones); a peach Notice when a likely duplicate exists ("„Cristina D.” are același telefon…").

**Choose the duplicate** (Drawer): search by name, phone or e-mail; suggestions with the reason (same phone, same e-mail, similar name); two cards at a time.

**What is kept** (Drawer): a table field × kept / archived ("Schimbă care se păstrează"); "Completează câmpurile goale din fișa dublată" (empty fields only); "Ce se întâmplă": the kept client's details stay; both clients' bookings (past and future) move to the kept card, unchanged for the client; history, form answers, the log, payments and deposits move; team notes are appended; the behaviour note is recalculated from the joint history and a blocked client stays blocked; the duplicate is archived with a link and leaves the search. Marketing consent: the stricter of the two.

**Confirmation** (Dialog): no automatic undo; written to the business log. After: a Toast and the kept card with the duplicate's bookings marked "Din fișa „Cristina D.”"; the archived card shows "Arhivată · îmbinată" and a link to the kept one.

Shown at 1280, 820 and 390, light and dark.
