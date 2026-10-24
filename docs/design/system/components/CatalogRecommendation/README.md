# CatalogRecommendation

A recommended app in the launcher ("Alte aplicații Ventora") and in the catalog: the existing AppTile with its access state, plus the "Recomandare" label, the reason that fits this business ("Se potrivește cu Booking: trimite automat reamintiri și campanii clienților tăi."), the cost line and "Vezi detaliile".

**Use.** `AppTile` takes `recommendation` `{ reason, cost }` and `onDetails`. Only apps the business does not have: on an available app the recommendation is ignored, so an owned app is never shown as a recommendation.
