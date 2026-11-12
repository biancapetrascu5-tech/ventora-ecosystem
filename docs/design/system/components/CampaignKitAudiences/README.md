# CampaignKitAudiences

CampaignKit — Audiențe (S138, set 2). Romanian only for now; keys `marketing.aud.*` in `i18n/marketing.json`.

**The list.** Segments (dynamic, updated on their own) and lists (static) in one DataTable: name with type and update time, contacts, with e-mail consent, with SMS consent, where it is used ("3 campanii", "Automatizarea „Ziua de naștere”", "Nefolosită"). Filter: Toate / Segmente / Liste. Predefined segments carry "Predefinit": Clienți noi, Inactivi 90 de zile, Ziua de naștere luna aceasta, Cei care au dat click. A list with many bounces carries "Multe respingeri".

**A segment** (Drawer): name, the rules (RuleBuilder; criteria: tag, source, the app the contact comes from, last EasyBook visit, a deal won in ClientDesk, opened / clicked a campaign, city, language), the estimate (contacts, with e-mail consent, with SMS consent, with no consent), where it is used, when it was recalculated. A predefined segment is read only ("Duplică segmentul" to make your own). A segment nobody matches can be saved, with a Notice.

**A list** (Drawer): its figures (contacts, consent, bounced, unsubscribed), source and legal basis from the import, "Importă în listă", "Adaugă contacte". "Listă nouă" (Dialog): from the register, a file, or a copy of a segment. A segment used in a campaign or automation can't be deleted (Dialog lists where).

**No sensitive criteria.** Health data, EasyBook's "Risc ridicat" note and the blocked-clients list never reach CampaignKit, so they can't be criteria (a shield Info under the list and in the editor). RuleBuilder reads "Contactul trebuie să îndeplinească" (`subject="contact"`, S139).

Shown at 1280, 820 and 390, light and dark.
