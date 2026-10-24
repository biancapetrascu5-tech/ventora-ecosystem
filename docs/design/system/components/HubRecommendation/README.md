# HubRecommendation

Recommendations in the Hub notifications panel. They sit in their own section, "Recomandări", under the operational notifications and never mix with reminders, invoices or errors. The bell's unread count counts only operational notifications.

From Ventora: the label, the title, one sentence with the price, "Vezi detaliile" (opens RecommendationCard or UpgradeDialog) and "Nu mă interesează". For admins also "Recomandare de la echipă": who recommended which app, the member's optional note, "Vezi aplicația" and "Respinge".

**Use.** `NotificationsPanel` takes `recommendations` `[{ id, kind?: 'team', app?, icon?, title, body?, note? }]` and `onOpenRecommendation`, `onDismissRecommendation`, `onSeeApp`, `onRejectRecommendation`.
