# DiscoveryTooltip

`component` · Comercial · versiunea 1.0.1

A one-off hint next to the thing it explains: an arrow to the element, a short title, one sentence, "Am înțeles" and, optionally, "Vezi cum funcționează". At most one per screen; once closed it does not come back. On touch screens it is the same small anchored card — it never depends on hover. It does not cover fields or buttons in use. `commercial` adds the "Recomandare" label.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `open` | `boolean` |  |
| `title` | `string` | da |
| `body` | `string` |  |
| `onGotIt` | `() => void` |  |
| `onLearnMore` | `() => void` |  |
| `placement` | `"bottom" \| "top"` |  |
| `align` | `"start" \| "end"` |  |
| `commercial` | `boolean` |  |
| `children` | `ReactNode` | da |

## Evenimente

`onGotIt`, `onLearnMore`

## Stări

- bottom-start
- commercial-end
- top
- without-learn-more
- closed

Mai mult: `components/DiscoveryTooltip/README.md`, exemplele: `components/DiscoveryTooltip/preview.html`.
