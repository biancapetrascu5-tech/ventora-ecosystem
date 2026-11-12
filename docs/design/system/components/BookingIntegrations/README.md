# BookingIntegrations

EasyBook — optional integrations (S128), a new Settings tab "Integrări". Romanian only for now; keys `booking.integrations.*` in `i18n/booking.json`.

**The list.** Grouped: calendars (Google Calendar, Microsoft Outlook, iCal subscription), channels (WhatsApp Business — BookingWhatsApp), payments and receipts (Stripe — BookingPayments; the fiscal printer — BookingFiscal), where clients find you (Google Business Profile, Instagram and Facebook). Each with what it does, its status (Conectat, "2 din 4 membri", Neconectat, Are o problemă, "În Business") and one action.

**Google Calendar / Outlook.** Each member links their own calendar; the owner sees who is linked ("Sincronizat acum 5 min"), invites the others, sees an expired access ("Reconectează"). Both directions can be turned off: bookings into Google, Google events blocking EasyBook times. What shows in Google: only "Programare · {service}" (default) or the client's name and phone too.

**The member's link.** What EasyBook can do (add their bookings, see when they are busy) and can't (read event titles or details); "Continuă cu Google". Disconnecting: copied bookings stay but stop updating.

**Plan.** An integration outside the plan: "Integrările de calendar sunt în abonamentul Business" and "Cere alt abonament" (D1: "abonament").

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S128).**
- **Which plan.** Recommendation: iCal in every plan; Google / Outlook, WhatsApp and the fiscal printer from Business.
- **Client data in personal calendars.** Recommendation: off by default (drawn this way); the owner can turn it on.
- **Instagram / Facebook / Google.** Recommendation: only the booking link for the pilot, no API integration.
