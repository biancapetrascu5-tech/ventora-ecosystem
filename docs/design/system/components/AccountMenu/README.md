# AccountMenu

The avatar in the ContextBar: who is signed in, account, theme, language, support, sign out.

**Props.** `user` `{ name, email, avatar? }`, `onProfile`, `onSupport`, `onSignOut`, `theme` / `onThemeChange`, `locale` / `onLocaleChange`, `orgs` / `currentOrgId` / `onOrgChange` ("Afacerile tale": shown inside the menu on phones, where the Hub header keeps only the logo, search, the bell and the avatar, S66), `orgsInMenu` (the app says it is on a phone, by the layout's width; without it the switcher shows only when the window is under 768px), `placement`. Theme and language change in place without leaving the menu.


The menu opens in the theme of the place it opens from: in a Dark frame it is dark, even on a light page. The preview shows desktop and phone in Light and Dark, plus German and Italian.
