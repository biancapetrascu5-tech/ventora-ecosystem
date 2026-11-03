# HubTeamMemberActions

HubAdminTeam · a member's menu (S114).

- **Schimbă rolul** — Membru / Admin, with what changes ("Ca admin, {name} are acces la toate aplicațiile și poate gestiona membrii."). An admin can't make someone an admin: the option is disabled, with "Doar proprietarul poate face pe cineva admin." Saved: "{name} e acum admin."
- **Acces la aplicații** — members only; at least one app; "Se aplică imediat."
- **Oprește accesul / Redă accesul** — what happens: no sign-in until restored; role, apps and work stay; the team seat stays taken.
- **Elimină din afacere** — danger confirmation: the seat is freed, the work stays under their name, the Ventora Systems account and other businesses don't change. Removed: the row disappears and the seats go down.
- **Errors** — `hub.team.actionError` (the save failed) in a danger Notice inside the dialog, nothing changes; `hub.team.forbidden` when an admin acts on an admin with a stale list.
- **Rule** — an admin manages only members; admins only the owner. In an admin's view, the owner's and other admins' rows have no menu.

Also drawn here: the Hub home page until the launcher exists (`hub.home.soon`). Shown at 1280 and 390, light and dark, with a German and Italian test. Keys in `i18n/team.json`, 6 languages.
