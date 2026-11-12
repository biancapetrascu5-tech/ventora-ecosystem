# CampaignKitEmailEditor

CampaignKit — the block e-mail editor (S137, set 1). Romanian only for now; keys `marketing.ed.*` in `i18n/marketing.json`.

**Blocks.** Titlu, Text, Imagine, Buton, Două coloane, Separator, Social, Cod promo — a toolbar "Adaugă un bloc" above the canvas (a menu on phones). The selected block has an outline and a small bar: the drag handle, "Mută mai sus", "Mută mai jos", "Duplică", "Șterge". The settings panel is on the right on desktop, under the canvas on tablet and phone.

**Fixed header and legal footer** (as in ClientDeskTemplates, D-CRM-16). The header (the business's logo and name) and the footer (the unsubscribe link and the business's name, CUI and address) are marked "Fix", can't be edited or deleted; selecting them explains where the data comes from (business profile, Hub › Datele de facturare).

**Styles from the brand.** No block selected: the business's logo, colour and the system font; the button colour is the business's colour, not chosen per campaign.

**Variables.** {prenume}, {nume}, {afacere}, {link_programare}; a fallback text is required ("Bună ziua!" replaces the whole greeting), with both versions shown.

**Image.** Upload (PNG or JPG, up to 1 MB), the alternative text (required), an optional link.

**Preview.** Desktop / phone, as a real contact or one without a first name; always light (some mail apps invert colours in dark mode). **"Trimite-mi un test"**: to your address or a team member's, "[TEST]" in the subject, not counted in the quota; a Toast when it leaves.

**Checks before sending.** Empty subject, a button without a link, an image without alternative text — each with "Completează" / "Mergi la bloc", the blocks outlined in red; the legal footer and variables shown as fine; "Continuă" disabled until fixed.

**Ventora Systems templates.** A gallery (Ofertă de sezon, Noutăți lunare, Ne-a fost dor de dumneavoastră, Invitație la eveniment, Cod de reducere, Gol) with "Folosește"; all keep the fixed header and footer and the business's colour.

The sample client e-mail uses "dumneavoastră". Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S137, CampaignKit set 1).**
- **Who approves.** Recommendation: members' campaigns need the owner's or an admin's approval; owners and admins schedule directly (drawn).
- **The frequency cap.** Recommendation: at most 2 campaigns per person in 7 days, across e-mail and SMS, set per business in Setări.
- **SMS sending.** Decided (D-CK-5, S138): through SMSLink, from the business's SMS pack, from the shared Ventora Systems short number; never from the business's phone used by EasyBook.
- **SMS hours.** Recommendation: 9:00–20:00 Romanian time (drawn), no SMS on Sundays and public holidays.
- **Unsubscribe in SMS.** Decided with D-CK-5 (S138): "STOP pentru dezabonare" at the end, replying STOP to the short number; the business's name at the start. Both added automatically (CampaignKitNewCampaign).
- **The e-mail quota.** Recommendation: one monthly quota shared by ClientDesk and CampaignKit (drawn); tests not counted.
- **Campaign limit.** Recommendation: 20 active and scheduled campaigns in Business, drafts and sent ones not counted.
- **Bounces.** Recommendation: a hard bounce goes to suppression at once; a list above 5% bounces gets a warning on the dashboard and in the audience step.
- **Real sending.** Recommendation: keep the button disabled with "Trimiterile reale sunt oprite deocamdată" until the legal review (GDPR, Law 506/2004 on electronic communications), then turn it on per business.
