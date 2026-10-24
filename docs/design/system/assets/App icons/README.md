# App icons

The fifteen Ventora app icons as standalone SVG files (48 × 48 viewBox, colours baked in), for favicons, app manifests, emails and anything outside the React bundle. Inside the apps use the `AppIcon` component, which draws the same shapes from the `appicon-*` tokens and follows the theme.

- `<app>.svg` — active, light theme: navy plate `#000C3F`, off-white shapes `#EFF0EE`, one peach part `#FFAA75`. Use this as the app's favicon.
- `<app>-dark.svg` — active, dark theme: navy plate `#14205E` with a `#2F3B7A` hairline (navy stays only here in dark).
- `<app>-inactive.svg` — no access / not the current app, light theme: `#E8EAF1` plate, `#5E6680` shapes, peach turned grey (`#9CA4B4`).
- `<app>-inactive-dark.svg` — the same for dark theme: neutral `#2A2C31` plate, `#9C9A95` shapes, `#5C5D61` accent.

Apps: booking, crm, documents, contracts, events, hr, inventory, shifts, marketing, analytics, assets, projects, finance, portal, network. Never recolour them, never add a second peach part, never place the glyph without its plate.
