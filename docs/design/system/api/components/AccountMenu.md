# AccountMenu

`component` · Hub · versiunea 1.1.0

The avatar in the ContextBar: who is signed in, account, theme, language, support, sign out.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `user` | `{ name: string; email?: string; avatar?: string; }` | da |
| `onProfile` | `() => void` |  |
| `onSupport` | `() => void` |  |
| `onCatalog` | `() => void` |  |
| `onSignOut` | `() => void` |  |
| `theme` | `"light" \| "dark" \| "system"` |  |
| `onThemeChange` | `(v: "light" \| "dark" \| "system") => void` |  |
| `locale` | `Locale` |  |
| `onLocaleChange` | `(c: Locale) => void` |  |
| `orgs` | `Org[]` |  |
| `currentOrgId` | `string \| number` |  |
| `onOrgChange` | `(id: string \| number) => void` |  |
| `orgsInMenu` | `boolean` |  |
| `placement` | `string` |  |
| `defaultOpen` | `boolean` |  |

## Evenimente

`onCatalog`, `onLocaleChange`, `onOrgChange`, `onProfile`, `onSignOut`, `onSupport`, `onThemeChange`

## Stări

- closed
- open-desktop
- open-phone-with-businesses

Mai mult: `components/AccountMenu/README.md`, exemplele: `components/AccountMenu/preview.html`.
