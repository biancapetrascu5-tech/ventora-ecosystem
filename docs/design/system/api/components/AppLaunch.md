# AppLaunch

`component` · Hub · versiunea 1.0.1

Opening an app from the Hub (version 2, direction B): the tapped icon swells, the app grows out of the card you pressed, the icon rides in its centre and settles into the app's bar, and the app's first frame rises in.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `app` | `AppKey` | da |
| `name` | `string` |  |
| `from` | `Box` |  |
| `fromCard` | `Box` |  |
| `iconEl` | `Element` |  |
| `fromLocal` | `{ left: number; top: number; width: number; height: number; }` |  |
| `onDone` | `() => void` |  |
| `contained` | `boolean` |  |
| `progress` | `number` |  |
| `waiting` | `boolean` |  |

## Evenimente

`onDone`

## Stări

- frame0
- frame130
- frame300
- frame470
- frame640
- frame850
- waiting
- live

## Note

prefers-reduced-motion fade cannot be forced in a static preview

Mai mult: `components/AppLaunch/README.md`, exemplele: `components/AppLaunch/preview.html`.
