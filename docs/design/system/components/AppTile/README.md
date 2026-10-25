# AppTile

One app in the Hub, in exactly one of four access states — only "Disponibilă" opens.

**Props.** `app` (key from `APPS`) or `name` + `icon`, `description`, `access` (`available`, `unavailable`, `notInRole`, `notInPlan`), `reason` (overrides the default explanation), `grantedBy` (who can give access when not in role), `onOpen`, `onRequestAccess`, `onWriteUs`, `onSeeStatus`, `badge` (count that needs attention, available apps only), `layout` (`tile`, `icon`, `row`).

**The four states.** Available — opens the app. Temporarily unavailable — "Lucrăm la ea acum. Revine în curând." + "Vezi starea". Not in your role — names who can grant access + "Cere acces". Not in your plan — "Nu e inclusă în abonamentul afacerii. Scrie-ne și o activăm." + "Scrie-ne". Locked tiles have a muted icon plate; their text still meets 4.5:1.

**Where each layout goes (direction B).** In the launcher, your apps are the `icon` layout inside `AppDock` (a row of icons that opens into the app's card on hover); "Alte aplicații Ventora" uses the `row` layout, compact, with the name first (16/24 semibold next to the access pill) and the explanation at 14/20 in `ink-secondary`. The `tile` layout stays for the catalog and other grids.
