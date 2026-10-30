# HubSupportSession

The support session in the Hub (Lotul 2.5c): while someone from the Ventora team has read-only access to a business, every member sees a banner; owner and admin can close it and see the sessions. Approved texts: `support.session.banner.*` (in code). The other texts (`support.sessions.*`, `support.session.banner.cancel`) are approved in Romanian (S98). All keys are in `i18n/support-session.json`. The EN/FR/ES/DE/IT values of `support.session.banner.*` are the ones in code (S96); those of the other keys were reviewed on 29 Oct. 2026 (S109) and must still be checked against the code.

**The banner (S85).** A strip above the whole page (above the ContextBar), in the launcher and in every app, as long as the session is active: eye icon, "Sesiune de suport activă", "{founderName} din echipa Ventora poate vedea datele afacerii până la {expiresAt}." and "Doar citire: nu poate modifica date, membri, parole sau abonamentul." Owner and admin also see "Motiv: {reason}", "Cerere: {ticketRef}" and "Închide sesiunea" Members see neither (S89). Neutral, on `sunken` (S90). `role="status"`. On phones the button goes under the text.

**Closing (owner and admin).** "Închide sesiunea" opens a Dialog (S94): title `support.session.banner.close` ("Închide sesiunea"), body `closeConfirm` "Închizi sesiunea de suport? Echipa Ventora pierde accesul imediat.", buttons "Renunță" (`support.session.banner.cancel`) and "Închide sesiunea". No `closeTitle` key. Then the banner disappears and a neutral Toast says "Sesiunea de suport s-a închis."

**The sessions (S91).** Administrare · Roluri și acces, section "Sesiuni de suport": who from the Ventora team, reason, request, when, and the status ("Activă până la {expiresAt}", "Închisă de {name}", "Expirată", and "Închisă automat" for sessions the system closed, `support.sessions.status.closedAuto`, S106); the active one has "Închide sesiunea" in the row menu. Empty: "Nicio sesiune de suport până acum."

Shown at 1280 and 390, in light and dark, with a German and Italian test. The E-6 e-mail to owners (S97) is drawn in BookingSmsNotifications, cards 11–12.
