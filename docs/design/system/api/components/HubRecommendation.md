# HubRecommendation

`component` · Comercial · versiunea 1.0.1

Recommendations in the Hub notifications panel. They sit in their own section, "Recomandări", under the operational notifications and never mix with reminders, invoices or errors. The bell's unread count counts only operational notifications.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `r` | `{ id: string; kind?: "team"; app?: AppKey; icon?: string; title: string; body?: string; note?: string; }` | da |
| `onOpen` | `(r: any) => void` |  |
| `onDismiss` | `(r: any) => void` |  |
| `onSeeApp` | `(r: any) => void` |  |
| `onReject` | `(r: any) => void` |  |

## Evenimente

`onDismiss`, `onDismissRecommendation`, `onOpen`, `onOpenRecommendation`, `onReject`, `onRejectRecommendation`, `onSeeApp`

## Stări

- member
- admin-team-recommendation
- unread
- read

Mai mult: `components/HubRecommendation/README.md`, exemplele: `components/HubRecommendation/preview.html`.
