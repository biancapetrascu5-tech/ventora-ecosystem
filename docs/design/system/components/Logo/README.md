# Logo

The official Ventora Systems logo files, embedded exactly as supplied: the mark, and the logo with its own "VENTORA SYSTEMS" wordmark, on one line or on two. Never redrawn, recoloured or retyped in Syne.

**Props.** `variant` — `full` (the mark + "VENTORA SYSTEMS" on one line, 415 × 68), `stacked` (the mark + "VENTORA" with a smaller "SYSTEMS" centred under it, 250 × 68; under 32px mark height it switches by itself to `ventora-logo-stacked-small.svg`, "SYSTEMS" at full size and left-aligned, so it stays readable — the Hub Spine), `mark` (the mark only); `size` (height of the mark in px; the logo keeps the file's proportions); `title` (accessible name, default "Ventora Systems"; pass `""` when the logo sits inside a control that already names it).

**Which one (1 Nov 2026).** `full` where there is room: the launcher bar, the sign-in panel on desktop, marketing. `stacked` where the width is small: the expanded Hub Spine, the sign-in panel under 1024px and the phone band (AuthLayout switches by its own width), the cover. `mark` in the favicon and the collapsed Spine.

**Themes.** Light uses `ventora-logo.svg` / `ventora-logo-stacked.svg` / `ventora-mark.svg`; dark uses variant B (`ventora-logo-dark.svg` / `ventora-logo-stacked-dark.svg` / `ventora-mark-dark.svg`: lighter diamond, transparent cuts between the facets, off-white wordmark). The dark files cut the facets with an SVG mask; the component gives each instance its own mask id, so several logos on one page never share one. The nearest `data-theme` decides, so a dark panel inside a light page shows variant B. `LOGO_MARK` / `LOGO_MARK_DARK` are the two marks as data URLs, for `<img>` and the favicon.

**On a brand zone** (`BrandZone`: the launcher's bar and band, the sign-in panel) the logo shows variant B, as on any dark ground — the only coloured ground it may sit on (V3). Never on other coloured plates.

**Use.** Minimum size: 16px for the mark, 21px mark height for the logo. Clear space: half the mark's height on every side. Inside apps the Spine shows the app, not the logo.

**Brand change (1 Nov 2026).** The visible name is "Ventora Systems" everywhere; "Ventora" alone no longer appears. The wordmark is drawn in Montserrat ExtraBold like the old "VENTORA", same spacing; the mark is unchanged. The two initials, V and S, are peach in every variant (3 Nov 2026); the rest is navy, off-white in dark. In the Lotul 3.4 design sync these files are taken from the design system (as for variant B, S114b).
