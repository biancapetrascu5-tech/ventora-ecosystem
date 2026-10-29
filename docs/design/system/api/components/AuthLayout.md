# AuthLayout

`component` · Hub · versiunea 1.0.0 · nouă

The sign-in page as a component (R-2F9). It has the same name and the same zones as `AuthLayout` in `packages/ui`. - **The brand panel:** a `BrandZone` on 46% of the width (40% under 1024px). It holds the logo, "Afacerea ta. Într-un singur loc." in `display-xl`, the chevrons and "© 2026 Ventora Systems". - **The sheet with the form:** the language selector at the top right, the form centred (400px, 480px with `wide`) and the footer. - **On phones** (the layout narrower than 768px): the panel becomes a band with the logo and the language selector, and the sheet rises over it with rounded corners. The statement, the chevrons and the © are hidden.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `children` | `ReactNode` | da |
| `languageSelector` | `ReactNode` |  |
| `footer` | `ReactNode` |  |
| `theme` | `"light" \| "dark"` |  |
| `brand` | `"hub" \| "founder"` |  |
| `statement` | `ReactNode` |  |
| `wide` | `boolean` |  |
| `className` | `string` |  |

## Evenimente

—

## Stări

- hub-desktop
- hub-tablet
- hub-phone-band
- founder
- wide

## Note

Layout component: no events of its own.

Mai mult: `components/AuthLayout/README.md`, exemplele: `components/AuthLayout/preview.html`.
