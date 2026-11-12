# CampaignKitDashboard

CampaignKit — the shell and "Pagina principală" (S137, set 1). Romanian only for now; keys `marketing.*` in `i18n/marketing.json` (shell: `marketing.nav.*`, `usage.*`, `notif.*`, `off.*`; page: `marketing.dash.*`).

**The shell.** AppShell with the CampaignKit Spine (`app="marketing"`, the icon from AppIcon): Pagina principală, Campanii, Audiențe, Contacte, Formulare, Automatizări, Calendar postări; "Afacere": Rapoarte, Setări. On phones the bottom bar has Acasă, Campanii, Audiențe, Rapoarte. The Spine footer is the UsageMeter of active and scheduled campaigns.

**Real sending is off.** A neutral Notice on top of every page: "Trimiterile reale sunt oprite deocamdată" — campaigns can be prepared, sent for approval and tested on your own address; nothing reaches clients until sending is turned on, after the legal review. The send button carries the same words (CampaignKitNewCampaign).

**The page.** "Luna aceasta": active and scheduled campaigns against the plan ("12 din 20", UsageMeter), e-mails sent (the quota is shared with ClientDesk), SMS sent (from the business's SMS pack, sent through SMSLink from the shared Ventora Systems short number, D-CK-5 — S138). "Ultimele rezultate" for the last campaign: sent, delivered, clicks (against your average), unsubscribes, and clicks per month (LineChart). "Urmează": scheduled and sending campaigns. "Ce trebuie făcut": a campaign waiting for your approval, a list with many bounces, a paused campaign. The permitted Growth slot (owner and admins only, GrowthSlot + RecommendationCard: "500 de SMS în plus").

**States.** Near the campaign limit (19 of 20, a peach Notice); a member's view (no Growth slot; "„…” e la aprobare", their drafts); empty ("Pregătește prima campanie", "Pornește de la un șablon").

Shown at 1280, 820 and 390, light and dark.
