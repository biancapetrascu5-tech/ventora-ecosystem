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
