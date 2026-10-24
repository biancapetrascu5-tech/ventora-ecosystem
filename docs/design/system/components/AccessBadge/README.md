# AccessBadge

The label for an app's access state, used on AppTiles and in the owner's access settings.

**Props.** `state` — `available` ("Disponibilă"), `unavailable` ("Temporar indisponibilă"), `notInRole` ("Nu e în rolul tău"), `notInPlan` ("Nu e în abonament"). Each has its own icon (`circle-check`, `wrench`, `lock`, `package`) so the four are never confused, and all stay neutral: none of them is a peach "needs attention" or a lime "done". The label wraps rather than truncates.
