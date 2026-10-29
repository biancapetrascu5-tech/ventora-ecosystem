# NotificationsPanel

`component` · Hub · versiunea 1.1.0

The bell in the ContextBar and its panel: All / Unread, mark all as read, settings, items with person or app icon.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `items` | `Notification[]` | da |
| `onOpenItem` | `(n: Notification) => void` |  |
| `onMarkAllRead` | `() => void` |  |
| `onSettings` | `() => void` |  |
| `inline` | `boolean` |  |
| `open` | `boolean` |  |
| `onOpenChange` | `(o: boolean) => void` |  |

## Evenimente

`onMarkAllRead`, `onOpenChange`, `onOpenItem`, `onSettings`

## Stări

- closed-with-unread
- closed-all-read
- open
- unread
- read
- grouped-operational
- recommendations
- empty

## Note

Unread tab is internal state, not forced; in DE the 400px panel header overflows ('Alle als gelesen markieren' pushes the settings icon out) - component fix needed.

Mai mult: `components/NotificationsPanel/README.md`, exemplele: `components/NotificationsPanel/preview.html`.
