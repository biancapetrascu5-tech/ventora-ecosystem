# CampaignKitNewCampaign

CampaignKit — a new campaign, in steps (S137, set 1). Romanian only for now; keys `marketing.new.*` in `i18n/marketing.json`.

**Steps.** Canalul → Audiența → Conținutul → Programarea → Verificarea (a numbered row on desktop and tablet, ProgressBar "Pasul 2 din 5 · Audiența" on phones). A summary card on the side (under the form on tablet) collects the choices. "Salvează ciorna" on every step.

**Channel.** The campaign's name (internal) and E-mail (from the month's quota, shared with ClientDesk) or SMS (from the campaign SMS pack; 160 characters, no diacritics).

**Audience.** A list or a ClientDesk segment, then the estimate: how many receive it and how many are excluded and why — no consent for commercial messages on that channel, suppressed (unsubscribed, bounced, marked as spam / number gone), the frequency cap (2 campaigns in 7 days). Numbers only; recalculated right before sending.

**Content — e-mail.** Subject (with a counter), the text after the subject, the sender's name (from the business's verified domain, ClientDesk), the reply address, and the content card: a preview, the template it started from, "Editează conținutul" (CampaignKitEmailEditor), "Trimite-mi un test".

**Content — SMS.** The text with the GSM-7 count ("111 caractere + 29 pentru dezabonare = 140 din 160 · 1 SMS"; {prenume} counts as 10), "Adaugă {prenume}", the fallback when the first name is missing, the unsubscribe link added automatically at the end (locked, unique per person), the estimated cost from the pack ("96 persoane × 1 SMS = 96 SMS · mai ai 120; după campanie rămân 24"). With diacritics the message becomes Unicode (70 characters per SMS): a peach Notice ("3 SMS-uri de persoană", the pack isn't enough), "Scoate diacriticele", "Cumpără SMS"; "Continuă" is disabled.

**Scheduling.** Acum, La o dată și oră, Într-o fereastră orară; Romanian time. SMS only between 9:00 and 20:00: a later time is an error.

**Final check.** The summary, the checks (subject, links, alternative text, legal footer, the optional test). A member: "Trimite la aprobare" (the owner is notified; editing takes it out of approval). The owner and admins: "Programează" — until the legal review the button is disabled and reads "Trimiterile reale sunt oprite deocamdată", with a neutral Notice; the board after activation shows "Programează". Sent for approval: a Toast.

Shown at 1280, 820 and 390, light and dark.

**S138 · SMS through SMSLink (D-CK-5).** Campaign SMS leave through SMSLink, from the business's SMS pack, from the shared Ventora Systems short number — not with an alphanumeric sender and never from the business's phone used by EasyBook. Because the number is shared, the message starts with the business's name ("Salon Aurora:", 14 characters) and ends with "STOP pentru dezabonare" (23 characters; the client replies STOP to the same number); both are added automatically and locked. The count reads "97 caractere + 37 adăugate automat (numele afacerii și dezabonarea) = 134 din 160 · 1 SMS"; with diacritics, 2 SMS per person (192 from a pack of 120). The cost line: "96 persoane × 1 SMS = 96 SMS, din pachetul afacerii". This replaces the S137 link-based unsubscribe.

**S139 · A/B test** (e-mail, in the content step). "Adaugă un test A/B" opens a second section: what is tested (Subiectul / Conținutul); two subjects (B with a hint to change one thing) or two contents (B a copy of A, edited separately); the share of the audience in the test (10–50%, split equally; 20% drawn); the duration (2 h, 4 h, 24 h); the winning criterion — "Mai multe click-uri" (opens disabled until the legal opinion on open tracking); "Trimite câștigătoarea automat către ceilalți" (on; a tie sends A; off: you choose from the report). A line spells out the split ("128 primesc A, 128 primesc B; restul de 1.028 primesc câștigătoarea după 4 ore"); the final check lists the test. The result is in CampaignKitReports.

**S146 · A/B "Eșantion prea mic".** Under 500 contacts (decision S139) the A/B toggle is off and disabled, with a peach Notice: "Audiența are {n} contacte. Testul A/B pornește doar peste 500…" and "Schimbă audiența" (`marketing.new.ab.small.*`, 6 languages). The campaign type (once / recurring / multi-step) is drawn in CampaignKitSeries. **MK.1 (11 Nov.):** campaigns have no signature field — none existed here or in CampaignKitSettings; the e-mail's legal footer stays fixed.
