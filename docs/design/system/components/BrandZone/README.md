# BrandZone

A brand zone: the only place navy is a surface. Navy (`brand-surface` #000C3F) in light, a cool near-black (#1B1D23) in dark, because navy is never a surface in the dark theme.

**Where — Hub only.** The launcher's ContextBar and greeting band, and the sign-in brand panel. Never inside apps, never in Hub settings, dialogs or cards.

**How.** Wrap the content: `<BrandZone as="aside" className="…">…</BrandZone>`. The zone paints `brand-surface` and turns everything inside dark: `ink` → `on-brand` (16.25:1 light, 14.66:1 dark), `ink-secondary` / `ink-muted` → `on-brand-muted` (9.69:1 / 7.01:1), `sheet` → `brand-raised` (chips, controls), `line` → `brand-line`, `control-border` → `brand-control-border` (4.13:1 / 4.10:1). Components inside take their dark variant automatically, so the Logo shows variant B and the focus ring is off-white.

**Peach on the zone** keeps its meaning only: the "needs you" dot on a chip (8.75:1 on `brand-raised`). The chevron pattern is `brand-line-strong`, decoration only.

**Props.** `as` (element, default `div`), `className`, `style`, any other attribute.
