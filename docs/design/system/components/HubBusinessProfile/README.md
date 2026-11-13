# HubBusinessProfile

Hub — Afacerea › „Profilul afacerii” (S147, 13.11): numele afacerii (doar citire, „Pentru alt nume, scrie-ne.”) și logo-ul. O intrare nouă în Spine, prima din „Afacerea”.

**Logo-ul.** Doar proprietarul și adminul îl încarcă, îl înlocuiesc sau îl șterg; membrii îl văd, cu „Doar proprietarul sau un administrator poate schimba logo-ul.” Formate și mărime afișate: PNG, JPG sau SVG, maximum 2 MB, pătrat, cel puțin 256 × 256 px. Stări: fără logo (ce vede echipa în lipsa lui), se încarcă, salvat (toast), fișiere respinse (tip, mărime, imagine prea mică), ștergere cu confirmare. Sub el, „Așa apare în selectorul de afacere”.

**Unde apare.** În OrgSwitcher, la toți membrii afacerii; fără logo, fiecare își vede poza de profil (HubAccount) sau doar numele.

Chei `hub.nav.businessProfile*`, `hub.business.*` în `i18n/team.json`, 6 limbi. Desenat la 1280 și 390, light și dark, plus DE și IT.

**DE DECIS (S147).**
- **Limitele logo-ului.** Recomandare: PNG, JPG sau SVG, 2 MB, minimum 256 × 256 px, păstrat pătrat (desenat așa). SVG-ul se curăță pe server înainte de salvare.
- **Numele afacerii.** Recomandare: rămâne schimbat doar de echipa Ventora, la cerere (desenat așa); dacă vrei să-l poată schimba proprietarul, îl facem câmp.
