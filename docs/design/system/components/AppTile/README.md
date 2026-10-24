# AppTile

One app in the Hub launcher, in exactly one of four access states — only "Disponibilă" opens.

**Props.** `app` (key from `APPS`) or `name` + `icon`, `description`, `access` (`available`, `unavailable`, `notInRole`, `notInPlan`), `reason` (overrides the default explanation), `grantedBy` (who can give access when not in role), `onOpen`, `onRequestAccess`, `onWriteUs`, `onSeeStatus`, `badge` (count that needs attention, available apps only).

**The four states.** Available — a button with the app's description, hover lift, arrow on hover. Temporarily unavailable — "Lucrăm la ea acum. Revine în curând." + "Vezi starea". Not in your role — names who can grant access + "Cere acces". Not in your plan — "Nu e inclusă în abonamentul afacerii. Scrie-ne și o activăm." + "Scrie-ne". Locked tiles sit on `canvas` with a dashed edge and a muted icon plate; their text still meets 4.5:1. The app icon is an interim navy plate with a Lucide glyph until the custom app-icon family (Stage 2) replaces it.
