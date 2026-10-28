# AuthLayout

The sign-in page as a component (R-2F9). It has the same name and the same zones as `AuthLayout` in `packages/ui`.
- **The brand panel:** a `BrandZone` on 46% of the width (40% under 1024px). It holds the logo, "Afacerea ta. Într-un singur loc." in `display-xl`, the chevrons and "© 2026 Ventora Systems".
- **The sheet with the form:** the language selector at the top right, the form centred (400px, 480px with `wide`) and the footer.
- **On phones** (the layout narrower than 768px): the panel becomes a band with the logo and the language selector, and the sheet rises over it with rounded corners. The statement, the chevrons and the © are hidden.

The phone layout follows the width of the layout itself (a container query), not the window. This lets it work inside frames and side panels.

**Props.**
- `children`: the form.
- `languageSelector`: usually `LanguageSwitcher`. It appears on the sheet, and in the band on phones.
- `footer`: "Termeni · Confidențialitate · Ajutor".
- `theme`
- Added beyond `packages/ui`, all optional:
  - `brand: 'hub' | 'founder'`: Founder shows the Ventora mark next to "Founder", "Control Center" and "Instrumentul intern al echipei Ventora". It is used without a language selector, because Founder is only in Romanian (S57).
  - `statement`: replaces the sentence on the panel.
  - `wide`: the invitation's 480px column.

The statement is translated in all 6 languages; `packages/ui` still has it written directly in Romanian.

**Used by.** HubSignIn, HubInvite, HubTwoFactorSetup, HubTwoFactorVerify, HubPasswordReset, FounderTwoFactor and FounderPasswordReset.

The preview shows the Hub and Founder versions at 1280, 820 and 390, in Light and Dark, plus German at 1280 and Italian at 390 in Dark.
