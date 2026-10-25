# HubLauncher

The launcher (direction B "Navy de comandă"): a brand band with the date and business, the greeting and the day's sentence; "Aplicațiile tale" as an AppDock laid over the band's edge; Portal's own card; "Alte aplicații Ventora" with the reason and action for each; and AppLaunch when you open an app (hover an icon to see its card, click to open).

Shown at 1280 (desktop), 820 (tablet portrait) and 390 (phone), in light and dark, built only from the system's components.

**The band** (`BrandZone`, with the ContextBar): "DUMINICĂ, 25 OCTOMBRIE · SALON AURORA" in `eyebrow`, "Bună dimineața, Bianca" in `display-l`, the day's sentence in `lead` whose links are chips (app icon, text, the peach dot when something waits for you) and lead to the work (programări → Booking · Azi, facturi → Finance, concediu → HR), then "Aplicațiile tale" with "Reordonează". On phones the section title moves below the band.

**Your apps** are an `AppDock`: icons with their names; hover or keyboard focus opens the app's card (description and today's line, e.g. "Următoarea: 09:30 · Ana Popescu"). Phones: a 4-column icon grid. Portal is never in the dock — it is the `PortalPresence` card right under it.

**Other Ventora apps** are compact rows, name first. They can carry one catalog recommendation — a commercial slot, only for owners and admins, with "Nu mă interesează", the remind menu and the global caps (Marketing here) — and end with "Vezi toate aplicațiile Ventora", which opens HubCatalog. Tab order goes through your apps and Portal before the commercial slot.
