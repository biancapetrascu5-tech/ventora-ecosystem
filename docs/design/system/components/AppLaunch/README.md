# AppLaunch

Opening an app from the Hub (version 2, direction B): the tapped icon swells, the app grows out of the card you pressed, the icon rides in its centre and settles into the app's bar, and the app's first frame rises in.

**Props.** `app`, `name`, `from` (the DOMRect of the tapped icon), `fromCard` (the DOMRect of the card or dock item it sits in; without it the icon's box is used, padded), `iconEl` (the tapped icon element, so it can swell to 112%), `onDone` (navigate to the app), `waiting` (the app isn't ready: the icon stays in the centre with the app name under it, the first version's frame), `contained` (inside the nearest positioned parent instead of the viewport — for previews), `fromLocal` / `progress` (static frames for documentation; `fromCard` is then local too). `AppDock`'s `onOpen` hands you `{ from, fromCard, iconEl }` ready to spread.

**Timing.** 0–160ms the icon swells on `ease-spring`; from 150ms the app's surface grows from the card to the full screen in `duration-launch` (420ms, `ease-standard`) while the icon passes through the centre at 88px and lands at 28px in the app's bar; from 560ms the app's content rises 16px and fades in. About 850ms in all; `onDone` fires at ~900ms. With `prefers-reduced-motion`: a 150ms fade, `onDone` after 120ms. Screen readers hear "Se deschide {app}".

**Use it** only from the launcher (AppDock, the phone icon grid, PortalPresence, the CommandPalette "open app" command). Never between pages of the same app.
