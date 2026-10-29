# FounderBusinessSms

Founder — one business, with the section "SMS de pe numărul propriu" (SPEC_ECRANE_SMS §8): in the Prezentare tab of FounderBusiness, under the exceptions. Built only from Sheet, SheetSection, DataTable, StatusDot, Stat, Dialog, FormField, Input and Notice.

**What it shows.** The method and the backup ("de pe telefonul afacerii · rezerva prin Ventora oprită · 2 telefoane (1 inclus, 1 în plus)"); each connected phone with its name, model, app version (old ones say so), state (S8; peach only when disconnected with messages waiting) and its sending cap; messages in the last 30 days by state — "Trimise" (with "din care livrate"), "Fără confirmare", "Nu au plecat" (with the reasons), "Anulate" — and how many went through the Ventora backup or by e-mail.

**The sending cap (§3.5).** Set per phone, only here: "Schimbă plafonul" from the row opens a Dialog with the value (messages per 30 minutes; at most 30, because above it Android stops automatic sending) and a required reason, which goes to the business's log — the same rule as exceptions. The Dialog says what the business will see ("aproximativ 50 de mesaje pe oră"). The business can't change it.

**States.** Change the cap · above the maximum · business sending through Ventora (no phones) · the log after a change.

Founder is the Ventora team's internal tool, in Romanian only, with no DE/IT test — but every text is a translation key, never written directly, so it can be translated later (S57). The cap's maximum is reviewed after E-SMS-1 (S56).
