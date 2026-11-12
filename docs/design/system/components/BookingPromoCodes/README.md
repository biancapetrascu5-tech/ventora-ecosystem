# BookingPromoCodes

EasyBook — promo codes and discounts (B.22–B.23, S127). Romanian only for now; keys `booking.promo.*` in `i18n/booking.json`.

**The list.** Setări · "Promoții": code, discount ("15%", "−50 lei"), services, period, uses ("23 din 100"), status (Activ, Programat, Expirat, Oprit, Epuizat). Row menu: "Raport", "Editează", "Oprește codul".

**A new code** (Drawer): the code (capitals and digits; "Generează"), percent or fixed amount, the value, the services (empty = all), the period, the total use limit (empty = none), "O singură dată de fiecare client", "Doar pentru clienți noi", where it can be used (the booking page, bookings made by the team). Errors: a code that exists, a percent over 100, an end date before the start.

**Public page.** "Aveți un cod promoțional?" with "Aplică" in the summary; applied: "Reducere −50 lei", the total and "Scoate codul"; errors: not valid for that service, expired, already used.

**In the Hub.** BookingNew gets "Reducere": none, a promo code (active codes only) or a manual discount (with a reason, in the log).

**Report.** Uses, discounts given, revenue from bookings with the code, new clients, and each use (client, date, service, online or team, discount).

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S127).**
- **Codes and the deposit.** Recommendation: the deposit is calculated on the discounted price.
- **Codes with packages.** Recommendation: a code doesn't apply to sessions paid from a package.
- **Manual discounts.** Recommendation: the owner and admins; reception only with a code.
- **"Doar pentru clienți noi".** Recommendation: a client is new if the phone and e-mail have no done booking at the salon.
