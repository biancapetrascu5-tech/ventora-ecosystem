# BillingNotifications

The Phase 3 notifications (S115), all operational: in the bell's panel (title, short text, action) and by e-mail, in the single operational template (S3), from Ventora <noreply@ventora-hub.com>, in the 6 languages.

1. **Invoice issued** — paid by card, to pay by bank transfer (with the due date), a pack; "Vezi factura".
2. **Payment didn't go through** — plan renewal, a pack, the second attempt, the last attempt (when the grace period starts); "Nu s-a retras niciun ban"; "Actualizează cardul".
3. **Limit at 80% and 100%** — owner: "Cumpără {…} în plus" (e-mail adds "cere alt abonament"); everyone else, in the app only: "Anunță proprietarul".
4. **30-day notice** — the plan changes to the business's disadvantage from {date}: what changes, nothing changes until then, what can be done.
5. **Trial** — ends in 3 days / ended: the app stops, the data stays.
6. **Setup cost** — request accepted, payment due, app running.
7. **Non-payment** — read-only with export after the grace period (owner: "Plătește {amount}"; others: "Anunță proprietarul"); back to normal after payment.

Tone: calm, never red (neutral icons), always says what can be done. Subject = title · business; preheader = the in-app text; eyebrow "{business} · Abonament și consum" (or "· Aplicații"); footer "Primești acest e-mail pentru că ești proprietarul afacerii {business} în Ventora." The in-app action is the item's own target (NotificationsPanel `action`). Keys `notifications.billing.*` and `email.billing.*` in `i18n/notifications.json`.
