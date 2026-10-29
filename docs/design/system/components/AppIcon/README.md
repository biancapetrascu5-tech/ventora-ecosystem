# AppIcon

One of the fifteen Ventora app icons — a navy plate with off-white shapes and a single peach part, drawn on a shared 48-unit grid as an echo of the Ventora mark.

**Props.** `app` (`booking`, `crm`, `documents`, `contracts`, `events`, `hr`, `inventory`, `shifts`, `marketing`, `analytics`, `assets`, `projects`, `finance`, `portal`, `network`), `size` (px; 16 minimum), `muted` (the inactive variant), `title` (accessible name when the icon stands alone; omit it when the app name is written next to it). An unknown `app` falls back to a plate with the Lucide `icon` you pass.

**Variants.** Active is the default. Inactive (`muted`) is for apps you cannot open (any of the three locked access states) and for apps that are not the current one in a switcher: grey plate, grey shapes, and the peach part turns grey too, so an inactive app never signals attention. Dark theme is automatic: the plate stays navy (`appicon-plate` dark #14205E, the only navy left in the dark theme) with a hairline `appicon-edge`, so it reads on the near-black surfaces; shapes and peach stay the same. The inactive plate is neutral grey in both themes.

**Where.** AppTile (44px), the Spine header (32px), the mobile launcher (52px), the browser tab favicon (16px, static file from the *App icons* asset group), notifications that come from an app. Sizes: 16, 20, 24, 32, 40, 44, 48, 52, 64, 96.

**What each glyph shows** (the peach part is always "what the app does"): EasyBook — calendar with the booked day · ClientDesk — a client and the relationship behind them · DocSpace — page with its folded corner · ContractDesk — pen nib over the signature line · EventSpace — ticket with its stub · TeamSpace — staff badge with its clip · StockDesk — box with its lid · ShiftPlan — clock with the shift segment · CampaignKit — megaphone and its sound · DataView — bars, the tallest one · AssetDesk — gem with its top facet · TaskBoard — board with the card in progress · MoneyDesk — wallet with its coin · Portal — shopfront with its awning · Network — three connected businesses, one of them you.

**Portal and Network** are full members of the family of 15: their icons appear in the Hub launcher, on tiles, as favicons and in notifications, exactly like the others. Only the inside of those two apps has its own visual identity, designed separately.

**Don't.** Recolour, add a second peach part, rotate, put the glyph without its plate, or use Lucide icons for apps.
