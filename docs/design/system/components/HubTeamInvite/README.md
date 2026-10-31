# HubTeamInvite

"Invită o persoană" from HubAdminTeam (S112): a dialog (a bottom sheet on the phone) with the e-mail address, the role — Membru (uses the apps chosen below) or Admin (every app, can invite and change roles and app access) — and the apps. For an admin the apps are all ticked and locked.

**States.** Wrong address ("Scrie adresa întreagă, de forma nume@exemplu.ro."), already in the team, invitation already sent (with "Retrimite invitația" under the field), no app chosen, sending ("Se trimite invitația…", fields locked), sent (toast; the invitation appears first in "Invitații în așteptare" and the seats go to "5 din 10 locuri în echipă"). Errors sit under their own field. At the seat limit the button opens UpgradeDialog (HubAdminTeam).

Shown at 1280 and 390, light and dark, with a German and Italian test. Keys `team.invite.*` in `i18n/team.json`, 6 languages.
