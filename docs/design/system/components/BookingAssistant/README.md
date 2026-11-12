# BookingAssistant

EasyBook — the AI assistant (S128). Romanian only for now; keys `booking.ai.*` in `i18n/booking.json`.

**Where it appears.** On "Azi": the day's summary (unconfirmed bookings, gaps in the schedule, balances due). For the waiting list: times that fit a client, each with the reason, and "Oferă locul". On a group of clients: a proposed message, editable, with "Folosește textul", "Altă variantă", "Renunță". "Întreabă asistentul": a Drawer with suggestions and answers built from the business's reports, with their source.

**Proposals.** Every card carries "Asistent" and "Propus de asistent. Verifică înainte să folosești." Nothing happens on its own: the team accepts (it goes into the log) or rejects (hidden for that client). "Util" / "Nu e util" on the summary.

**Settings.** On / off, which proposals, what data it uses (bookings, services, schedule, payments; never health information; nothing is sent to clients without the team), who sees it.

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S128).**
- **Provider and data.** Recommendation: a model hosted in the EU, no training on businesses' data; listed as a subprocessor. To confirm with the lawyer.
- **Plan and cost.** Recommendation: included in Business with a monthly limit of questions; the summary and proposals don't count.
- **Members.** Recommendation: members see only proposals about their own schedule.
