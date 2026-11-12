# CampaignKitSettings

CampaignKit — Setări (S139, set 3). Romanian only for now; keys `marketing.set.*` in `i18n/marketing.json`. Tabs: Trimiteri, Expeditor, Pachete, Cine ce poate face.

**Trimiteri.** "Trimiterile reale": the switch is off and disabled — "Le pornește echipa Ventora Systems", after the legal review (GDPR, Law 506/2004), per business, once the domain and the business's details are checked. The frequency cap: at most 2 messages in 7 days by default, within 1–4 messages and 7–30 days (out of range: an error, "Salvează" disabled); campaigns and automations together, "Bun venit" not counted, over the cap = skipped. SMS hours (9:00 at the earliest, 20:00 at the latest) and days without sending (Sundays and public holidays on, Saturday off; a campaign scheduled on such a day warns and leaves on the next allowed day). The internal approval: on — members' campaigns are approved by the owner or an admin.

**Expeditor.** The sender's name and the Reply-To address; the sending address; the business's domain, shared with ClientDesk ("Verificat"; "Gestionează" opens the ClientDeskEmail steps: the DNS records with their state and a copy button, "Verifică din nou", "Deconectează domeniul", the SPF note). The business's details in the legal footer (name, CUI, address, trade register number) come from the Hub, read only ("Datele de facturare în Hub").

**Pachete.** The month's UsageMeters (campaigns, e-mails shared with ClientDesk, SMS through SMSLink) and "Cumpără în plus" (500 SMS, 2.000 SMS, 5.000 e-mails — placeholder prices; never expire); buying opens a Dialog (the saved card in the Hub, the invoice the same day).

**Cine ce poate face.** A table of actions × owner / admin / member (a member prepares, makes audiences, sees reports for their own campaigns only).

**A member** sees every tab read only, with "Setările le schimbă proprietarul".

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S139, CampaignKit set 3, RuleBuilder, B.7).**
- **Opens in reports and A/B.** Recommendation: indicative only, never a winning criterion until the legal opinion (drawn); clicks are the measure.
- **A/B defaults.** Recommendation: 20% of the audience, 4 hours, clicks, winner sent automatically; A/B only for audiences above 500 contacts.
- **Bookings "after a click".** Recommendation: an EasyBook booking by the same contact within 7 days of a click counts once, for the last campaign clicked.
- **Frequency-cap limits.** Recommendation: 1–4 messages in 7–30 days (drawn); the default stays 2 in 7.
- **Days without sending.** Recommendation: Sundays and public holidays on by default for new businesses; Saturday off.
- **Turning real sending on.** Recommendation: only Ventora Systems, per business, after the legal opinion and a check of the domain, the legal footer and a first test campaign.
- **Report export.** Recommendation: figures only, owner and admins, logged (drawn); no per-contact data in reports.
- **"Mai rar".** Recommendation: at most one marketing message a month per channel, automations included; the business sees how many chose it.
- **Re-subscribing after "M-am răzgândit".** Recommendation: always a confirmation e-mail (double opt-in), even right after unsubscribing.
- **Merging EasyBook clients.** Recommendation: owner and admins only; the stricter consent and the blocked status win; no automatic undo, the archived card keeps the link.
- **Behaviour note off by default.** Recommendation: off for new businesses (drawn), with the rule 2 no-shows in 6 months when turned on; existing businesses that use it keep it on.

**S146 · MK.1 (11 Nov.).** Campaign settings have no signature field; checked — there was none to remove. The sender is the name and Reply-To in "Expeditor"; the e-mail's legal footer stays fixed.
