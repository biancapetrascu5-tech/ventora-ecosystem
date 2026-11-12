# HubEmpty

The launcher when no app is available (direction B): the brand band with the date, the greeting and "Bine ai venit în Salon Aurora. Aplicațiile apar aici imediat ce primești acces." stays, an EmptyState explains who chooses the apps and offers "Cere acces" and "Scrie-ne", on a sheet that rises over the band's edge.

Shown at 1280 (desktop), 820 (tablet portrait) and 390 (phone), in light and dark, built only from the system's components.

After the product review: after "Cere acces" the button becomes "Cerere trimisă · {data}" and cannot be pressed again; a quiet link points to Contul tău for the wait.

**S146 · „Cere acces” (Faza 5, lotul 5.1b).** Keys `hub.empty.*` in `i18n/team.json`, 6 languages (the earlier frames keep their drawn texts). After sending: "Cerere trimisă · {data}", the button disabled, and under it "O poți trimite din nou după {data}"; after 7 days without access the text says so and "Trimite din nou" is active (the last request's date under it). While sending: "Se trimite cererea…". Errors: the request didn't go through (danger Notice, "Încearcă din nou"); the business was suspended meanwhile (danger Notice with the support address, "Cere acces" disabled). **The owner or an admin**: "Au nevoie de tine" on the launcher, under the apps — "{nume} cere acces la aplicații", the role, no apps, the date, "Deschide Echipa" (`team.accessRequest.*`, `hub.attention.title`) — and a bell notification (`notifications.access.request.*`). DE / IT tests for the new labels.

**DE DECIS (S146).** **Where the owner sees the request.** Recommendation: the launcher's "Au nevoie de tine" (drawn) and a "Cere acces" badge on the person's row in Echipă și invitații (`team.accessRequest.badge`); the request disappears when the person gets at least one app. **Several requests.** Recommendation: one row per person; a request sent again after 7 days updates the date ("A cerut din nou · {data}"), it doesn't add a row.
