# HubAdminTeam

Business administration for the owner — team and invitations: members with role, apps and status; pending invitations with sent and expiry dates, resend and cancel.

Shown at 1280 (desktop), 820 (tablet portrait) and 390 (phone), in light and dark, built only from the system's components.

After the product review: the seats in use ("4 din 10 locuri în echipă", S112) sit next to "Invită o persoană"; at the limit the button opens UpgradeDialog; expired invitations show "Retrimite" in the row and disappear from the list after 30 days (they stay in the audit log); "Oprește accesul" / "Redă accesul" in the row menu.

**S112.** The quota counts members (`platform.members`): "4 din 10 locuri în echipă", "Ai ocupat toate cele 10 locuri din echipă", "5 locuri în echipă în plus"; the basic role is "Membru" (not "Angajat"). The "Invită o persoană" form is drawn in HubTeamInvite. All the page's texts are keys in `i18n/team.json` (`team.*`, `hub.nav.*`), 6 languages.
