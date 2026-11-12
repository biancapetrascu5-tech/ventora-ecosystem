# HubLauncher

The launcher (direction B "Navy de comandă"): a brand band with the date and business, the greeting and the day's sentence; "Aplicațiile tale" as an AppDock laid over the band's edge; Portal's own card; "Alte aplicații Ventora Systems" with the reason and action for each; and AppLaunch when you open an app (hover an icon to see its card, click to open).

Shown at 1280 (desktop), 820 (tablet portrait) and 390 (phone), in light and dark, built only from the system's components.

**The band** (`BrandZone`, with the ContextBar): "DUMINICĂ, 25 OCTOMBRIE · SALON AURORA" in `eyebrow`, "Bună dimineața, Bianca" in `display-hub`, the day's sentence in `lead` whose links are chips (app icon, text, the peach dot when something waits for you) and lead to the work (programări → EasyBook · Azi, facturi → MoneyDesk, concediu → TeamSpace), then "Aplicațiile tale" with "Reordonează". On phones the section title moves below the band.

**Your apps** are an `AppDock`: icons with their names; hover or keyboard focus opens the app's card (description and today's line, e.g. "Următoarea: 09:30 · Ana Popescu"). Phones: a 4-column icon grid. Portal is never in the dock — it is the `PortalPresence` card right under it.

**Other Ventora Systems apps** are compact rows, name first. They can carry one catalog recommendation — a commercial slot, only for owners and admins, with "Nu mă interesează", the remind menu and the global caps (CampaignKit here) — and end with "Vezi toate aplicațiile Ventora Systems", which opens HubCatalog. Tab order goes through your apps and Portal before the commercial slot.

**On phones (S66).** The header keeps only the logo (the mark), search as an icon, the bell and the avatar. The business switcher is in AccountMenu ("Afacerile tale", `orgsInMenu`). The section under the screens shows the menu open, in Light, Dark and German.

**Without Portal (S136, 5.1, D5-16).** A business without a Portal page doesn't see the `PortalPresence` card at all: the dock stands alone, the other apps move up, no empty space is left.

**The day's sentence (S136, D5-17).** No data chips, except "programări azi" when EasyBook is active ("Azi ai 8 programări."). When no active app gives data, a plain sentence: "Aplicațiile tale sunt mai jos; deschide-o pe cea de care ai nevoie." (and the dock cards have no data line either). Two new boards: "Fără Portal" and "Nicio aplicație care dă date".

**S140 (first start).** Recommended (not drawn): one line in the launcher with the EasyBook guide's progress ("Configurare EasyBook · 3 din 7") until it is done or hidden; the guide itself is in BookingOnboarding.
