# GrowthSlot

The container an app puts in a permitted place (the side column of "Azi", a settings page). It shows what the Growth Engine sends — a RecommendationCard or a DiscoveryTooltip — or nothing.

**States.** Empty: renders nothing, so there is no gap in the layout. Loading: also nothing — no skeleton; the slot appears only when it has content. With content: it eases in by height and opacity (`duration-base`, `ease-standard`; instant with reduced motion), so the page is not pushed abruptly.

**Never placed in:** forms being filled in, payments, errors, confirmations, sign-in, and the sensitive actions in MoneyDesk, TeamSpace and ContractDesk.

**Props.** `children`, `label` (accessible name).
