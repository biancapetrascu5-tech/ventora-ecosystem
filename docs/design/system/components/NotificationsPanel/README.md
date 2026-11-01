# NotificationsPanel

The bell in the ContextBar and its panel: All / Unread, mark all as read, settings, items with person or app icon.

**Props.** `items` `[{ id, title, body?, app?, time?, person?, icon?, read?, category? }]`, `onOpenItem`, `onMarkAllRead`, `onSettings`, `open` / `onOpenChange`, `inline` (renders the panel without the bell).

Unread items have a strong title and a peach dot; the bell shows the unread count in peach. Empty: "Nu ai notificări noi — Îți spunem aici când ceva are nevoie de tine."

**Groups (S2).** When at least one item has `category: "operational"`, the list splits in two: "Despre cont și funcționare" on top (the phone is disconnected, messages are not leaving, the account), then "Activitate". Without operational items the list stays one list, with no group titles. Recommendations stay last, as before.

**Keys (S111).** The panel's texts (title, filters, mark all as read, settings, empty, the group titles, the unread count) and the notification texts drawn so far — the business phone (disconnected, messages not leaving, back), a new reply to a support request, a request resolved or refused — are in `i18n/notifications.json`, in the 6 languages.

**Action (S115).** An item may carry `action` ("Vezi factura", "Actualizează cardul"): one line under the text with an arrow, saying what opening it does. The whole item opens it; there is no second button inside. Used by the Phase 3 notifications (BillingNotifications).
