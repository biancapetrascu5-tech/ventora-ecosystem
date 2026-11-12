# BookingWhatsApp

EasyBook — WhatsApp Business (S128). Romanian only for now; keys `booking.whatsapp.*` in `i18n/booking.json`.

**Connecting.** The steps: the salon's Meta Business account, the phone number (it can no longer be used in the ordinary WhatsApp app), verification by SMS; "Conectează cu Meta". Pending: "Meta verifică afacerea".

**Connected.** The number, display name, quality, the daily limit; the templates (name, category Utilitar / Marketing, language, status Aprobat / În verificare / Respins). A rejected template shows Meta's reason and "Editează și retrimite".

**A new template** (Drawer): name, category, the text with {{1}}…, how each maps to EasyBook variables, reply buttons ("Confirm", "Vreau să mut"), a preview, "Trimite la Meta".

**Channels.** Setări · Mesaje: for each message, the order — "WhatsApp, apoi e-mail", "WhatsApp, apoi SMS", only SMS, only e-mail, only WhatsApp. Clients without WhatsApp get the second channel at once; promotions only to clients who agreed.

**Delivery.** In the booking detail: each message with its channel and status (Citit, Livrat, Trimis, "Nelivrat pe WhatsApp · trimis prin SMS").

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S128).**
- **Provider.** Recommendation: the WhatsApp Cloud API directly (Meta), each salon with its own number.
- **Cost.** Recommendation: Meta's conversation fees are passed on at cost, shown per month like SMS.
- **The "Confirm" button.** Recommendation: a reply on WhatsApp confirms the booking, like "DA" on SMS.
- **Promotions on WhatsApp.** Recommendation: not in the pilot.
