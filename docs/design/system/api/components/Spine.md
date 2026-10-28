# Spine

`component` · Shell · versiunea 1.0.1

The app's navigation: app name (click to return to the Hub launcher), grouped items, an optional footer (usually a compact UsageMeter), collapse control — and the bottom nav on mobile.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `app` | `AppKey` |  |
| `hub` | `boolean` |  |
| `appName` | `string` |  |
| `appIcon` | `string` |  |
| `sections` | `{ label?: string; items: NavItem[]; }[]` | da |
| `activeId` | `string` |  |
| `onNavigate` | `(item: NavItem) => void` |  |
| `onBackToHub` | `() => void` |  |
| `footer` | `ReactNode` |  |
| `collapsed` | `boolean` |  |
| `defaultCollapsed` | `boolean` |  |
| `onCollapsedChange` | `(c: boolean) => void` |  |
| `bottomItems` | `string[]` |  |

## Evenimente

`onBackToHub`, `onCollapsedChange`, `onNavigate`

## Stări

- default
- active
- badge
- disabled-item
- collapsed
- footer-meter
- mobile-bottom-nav

Mai mult: `components/Spine/README.md`, exemplele: `components/Spine/preview.html`.
