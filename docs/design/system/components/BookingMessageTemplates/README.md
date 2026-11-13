# BookingMessageTemplates

EasyBook — message templates and predefined automations (B.13–B.15, S127). Romanian only for now; keys `booking.msg.*` in `i18n/booking.json`.

**The list.** Setări · "Mesaje" (the "Reamintiri" tab, renamed): "Către clienți" — confirmation, reminder, change, cancellation, thank-you after the visit, review request — and "Către echipă" — new booking, cancelled by the client, moved by the client, the day's schedule. Each with its channels (E-mail, SMS, Notificare în aplicație), when it leaves ("Imediat", "Cu 24 ore înainte", "La 2 ore după vizită", "A doua zi, la 10:00") and on / off.

**The editor** (a wide Drawer; stacked on tablets and phones): the channel, the subject (e-mail), the text, "Inserează" with the variables ({client}, {service}, {date}, {time}, {member}, {business}, {link}, {review}), when it leaves, "Revino la textul inițial". The preview uses an example booking: the e-mail in the single template (BookingClientEmails), the SMS without diacritics with its length ("112 caractere · 1 SMS"; over 160: two SMS). Error: an unknown variable.

**Review request.** The review page link (e.g. Google), "Doar după programările încheiate", "Cel mult o dată la 90 de zile pentru același client".

**Team notices.** Who gets them: the booking's member, the owner, reception.

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S127).**
- **Tab name.** Recommendation: "Mesaje" instead of "Reamintiri" (it now holds every message).
- **What can't be turned off.** Recommendation: the confirmation and the cancellation e-mail stay on (the client must know); the rest can be turned off.
- **Editing the confirmation.** Recommendation: the text can change, the appointment block, the policy line and the footer cannot.
- **Relation to HubAutomations.** Recommendation: EasyBook messages live here; HubAutomations shows them read-only.
- **Review SMS cost.** Recommendation: counted against the business's SMS, like reminders.

**S128.** WhatsApp as a channel, the order of channels per message and the delivery status, drawn in BookingWhatsApp; the assistant can propose texts (BookingAssistant).

**S148 · Limba textului.** În editor, deasupra canalului: „Limba textului” (cele 6 limbi, cu „Limba principală”, „Scris” sau „Lipsește”) și insignele limbilor. Afacerea scrie textul pe limbă; clientul îl primește în limba lui, iar dacă lipsește, în limba principală, cu Notice-ul care spune asta și „Pornește de la textul în Română”. Notificările pentru echipă nu au selector. Chei `booking.msg.lang.*` în `i18n/booking.json`, 6 limbi.

**DE DECIS (S148).** **Limba principală.** Recomandare: limba afacerii din Founder (română pentru afacerile din România), nu aleasă pe mesaj.
