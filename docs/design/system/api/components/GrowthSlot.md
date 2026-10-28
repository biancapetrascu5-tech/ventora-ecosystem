# GrowthSlot

`component` · Comercial · versiunea 1.0.1

The container an app puts in a permitted place (the side column of "Azi", a settings page). It shows what the Growth Engine sends — a RecommendationCard or a DiscoveryTooltip — or nothing.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `children` | `ReactNode` |  |
| `label` | `string` |  |

## Evenimente

—

## Stări

- empty
- loading
- with-content

## Note

Loading renders nothing by design (same as empty); the ease-in motion is not visible in a static frame.

Mai mult: `components/GrowthSlot/README.md`, exemplele: `components/GrowthSlot/preview.html`.
