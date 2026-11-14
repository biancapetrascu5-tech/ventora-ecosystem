# BookingOnboarding

EasyBook — the setup guide at first start (S140; the EasyBook + ClientDesk pack for a new salon). Romanian only for now; keys `onboarding.guide.*` in `i18n/onboarding.json` (new file).

**The checklist** on "Azi", above today's bookings: "Configurează EasyBook", a ProgressBar "3 din 7 pași", seven rows — the business's details and opening hours, services, the team and who does what, the booking page, messages, deposit and payments ("Opțional"), the first test booking. Each row: what it is; done rows "Gata"; the current one "Fă acum" / "Mai târziu"; the others "Deschide"; a skipped step shows "Sărit" and stays in the list ("Reia"). "Ascunde ghidul". On the side: "Ai deja clienți?" (BookingClientImport) and "Vrei să vezi întâi cum arată?" (BookingDemo).

**Each step** (Drawer, "Pasul n din 7"): a "De ce contează" Notice, then the work — details and hours per day; a business-type template (salon de coafură, manichiură, cosmetică, barbershop, masaj) with suggested services, durations and prices to tick and edit; invitations with the services each one does; the booking page link (rezervari.ventorasystems.com/salon-aurora), the QR code to print, the Instagram and Google steps; the automatic messages (confirmation, the 24-hour SMS reminder, changes; optional ones) and connecting the salon's phone for SMS; the deposit through Stripe, skippable; a test booking marked "Test", deleted after an hour, no SMS, not counted. Footer "Mai târziu" / "Salvează și mergi mai departe".

**Done.** "Felicitări, salonul e gata!" (Dialog with what's set and what was skipped); afterwards "Azi" has no checklist and a line points to "?" › "Ghidul de configurare".

Shown at 1280, 820 and 390, light and dark.

**S150 · Telefonul afacerii (1.1.0).** La pasul „Datele afacerii și programul”, „Telefon” e acum opțional (înainte era obligatoriu), cu prefixul țării. Placeholder-ul este `+40 7xx xxx xxx`, ajutorul „Cu prefixul țării. Apare pe pagina de rezervare.”, iar eroarea pentru un număr fără prefix: „Scrie numărul cu prefixul țării…”. Pasul se poate termina și fără telefon. Valoarea e aceeași cu cea din Hub › Brand › Datele afacerii. Cheile sunt `onboarding.guide.b.phoneHelp`, `.phonePh`, `.phoneErr`, în 6 limbi. Desenat la cadrele 2, 12 și 13, cu test DE / IT. Am reparat și rândurile programului, unde eticheta zilei se suprapunea peste ore.
