# CampaignKitSocial

CampaignKit — Calendar postări (S138, set 2). Romanian only for now; keys `marketing.so.*` in `i18n/marketing.json`.

**The calendar.** Month (a 7-column grid, Monday first, today outlined) and week; on phones an agenda list. Each post is a chip: time, the networks ("FB", "IG", with their full names as labels; no brand logos), the title; draft (dashed), scheduled, published (filled), failed (danger outline); a legend under it. Filters: network; "Azi", previous / next.

**Composing** (Drawer): where (the Facebook page, the Instagram business account), the text (with Instagram's limits), images (up to 10; Instagram's aspect ratios), date and time, a preview per network (Facebook / Instagram, with the note that Instagram links aren't clickable), "Salvează ciorna", "Programează".

**A failed post** (Drawer): the reason in a danger Notice ("Instagram a respins postarea: raportul 3:1…"), where, when, tries, the error code, "Editează și reîncearcă"; a bell notification.

**Accounts** (Drawer): Meta (Facebook and Instagram) — connected by whom and when, the pages and accounts ticked, "Reconectează", "Deconectează" (Dialog: scheduled posts go back to drafts; published ones stay); not connected — what OAuth means (the password never reaches Ventora Systems, the pages are chosen in Meta's window, permission only to publish and read the result), "Conectează cu Meta". Other networks (TikTok, LinkedIn, Google Business Profile, X): "În curând".

**Until Meta approves.** "Conectarea Meta nu e încă disponibilă" (neutral Notice): posts can be prepared as drafts only; "Conectează cu Meta" disabled; in the composer the button reads "Se poate programa după conectarea Meta".

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S138, CampaignKit set 2).**
- **Blocked clients in campaigns.** Recommendation: the blocked list stays in EasyBook and never reaches CampaignKit (drawn); a blocked client who doesn't want messages unsubscribes like anyone.
- **Predefined segments.** Recommendation: read only, duplicated to change (drawn); "Inactivi" uses 90 days, the reactivation automation its own number of days.
- **Double opt-in.** Recommendation: on by default for every new CampaignKit form, mandatory for imports from events where consent was oral.
- **Lead in ClientDesk from a form.** Recommendation: on by default when ClientDesk is active, with rotation among members.
- **Marketing messages in ClientDesk and EasyBook (D-CK-12).** Recommendation: when CampaignKit is turned on, ClientDesk's marketing automation moves here automatically, with a notice to the owner; when it is turned off, it goes back, off.
- **Automation frequency cap.** Recommendation: automations count in the same cap as campaigns (2 in 7 days), except "Bun venit".
- **Social networks.** Recommendation: Facebook and Instagram first (after Meta's approval), then Google Business Profile; TikTok and LinkedIn after the first 50 businesses use the calendar.
- **Who can publish posts.** Recommendation: owners and admins; members prepare drafts (the same approval as campaigns).
- **Export.** Recommendation: owner and admins only, logged (drawn).

**S146.** The "Media" tab (the media library, "Alege din bibliotecă" in the composer) is drawn in CampaignKitMedia.
