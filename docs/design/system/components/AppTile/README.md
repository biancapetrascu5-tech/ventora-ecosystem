# AppTile

One app in the Hub, in exactly one of four access states — only "Disponibilă" opens.

**Props.** `app` (key from `APPS`) or `name` + `icon`, `description`, `access` (`available`, `unavailable`, `notInRole`, `notInPlan`), `reason` (overrides the default explanation), `grantedBy` (who can give access when not in role), `onOpen`, `onRequestAccess`, `onWriteUs`, `onSeeStatus`, `badge` (count that needs attention, available apps only), `layout` (`tile`, `icon`, `row`).

**The four states.** Available — opens the app. Temporarily unavailable — "Lucrăm la ea acum. Revine în curând." + "Vezi starea". Not in your role — names who can grant access + "Cere acces". Not in your plan — "Nu e inclusă în abonamentul afacerii. Scrie-ne și o activăm." + "Scrie-ne". Locked tiles have a muted icon plate; their text still meets 4.5:1.

**Where each layout goes (direction B).** In the launcher, your apps are the `icon` layout inside `AppDock` (a row of icons that opens into the app's card on hover); "Alte aplicații Ventora Systems" uses the `row` layout, compact, with the name first (16/24 semibold next to the access pill) and the explanation at 14/20 in `ink-secondary`. The `tile` layout stays for the catalog and other grids.

**"Vezi detaliile" without a recommendation (S116, decision 3.7).** Pass `onDetails` to a locked tile and "Vezi detaliile" (opens HubCatalogApp) shows whether or not there is a recommendation. Without a recommendation the access action ("Scrie-ne", "Cere acces") follows next to it as a quiet button; with one, nothing changes. The texts of the 15 apps are in HubAppTexts (`i18n/apps.json`).

**S147 · Stările din „Descoperă mai mult din Ventora Systems” (13.11).** Două stări noi: `suspended` („Oprită temporar”, `circle-alert`) și `soon` („În curând”, `clock`). Textele insignelor: `notInPlan` → „Disponibilă pentru activare”, `notInRole` → „Acces la cerere”. Prop nou `viewer` (`owner` implicit, `admin`, `member`) și acțiunile: `notInPlan` — proprietar / admin „Solicită activarea” (`onRequestActivation`, cu `onWriteUs` ca rezervă), membru „Recomandă” (`onRecommend`); `notInRole` — „Cere acces”; `unavailable` — „Vezi starea”; `suspended` — proprietar / admin „Vezi abonamentul” (`onSeePlan`), membru fără acțiune; `soon` — „Anunță-mă” (`onNotify`). La `notInPlan` și `soon`, `description` (apps.*.short) ia locul explicației; la celelalte rămâne explicația (de ce și ce poți face). O singură acțiune pe rând. Textele sunt în bibliotecă în 6 limbi și în `i18n/apps.json` (`apps.access.*`).
