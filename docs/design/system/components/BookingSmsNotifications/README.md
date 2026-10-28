# BookingSmsNotifications

The operational notifications for the business phone (SPEC_ECRANE_SMS §7): in the bell's panel (Hub and every app) and by e-mail.

**Panel (S2).** NotificationsPanel now groups by `category`: "Despre cont și funcționare" on top, then "Activitate". The SMS items: "Telefonul afacerii e deconectat" ("6 reamintiri trebuie să plece până la 18:00. Verifică telefonul.") and "Mesajele nu pleacă" ("3 mesaje la rând nu au plecat de pe Telefon recepție."), and when the phone is back, "Telefonul afacerii s-a conectat din nou". Opening one goes to Settings · Trimitere SMS (or the message list). Who gets them: owner, admin and the EasyBook manager (S44).

**E-mail (S3).** One operational template for the whole ecosystem — team invitation, password reset, SMS alerts (no sign-in codes by e-mail: two-step sign-in uses an authenticator app) — in the 6 languages, light only, sent through Resend from ventora-hub.com. Parts: inbox line (sender, subject, preheader), the Ventora logo, eyebrow (business · app), title, the sentence that says what happened, "Ce să verifici" as a numbered list, one primary button, what happens next, and a footer with why you get it and the company. On phones the button takes the full width. Built for e-mail clients: one column, 600px, no dark mode.

**The two SMS e-mails.** "Telefonul afacerii e deconectat · Salon Aurora" (once per disconnection, after 15 minutes, only with messages waiting; at most 3 a day per business) and "Mesajele nu pleacă de pe telefonul afacerii · Salon Aurora" (after 3 messages in a row did not leave; at most once a day). Both go to Settings with one button.

**E-mail preferences (Contul tău · Notificări).** Each person can turn off the e-mail copy, except the owner: the toggle is on and locked, with "Proprietarul primește mereu aceste e-mailuri, ca să afle cineva sigur când reamintirile nu pleacă." The in-app notifications can't be turned off. Recipients: owner, admins and the EasyBook manager.

Shown with the panel open at 1280, 820 and 390, the panel states in light and dark, the e-mails (the two SMS ones, the team invitation — "Invitația e valabilă până pe {data}.", because a member's invitation lasts 7 days and the owner's 30 — and the password reset — "Linkul e valabil o oră." (S55), desktop and phone), the e-mail preferences for owner and admin, and a German and Italian test of the e-mail and the panel.
