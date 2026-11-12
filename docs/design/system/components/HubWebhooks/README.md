# HubWebhooks

Hub — webhooks (S135, C.3). Romanian only for now; keys `api.hooks.*` in `i18n/api.json`. Same place and tabs as HubApiKeys.

**The list.** URL (https only), events as badges (contact created / updated, new lead, deal won / lost, EasyBook booking created / cancelled — only for the business's active apps), last delivery (code, when), state ("Activ", "Oprit", "Dezactivat automat"); menu: deliveries, edit, send a test, rotate the secret, stop / start, delete.

**New webhook** (Drawer): URL (an http address is an error), description, events grouped by app with their technical names, "Trimite un test" ("test.ping", no real data). After creating: the signing secret shown once, with "Copiază"; rotated from the list.

**Deliveries** (30 days): event and time, tries ("3 din 6", "Reușit la a treia încercare", "410: adresa nu mai există; nu reîncercăm"), duration (timeout > 10 s), response code; "Vezi livrarea" (URL, the Ventora-Signature header, the JSON body — never sensitive data, kept 30 days), "Retrimite". Retries after 1 min, 5 min, 30 min, 2 h, 6 h, 24 h.

**Automatic deactivation** after 3 days of failures: a red Notice on the list, an e-mail to the owner, "Trimite un test", "Reactivează"; events from that time are not sent.

**Documentation.** "Documentația API", base URL, `Authorization: Bearer`, the rate limit, the signature check (HMAC-SHA256 over `t.body`, reject older than 5 minutes) as a Node code sample, the list of events.

**States.** No webhooks; the test arrived (Toast).

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S135, API keys and webhooks).**
- **Which plan includes the API.** Recommendation: Business and up (drawn: "Business · 149 lei pe lună", a placeholder price); the base plan shows the UpgradeDialog.
- **Request rate.** Recommendation: 60 requests per minute per key and 10.000 per day per business in Business; more in larger plans, never sold per request.
- **Default expiry.** Recommendation: 90 days preselected; "Nu expiră" allowed with the warning, owner only.
- **Keys per plan.** Recommendation: 3 active keys and 5 webhooks in Business.
- **Request log retention.** Recommendation: 30 days, metadata only (no data).
- **Delivery retention.** Recommendation: 30 days, including the body (which never holds sensitive data).
- **Deactivation.** Recommendation: after 3 days of failures (drawn), owner notified by e-mail and in the Hub.
- **Who can create keys.** Recommendation: owner and admins; "Nu expiră" and write on contacts only the owner.
