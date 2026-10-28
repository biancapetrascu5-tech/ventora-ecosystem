# FounderSupportSession

The support session in Founder Control Center (Lotul 2.5c), from the business page (S95) (FounderBusiness → "Mai multe" → "Deschide o sesiune de suport"). Romanian only (S57); every text a key in `i18n/founder-support.json`. All approved: `founder.support.banner.*` (S86) and `founder.support.open.*` (S98).

**The form (S86).** A Dialog: "Motiv" (required, 10–1.000 characters with a counter; owner and admin see it), "Referința cererii" (required, at most 255 characters; from support@ventorasystems.com) (S93), "Durata" (optional; 30 de minute, 1 oră, 2 ore, 4 ore; default 1 oră, at most 4 ore, S92), "Deschide sesiunea" / "Renunță". States: missing fields, an open session already exists for the business (Notice danger, button disabled), opening.

**During the session.** A peach strip above the page (S90: you are now in another business's data): "Ești în sesiune de suport pentru {organizationName}", "Expiră la {expiresAt}", "Doar citire: nu poți modifica date, membri, parole sau abonamentul." and "Închide". Closing asks "Închizi sesiunea de suport pentru {organizationName}?" ("Renunță" / "Închide"), then the Toast "Sesiunea de suport s-a închis." When it expires, the strip turns neutral: "Sesiunea de suport a expirat. Deschide una nouă dacă mai ai nevoie de acces.", with "Deschide o sesiune de suport".

Shown at 1280 and 390, in light and dark.
