# AppHelp

In-app help (S140, content S144, translations S145). The articles and FAQ are in 6 languages (S145); the panel chrome `onboarding.help.*` too (S143). Panel chrome: keys `onboarding.help.*` in `i18n/onboarding.json`. Articles and FAQ: `i18n/help.json` (S144; ro, en, fr, es, de, it since S145). In every language, button and screen names inside the steps are the exact texts of `booking.json`, `crm.json`, `team.json` and `api.json`; the tone follows the business UI of `booking.json` (EN neutral, FR "vous", ES "usted", DE "Sie", IT "Lei"). Drawn in EasyBook; the same in every app.

**The "?" button** in the app bar, next to the bell (`circle-help`). **The panel** (Drawer): "Pentru ecranul „Calendar”", search, short articles for the current screen (reading time), "Întrebări frecvente" (3 shown + "Toate cele 10 întrebări"), short tours, "Ghidul de configurare" (with what is left), "Scrie-ne" — the existing support, with the current screen attached.

**An article** (S144): the question as heading, reading time, numbered steps (`.steps`, one step per line, split on `\n`), the "Bine de știut" Notice (`lightbulb`) only when `.note` exists, "Ți-a fost de folos?". The Drawer title stays "Ajutor" with the screen in the subtitle, so long questions wrap in the body instead of being cut in the header on a phone.

**Keys** (`i18n/help.json`): `help.<screen>.screen` (name shown in "Pentru ecranul …"); `help.<screen>.<article>.title` / `.steps` / `.note` (optional) / `.min` (reading time in minutes, used with `onboarding.help.readTime`); `help.faq.<id>.title` / `.body` / `.note` / `.min`; `help.ui.*` (Bine de știut, Întrebări frecvente, Pașii, Toate cele {n} întrebări). Screens: `today`, `calendar`, `newBooking`, `clients`, `services`, `teamSchedule`, `settingsMessages`, `settingsPayments`, `settingsOnline`, `publicPage` (EasyBook); `crmContacts`, `crmLeads`, `crmDeals`, `crmActivities`, `crmImport`, `crmSettings` (ClientDesk). 56 articles (2–4 per screen) and 10 FAQ.

**Tours** with DiscoveryTooltip: at most 3 steps, "Pasul 1 din 3", "Sari peste tur"; started from the panel or once, at first use of a screen.

Shown at 1280, 820 and 390, light and dark: the panel for "Calendar", the article "Cum mut o programare?" (Calendar) and the article "Cum cer avans la rezervarea online?" (Setări › Plăți și avans), then the two tour frames.

**DE DECIS**
- `settingsOnline.*`: Setări › Rezervări online is not drawn yet. The articles assume the on/off switch, automatic or manual confirmation, how late / how far ahead one can book and the free-cancellation window there (BookingPayments currently says the window comes from "Setări · Reguli"). Check the texts when the screen exists.
- `today.overview`: the names of the 4 figures on "Azi" (programări, venite, încasat, locuri libere) are assumed; align with BookingToday.
- `calendar.views`: "Zi" / "Săptămână" and the colleague filter are assumed from the calendar previews.
- `faq.cancel` and `faq.clientRights`: there is no self-serve cancellation or data-deletion flow; the answers send the owner to support. Replace when the flows exist.
- Reading time is computed at 180 words per minute, so every article is 1 minute today; keep `.min` as a key so a longer article can say 2.
- Checked in DE and IT at 390 / 820 / 1280 (S145): the "Calendar" panel and the two drawn articles, no overflow. The published preview stays in Romanian.
