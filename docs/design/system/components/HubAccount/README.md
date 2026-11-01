# HubAccount

Account settings in the Hub shell: profile, preferences (theme, language), notifications, security (password, two-step sign-in, active sessions).

Shown at 1280 (desktop), 820 (tablet portrait) and 390 (phone), in light and dark, built only from the system's components.

**Notificări (S114b, D4-6, D4-7).** In the app, operational notifications are always on: the "În aplicație" column is informative ("Mereu", no checkbox) and a short text says why. By e-mail, a switch per category — bookings, the business phone, invoices and payments, plan limits, leave requests, support replies — except security (password changed, two-step sign-in, the Ventora support session), shown as "Nu se pot opri". No SMS column. "Recomandări Ventora" stays separate, as in CommercialPreferences (in-app switch; e-mail "Disponibil în curând"); "Noutăți de la Ventora" has e-mail off by default. On the phone the same logic, as a list with switches ("Pe e-mail") and "În aplicație: mereu" under each category. Keys `notifications.prefs.*` in `i18n/notifications.json`.

After the product review: on phones the page is a list of sections, each with its own page; theme and language apply at once. Two-step sign-in is mandatory for the owner and is turned on at the first sign-in (HubTwoFactorSetup), so the owner sees its status ("Activă", "Obligatorie pentru proprietar…"), not a switch (S58). The code is asked at every sign-in with the password (S59). Backup codes ("Coduri de rezervă", S60): how many are left, and "Generează coduri noi" — the codes are shown only once, when generated.

**Connected devices and times (S110).** A device row is "system · browser · time", without a city (the location from the IP isn't kept): "macOS · Chrome · Activ acum" (this device), "Windows · Chrome · Ieri, 21:40". Times: "Activ acum", "Azi, 14:32", "Ieri, 21:40", then "28 oct., 09:15"; the password row uses the same format ("Schimbată: 28 oct., 09:15").

**Securitate (S100, S108).** "Schimbă parola" and two-step sign-in for a member who doesn't have it on are drawn in HubAccountSecurity.

**Security e-mails (S83).** The "Parola contului tău a fost schimbată" e-mail can't be turned off. In Notificări it may appear at most as an informational row, without a toggle.
