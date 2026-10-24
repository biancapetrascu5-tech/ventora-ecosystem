# NotificationsPanel

The bell in the ContextBar and its panel: All / Unread, mark all as read, settings, items with person or app icon.

**Props.** `items` `[{ id, title, body?, app?, time?, person?, icon?, read? }]`, `onOpenItem`, `onMarkAllRead`, `onSettings`, `open` / `onOpenChange`, `inline` (renders the panel without the bell).

Unread items have a strong title and a peach dot; the bell shows the unread count in peach. Empty: "Nu ai notificări noi — Îți spunem aici când ceva are nevoie de tine."
