# AccountMenu

The avatar in the ContextBar: who is signed in, account, theme, language, support, sign out.

**Props.** `user` `{ name, email, avatar? }`, `onProfile`, `onSupport`, `onSignOut`, `theme` / `onThemeChange`, `locale` / `onLocaleChange`, `orgs` / `currentOrgId` / `onOrgChange` (shown inside the menu on phones only, where the ContextBar has no room for the OrgSwitcher), `placement`. Theme and language change in place without leaving the menu.
