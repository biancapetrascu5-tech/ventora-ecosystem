# AppLaunch

The transition from the Hub launcher into an app: the tapped app icon travels to the centre and grows to 96px while the canvas fades in over the launcher, the app name appears under it in `display-m`, then the app's shell takes over.

**Props.** `app`, `name`, `from` (the DOMRect of the tapped icon, from `AppTile`'s `onOpen(event)`), `onDone` (navigate to the app), `contained` (position inside the nearest positioned parent instead of the viewport — for previews), `fromLocal` / `progress` (static frames for documentation).

**Timing.** Icon: `duration-slow` (360ms) on `ease-standard`; canvas: `duration-base` (220ms); the name fades in during the second half; `onDone` fires at ~900ms, by which time the app's skeleton should be ready to replace the overlay. With `prefers-reduced-motion` the overlay appears instantly and `onDone` fires after 120ms.

**Use it** only from the launcher (AppTile, the phone icon grid, the CommandPalette "open app" command). Never between pages of the same app.
