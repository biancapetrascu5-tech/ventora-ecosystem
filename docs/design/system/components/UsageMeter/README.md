# UsageMeter

Consumption against a plan limit, shown calmly: used, what is left, a warning near the limit, a controlled block at the limit, and the upgrade.

**Props.** `label`, `used`, `limit` (omit = "Nelimitat"), `unit`, `warnAt` (default 0.8), `onUpgrade`, `compact` (for the Spine footer), `format(n)`.

**States.** Under `warnAt`: `primary` fill and "Mai ai 688". From `warnAt`: peach fill, "Te apropii de limita planului · Mai ai 138" in `attention-ink`, a secondary "Mărește planul". At the limit: a peach panel with a lock — "Ai atins limita planului. Ce ai deja rămâne neatins. Ca să adaugi altele, mărește planul." and a primary upgrade button. Never red, never alarming: nothing is lost, the next creation is what pauses.
