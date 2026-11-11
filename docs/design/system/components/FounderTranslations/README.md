# FounderTranslations

Founder — Traduceri (S136, GROWTH §4, D5-6). Under Growth in the Founder Spine, after "Audiențe". Romanian only for now; keys `founder.growth.translations.*` in `i18n/founder-growth.json`.

**The list.** One Stat per language (EN, FR, ES, DE, IT): approved texts out of the total, with drafts to check; a language with missing texts is in attention. Filters: language, state ("Lipsește", "Ciornă", "Aprobată"), offer or campaign. A DataTable per language: the text (offer or campaign · field), the Romanian original, the translation, the state; row actions "Editează", "Propune cu AI", "Aprobă" (drafts only). "Propune cu AI textele lipsă (n)" fills the missing ones as drafts.

**The rule.** An offer does not start in a language without all its texts approved: a Notice on top says which offer and which language are blocked and opens the missing texts. Businesses using that language don't see the offer until then (no fallback to Romanian).

**Editing** (Drawer): the original (read only) next to the translation, the character limit of the slot, where it appears, the tone ("Lei" in Italian, "Sie" in German, "vous" in French, "usted" in Spanish), the history. "Textul anterior", "Salvează ciorna", "Aprobă".

**"Propune cu AI".** The text arrives as a proposal, marked "Propunere AI · neverificată", with a Notice to check tone, prices and app names. It stays a draft until a person approves it; no offer ever uses a draft. App names, "Ventora Systems" and the currency are never translated.

**Starting an offer** (Dialog): each language with "Gata" or "n texte neaprobate"; the submit says in how many languages it starts.

**States.** Approved (Toast); all texts approved.

Shown at 1280, 820 and 390, light and dark.
