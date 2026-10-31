# HubAdminTeam

Business administration for the owner — team and invitations: members with role, apps and status; pending invitations with sent and expiry dates, resend and cancel.

Shown at 1280 (desktop), 820 (tablet portrait) and 390 (phone), in light and dark, built only from the system's components.

After the product review: the seats in use ("4 din 10 locuri în echipă", S112) sit next to "Invită o persoană"; at the limit the button opens UpgradeDialog; expired invitations show "Retrimite" in the row and disappear from the list after 30 days (they stay in the audit log); "Oprește accesul" / "Redă accesul" in the row menu.

**S112.** The quota counts members (`platform.members`): "4 din 10 locuri în echipă", "Ai ocupat toate cele 10 locuri din echipă", "5 locuri în echipă în plus"; the basic role is "Membru" (not "Angajat"). The "Invită o persoană" form is drawn in HubTeamInvite. All the page's texts are keys in `i18n/team.json` (`team.*`, `hub.nav.*`), 6 languages.

**A member's menu (S114).** "Schimbă rolul", "Acces la aplicații" (members only — an admin has every app), "Oprește accesul" / "Redă accesul" and "Elimină din afacere", each in its own dialog with confirmation, errors and saving; drawn in HubTeamMemberActions. Rule: an admin manages only members; admins are managed only by the owner. In an admin's view, the owner's row and another admin's row have no menu, a neutral note says "Adminii îi gestionează doar proprietarul.", and "Admin" can't be chosen in "Schimbă rolul". Keys `hub.team.*` in `i18n/team.json`.

**Where the seats come from (S117).** Under the header: "Din cele 10 locuri: 3 sunt incluse în orice cont, 7 vin din bundle-ul Business. Mai ai nevoie de locuri? Le adaugi cu un pachet în plus sau cu un bundle care are mai multe." At the limit, UpgradeDialog offers the seats pack or "Bundle Business Plus" ("Abonamentul tău ar fi 399 lei pe lună, în loc de 349 lei."). Keys `seats.*` in `i18n/pricing.json`.
