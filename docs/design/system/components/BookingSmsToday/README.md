# BookingSmsToday

EasyBook — Today with the SMS alerts in "Au nevoie de tine" (SPEC_ECRANE_SMS §4). The approved BookingToday, with the business phone disconnected: the SMS alert comes first, then the approved items; at most 5, then "Vezi toate (7)". Built only from AttentionList (with the new `tone: "neutral"`, S1), Badge, Button, Dialog and Toast.

Shown at 1280, 820 and 390, light and dark; every alert on its own in the right-hand column and on the phone; and a German (380) and Italian (390) label test.

**The alerts (owner, admin and the EasyBook manager, S44).**
- *Telefonul afacerii e deconectat. {n} reamintiri trebuie să plece până la {ora}.* — peach, the only peach SMS alert; "Vezi ce poți face" opens the same Dialog as in Settings (S20).
- *{n} mesaje nu au plecat azi.* — danger, like "Nu s-a trimis"; "Vezi mesajele".
- *3 mesaje la rând nu au plecat.* (S5) — danger; replaces the one above when both apply; "Vezi mesajele", "Trimite un SMS de probă".
- *{n} mesaje fără confirmare.* — neutral (S9); "Vezi mesajele".
- *Bateria telefonului: 12%, nu se încarcă.* — neutral.
- *Mâine ai mai multe reamintiri decât poate trimite telefonul.* — neutral, with the numbers (S22); "Vezi setările".
- *Aplicația Ventora de pe telefon trebuie actualizată.* (S5) — neutral; "Vezi cum o actualizezi".

**Also.** Members see no SMS alerts; the manager sees them with only the actions they have (test SMS, hours), and the "Vezi ce poți face" Dialog without "Conectează alt telefon". When the phone comes back, the alert goes away by itself and a Toast says the waiting reminders are leaving. While the phone-disconnected alert is shown, the commercial slot under the list stays hidden (S43).

**Approved 26 Oct 2026 (S42–S45).** On phones the screen starts with "Următoarea programare", then "Au nevoie de tine" with the phone alert first.
