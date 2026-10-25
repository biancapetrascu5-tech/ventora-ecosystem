# AppDock

The launcher's "Aplicațiile tale": a row of app icons on one raised sheet; on hover or keyboard focus an icon opens into the app's card above the row. Hub launcher only.

**Props.** `apps` `[{ app, name?, icon?, description, badge?, live?: { text, attention? } }]` (in the person's order), `onOpen(event, app, name, launch)` — `launch` is `{ from, fromCard, iconEl }`, pass it straight to `AppLaunch`; `label` (the list's accessible name, default "Aplicațiile tale").

**At rest.** Icons at `dock-icon` (64px) with the name under them (14/20 semibold), on a `raised` sheet with `shadow-2` and `radius-xl`, laid over the bottom edge of the brand band. The count badge (peach) stays on the icon.

**On hover / focus.** In `duration-morph` (340ms) on `ease-spring` the item opens into a `dock-card-w` (264px) card above the row: the icon shrinks to `dock-icon-compact` (48px) and moves to the top-left corner, the name aligns under it (16/24), then the description (14/20, `ink-secondary`, at most 2 lines) and today's line (13/18, above a hairline; a peach dot when it needs you) fade in, 80 and 130ms later. A 3px `hover-accent` line opens under the card. The first and last cards open inwards. The card opens after the pointer rests `duration-intent` (120ms) on the icon and closes at once, so sweeping across the row doesn't flash cards. A click opens only the app under the pointer: the part of the card that spills over the neighbours is not clickable, and moving onto a neighbour opens that one (V12, V13). Keyboard focus opens the card without the wait and adds the focus ring around it. Leaving closes it back into the icon. `prefers-reduced-motion`: no movement, the card swaps instantly.

**Phones** (container under 560px): a 4-column grid of `dock-icon-phone` (56px) icons on the canvas, no sheet and no card; a tap opens the app.

**Rules.** Only the apps the person can open. Portal is not in the dock — it is `PortalPresence`. Today's line is optional and comes from the app (one short fact, no promises). Never use the dock inside an app.
