# BookingPublic

EasyBook — the public booking page for the end client, phone first (S116 a): service → who → day and time → details with the anti-robot check → the code from the e-mail → confirmed. Every text is a key in `i18n/booking.json` (`booking.public.*`), in the 6 languages; client-facing tone ("dumneavoastră", DE Sie, IT Lei, ES usted).

**Steps.** Services as option rows (duration, price; a service with a deposit carries the badge "Avans 50 lei"). "Cu cine": "Oricine e liber" first, then the members. Day and time: the Calendar on desktop, a strip of days on phones, then SlotPicker. Details: name, phone, e-mail (where the code goes), an optional message, the optional health fields (BookingHealthFields), the anti-robot check and the privacy line. Then "Trimite codul".

**E-mail check.** A 6-digit code, or the button in the same e-mail (`email.booking.code.*`, BookingClientEmails). The time stays held 10 minutes ("Păstrăm ora 12:30 pentru dumneavoastră încă 9:42."). Resend after 60 s. Errors: wrong code (with tries left), expired (a new one leaves), too many tries (wait 10 minutes).

**States.** No free time that day (the first free time with that member, "Oricine e liber"); nothing free online in 30 days (the salon's phone); the time taken meanwhile (pick another, the details stay); field errors; no connection; confirmed (auto confirmation) or "Am trimis cererea salonului" (manual confirmation, the status "Neconfirmată").

**Decided (S116, 4 Nov. 2026).**
- S116-D1 · Both in the same e-mail: the code for the same device, the button for another one.
- S116-D2 · The anti-robot check is Cloudflare Turnstile. The slot is drawn neutral, without a third-party brand.
- S116-D3 · A verified e-mail is remembered on the same device for 90 days; returning clients skip the code.

Shown at 1280 and 390, in light and dark, with DE/IT and EN/FR/ES tests.

**S126 (B.9, B.10).** "Alegeți salonul" as the first step when the business has several locations (BookingLocations); the waiting-list offer page (BookingWaitlist).

**S127 (B.12, B.21, B.23).** "Câteva întrebări de la salon" at the details step (BookingCustomForms), "Card pentru garanție" (BookingMoney), "Aveți un cod promoțional?" in the summary (BookingPromoCodes).

**S129 (B.2b).** "Alegeți cu cine" lists only the members who do the chosen service, and "Oricine e liber" chooses among them; a service nobody does is not shown (drawn in BookingServices).

**S137.** "Alegeți cu cine" shows each member's duration and price; "Oricine e liber" shows the range, and the summary says the price depends on who is free (`booking.public.anyoneRange`, 6 languages; drawn in BookingServices).

**S138.** Members can have a variable duration and a "de la" / interval price: "75–120 min · 200–300 lei", "de la 260 lei" (`booking.public.priceFrom`), with "Prețul final se stabilește la salon, în intervalul afișat." (`booking.public.priceFinal`), 6 languages (drawn in BookingServices).

**S146.** The photo upload on a question ("Adăugați o poză", B.12) is drawn in BookingCustomForms, frames 10–15; the link states after the start, expired and revoked (B.11b) in BookingClientManage, frames 15–17.

**S148 · Brandul afacerii.** Cu brand (Hub › Brand): logo-ul în antet (varianta pentru fundal închis în dark), culoarea principală pe butoane și selecții, linia de accent sus, fontul afacerii. Fără brand: aspectul Ventora, neschimbat. Textele rămân aceleași. Desenat în secțiunea „S148”, cu test DE / IT.

**S149 · Clasă: sesiunile la pasul de timp (1.3.0).** Când serviciul ales e o clasă (BookingClasses), pasul „Cu cine” se sare: Serviciu → Ziua și sesiunea → Datele, adică „Pasul 2 din 3”. Sub calendar (sau sub banda de zile, pe telefon) vine lista „Sesiuni”. Fiecare sesiune e un rând cu ora, „cu {member} · {room}” și locurile rămase („1 loc”, „3 locuri”, „24 de locuri”) sau „Plin”. O sesiune plină e dezactivată și nu poate fi aleasă. Pastila e caldă la 3 locuri sau mai puțin. Rezumatul arată clasa, ziua cu ora și prețul, fără „Cu cine”. Stări: nicio sesiune în ziua aleasă (următoarea dată), toate pline (altă zi sau „Intrați pe lista de așteptare”, BookingWaitlist), locul ocupat între timp (sesiunea devine „Plin”, datele rămân). Cheile sunt `booking.public.class.*`, în 6 limbi, cu „dumneavoastră” (FR vous, ES usted, DE Sie, IT Lei). Desenat la cadrele 16–19, cu test DE / IT.

DE DECIS:

- **Pragul pastilei calde.** Recomandare: 3 locuri sau mai puțin.
- **Dacă arătăm numărul exact la locuri multe.** Recomandare: da; alternativa ar fi „Locuri disponibile” peste 10.
- **Pluralul în RO.** Recomandare: „{n} de locuri” de la 20; celelalte limbi au o singură formă de plural.

**S150 · Telefonul salonului (1.4.0).** În antet, sub adresă, apare telefonul ca link de apel („Sunați la Salon Aurora: …”). Cu mai multe locații, se arată telefonul locației alese, iar pentru o locație fără telefon, telefonul afacerii (Hub › Brand). Fără niciun telefon, nu apare niciun număr, iar „Nu mai sunt locuri libere online” nu mai are buton de apel (`booking.public.noneBodyNoPhone`). Numerele exemplu sunt acum în format internațional (`+40 722 123 456`). Desenat la cadrele 20–24, cu test DE / IT. Zilele libere pe pagina publică sunt desenate în BookingClosures; programul de azi la „Alegeți salonul”, în BookingLocations.
