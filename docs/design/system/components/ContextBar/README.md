# ContextBar

The top bar of an app: business switcher, search (opens the CommandPalette, shows ⌘K), "Creează", notifications, account.

**Props.** `title` (shown on mobile and on screens without a Spine), `org` (an OrgSwitcher), `onSearch`, `searchLabel`, `createItems` (Menu items) or `onCreate`, `createLabel`, `notifications` (a NotificationsPanel), `account` (an AccountMenu), `leading` (e.g. the Logo on Hub screens).

"Creează" is the screen's primary button; there is no other primary in the ContextBar. Under 1024px search becomes an icon; under 640px the business switcher leaves the bar and appears inside the AccountMenu (pass it `orgs`) and "Creează" becomes a round icon button.

**On the launcher (direction B)** the bar sits inside a `BrandZone`, so it shares the navy band with the greeting: transparent background, `brand-line` under it, the search field bordered in `brand-control-border`, the logo in variant B. Everywhere else — apps, Hub settings — the bar stays on the theme's surfaces.
