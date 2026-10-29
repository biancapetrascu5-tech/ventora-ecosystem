# NotificationsPanel

The bell in the ContextBar and its panel: All / Unread, mark all as read, settings, items with person or app icon.

**Props.** `items` `[{ id, title, body?, app?, time?, person?, icon?, read?, category? }]`, `onOpenItem`, `onMarkAllRead`, `onSettings`, `open` / `onOpenChange`, `inline` (renders the panel without the bell).

Unread items have a strong title and a peach dot; the bell shows the unread count in peach. Empty: "Nu ai notificări noi — Îți spunem aici când ceva are nevoie de tine."

**Groups (S2).** When at least one item has `category: "operational"`, the list splits in two: "Despre cont și funcționare" on top (the phone is disconnected, messages are not leaving, the account), then "Activitate". Without operational items the list stays one list, with no group titles. Recommendations stay last, as before.
