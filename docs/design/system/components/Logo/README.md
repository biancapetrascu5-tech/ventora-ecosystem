# Logo

The official Ventora logo files, embedded exactly as supplied: the mark, and the full logo with its own "VENTORA" wordmark. Never redrawn, recoloured or retyped in Syne.

**Props.** `variant` (`full` mark + wordmark, `mark` only), `size` (height of the mark in px; the full logo keeps the file's proportions, 250 × 68), `title` (accessible name, default "Ventora"; pass `""` when the logo sits inside a control that already names it).

**Themes.** Light uses `ventora-logo.svg` / `ventora-mark.svg`; dark uses variant B (`ventora-logo-dark.svg` / `ventora-mark-dark.svg`: lighter diamond, transparent cuts between the facets, off-white wordmark). The dark files cut the facets with an SVG mask; the component gives each instance its own mask id, so several logos on one page never share one. The nearest `data-theme` decides, so a dark panel inside a light page shows variant B. `LOGO_MARK` / `LOGO_MARK_DARK` are the two marks as data URLs, for `<img>` and the favicon.

**On a brand zone** (`BrandZone`: the launcher's bar and band, the sign-in panel) the logo shows variant B, as on any dark ground — the only coloured ground it may sit on (V3). Never on other coloured plates.

**Use.** Hub screens (sign-in, launcher, the Hub Spine), the favicon (`assets/Logos/favicon.svg`, switching to variant B with the system colour scheme), marketing, the cover. Inside apps the Spine shows the app, not the Ventora logo. Minimum size: 16px for the mark, 21px mark height for the full logo. Clear space: half the mark's height on every side.

**In the bundle (S114b, 31 Oct 2026).** The component now embeds variant B from `assets/Logos/ventora-logo-dark.svg` / `ventora-mark-dark.svg` (transparent cuts, SVG mask) and adds a per-instance suffix to the mask id (`ventora-logo-dark-cut-{id}`), so many logos on one page never share a mask. `favicon.svg` shows variant B in dark mode (the light mark otherwise). An intentional change by the founder: in the Lotul 3.4 design sync these files are taken from the design system, an exception to "logos stay the repo's", only for them.
