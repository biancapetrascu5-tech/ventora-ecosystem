# HubApiKeys

Hub — API keys (S135, C.3). Shared by all apps; ClientDesk is the first with permissions. Romanian only for now; keys `api.keys.*` in the new `i18n/api.json`.

**Where.** Hub › Administrare › "Integrări pentru dezvoltatori" — a new Spine group, shown only to the owner and admins (bottom bar: "Integrări"). Tabs: Chei API, Jurnalul cererilor, Webhook-uri (HubWebhooks), Documentație.

**The list.** Name and key prefix ("vk_live_8f3a…"), permissions per app ("ClientDesk: leaduri (scriere), contacte (citire)"), created by and when, last used, expiry, state ("Activă", "Revocată", "Expirată", "Înlocuită · mai merge 24 h"); revoked and expired keys stay 90 days for the log. Usage: requests today (UsageMeter), active keys against the plan limit, 60 requests per minute per key, 429 over the limit.

**New key** (Dialog): name, permissions as read / write boxes per entity (contacte, leaduri, dealuri, activități) — nothing ticked by default, at least one required; other apps get permissions when their API is ready; expiry 30 / 90 / 365 days / none (a warning for none; e-mail 7 days before expiry). **Shown once:** the full key with "Copiază" and "Nu o mai poți vedea după ce închizi"; only the prefix and a hash are stored.

**Revoke** (Dialog, type the key's name): immediate, 401 afterwards, can't be undone. **Rotate:** a new key with the same permissions, shown once; the old one keeps working 24 hours (can be stopped earlier).

**Never through the API:** the "Risc ridicat" note, the blocked-clients list and health data — a visible Notice on every tab.

**Request log** (30 days): the request (method and route), the key, when, duration, result (2xx / 401 / 403 / 429 with the reason); never the data sent or received.

**States.** No keys; the key limit (3 active; "Cheie nouă" disabled); plan without API (UpgradeDialog, "Business"); a member: the section isn't in their menu, a direct link shows "doar pentru proprietar și admini".

Shown at 1280, 820 and 390, light and dark.
