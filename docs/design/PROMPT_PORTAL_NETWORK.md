# VENTORA — PORTAL & NETWORK: DESIGN (prompt pentru Claude Design)

Vreau să proiectăm două produse ale ecosistemului Ventora:

1. **Ventora Portal**: platforma pentru consumatori (B2C).
2. **Ventora Network**: platforma profesională dintre afaceri (B2B).

Lucrăm **exclusiv la design și documentație UX**. Nu se scrie cod, nu se atinge repository-ul și nu se întrerupe nimic din dezvoltarea în curs.

---

## 0. Ce ai atașat și cum îl folosești

| Fișier | Rol |
|---|---|
| `14-portal.md` (151 de funcționalități), `15-network.md` (137) | **Cerințele.** Ce e acolo se proiectează; ce nu e acolo nu se inventează. |
| `DESIGN_RULES.md` | Regulile de design, UX writing (§13), componente comerciale (§14), Product Experience (§15) |
| `ARCHITECTURE.md` | Identitate și separare (§3.1, §7.6), designul Portal/Network (§10.8), deciziile (§17) |
| `GROWTH_ENGINE.md` | Separarea dintre recomandările Ventora și monetizarea proprie Portal/Network |
| `README.md` + `glossary.md` (design system-ul aprobat) | Fundația comună și terminologia |
| `SCREEN_REVIEW_TEMPLATE.md` | Fișa de review pentru fiecare ecran |

Artefactul aprobat al designului business: https://claude.ai/artifact/7cKaNW6635S7vQavjgY8zH. **Doar referință. Nu îl modifici.**

**Lucrezi într-un artefact NOU:** „Ventora — Portal & Network”.

**Regula de bază:** nu inventezi funcționalități și nu modifici checklisturile. Dacă un flux are nevoie de ceva ce nu e în checklist, îl propui separat, marcat „PROPUNERE — necesită aprobare”, și nu îl desenezi ca și cum ar fi aprobat.

---

## 1. Identitatea vizuală (decizia D-UI-4)

Designul business (Hub, Founder, cele 13 aplicații) **rămâne neschimbat**. Portal și Network au **identitate vizuală proprie**, pe aceeași fundație tehnică.

**Comune și neschimbate:**
- structura tokenilor (aceleași nume de roluri: suprafețe, text, accent, atenție, gata, margini, raze, spațiere, umbre);
- temele Light / Dark / System;
- cele 6 limbi: RO, EN, FR, ES, DE, IT (test cu etichetele cele mai lungi, DE și IT);
- responsive de la 360 la 2560 px;
- accesibilitatea: contrast verificat pentru fiecare pereche text/fundal, în ambele teme (4,5:1 text, 3:1 elemente grafice), focus vizibil, navigare din tastatură;
- comportamentul primitivelor (dialoguri, meniuri, câmpuri, toast-uri);
- logo-ul Ventora oficial. Propui cum apar „Portal” și „Network” lângă el.

**Proprii:** seturile de valori `tokens/portal` și `tokens/network` (culori, densitate, raze, tipografie de afișare, ilustrații, fotografie, mișcare) și componentele specifice fiecărui produs.

**Personalitate:**
- **Portal:** cald, expresiv, vizual, prietenos, orientat spre explorare. Nu trebuie să arate a software pentru firme. Mobile-first: cei mai mulți îl vor folosi pe telefon.
- **Network:** sofisticat, structurat, profesional, orientat spre relații și oportunități. Nu e un CRM și nu e o copie LinkedIn.

---

## 2. Separarea produselor (nu se negociază)

- **Portal** stă pe `portal.ventora-hub.com`. Consumatorii au **cont separat** de conturile de business. Același email în Portal și în Hub **nu** înseamnă același cont și nu dă acces la nimic din celălalt produs.
- **Network** stă în platforma de business (`app.ventora-hub.com`), folosește organizațiile, rolurile și permisiunile existente din Hub și apare în launcher ca aplicație. Checklistul cere „acces exclusiv pentru organizații B2B și utilizatorii autorizați” și „identitate comună cu Ventora Hub”.
- În Network nu apare **nicio** dată internă din Hub sau din aplicațiile private (programări, clienți, facturi, angajați). Doar ce publică organizația, cu controlul vizibilității.
- Cine vorbește în numele unei organizații în Network e un utilizator autorizat de ea (rolurile din checklist). Interfața arată mereu **în numele cui** acționezi.

---

## 3. Decizii deschise: nu le presupui

În audit propui variante, cu argumente, și le marchezi **NECESITĂ DECIZIE FONDATORI**:

- **D-NET-1:** Network are pagini publice, vizibile fără cont (de exemplu, profilul companiei indexabil)? Checklistul spune „acces exclusiv pentru organizații B2B”. Arată ce ar însemna fiecare variantă.
- **D-POR-1:** unde își gestionează o afacere prezența în Portal (secțiunea „Business Portal Management”, 12 funcționalități): în platforma de business sau în Portal?
- **D-PROF-1:** profilul public al afacerii e comun pentru Portal și Network sau separat? Ce date se repetă, ce diferă.

---

## 4. Zone cu dependențe

- **VeeCoin, Spin Wheel, conturile de familie, recenziile verificate** depind de o **verificare juridică** încă nefăcută. Le proiectezi conform checklistului, le marchezi „depinde de validarea juridică” și nu le pui în centrul navigației până la aprobare.
- **Spin Wheel:** fără mecanici de joc de noroc, fără cumpărarea de încercări, fără urgență falsă, cu șansele și regulile afișate clar.
- **Conturile de familie:** atenție la minori. Fără conținut comercial direcționat către ei; controlul aparține adultului titular.
- **Monetizarea proprie** (Portal: „Growth, Referrals & Monetization”; Network: „Business Promotion & Monetization”) e separată de recomandările Ventora (Growth Engine, D-GRW-9) și e **întotdeauna marcată vizibil** („Sponsorizat” sau formularea aprobată la microcopy). Un rezultat sponsorizat nu se poate confunda cu unul organic.
- **Recomandările AI** (ambele produse) explică de ce apar („De ce văd asta?”) și pot fi controlate din preferințe; checklistul Network o cere explicit.
- **Integrările cu Booking și Events** (Portal: „Booking & Events Integration”; Network: evenimente prin Ventora Events): se arată doar când afacerea are aplicația activă. Altfel, starea alternativă e curată, fără gol.

---

## 5. Ce acoperi: secțiunile din checklisturi

**Portal (14 secțiuni):** Consumer Accounts & Profiles · Business Profiles & Discovery · Consumer Feed & Content · Reviews & Reputation · Loyalty & Rewards · VeeCoin & Gamification · Family Accounts · Marketplace & Offers · Booking & Events Integration · Messaging & Notifications · AI Discovery & Personalization · Business Portal Management · Growth, Referrals & Monetization · Safety, Privacy & Common Features.

**Network (12 secțiuni):** Business Identity & Profiles · Business Discovery & Connections · Professional Feed & Content · Business Messaging · Opportunities & Collaboration · Groups & Communities · Business Events & Networking · Partnerships & Relationship Management · Recommendations & AI Networking · Business Promotion & Monetization · Network Analytics & Integrations · Safety, Permissions & Common Features.

**Experiențe cheie:**
- **Portal: descoperirea.** Nu un catalog rigid: categorii atractive, explorare pe interese, recomandări contextuale, carduri expresive cu acțiunea principală evidentă (de exemplu „Programează-te”, când afacerea are Booking).
- **Portal: loialitatea și recompensele.** Soldul, progresul spre recompense, magazinul de recompense, istoricul, eligibilitatea, regulile explicate simplu. Microinteracțiuni discrete. Fără manipulare, fără urgență falsă, fără promisiuni înșelătoare.
- **Network: descoperirea afacerilor.** Profiluri profesionale, domeniul și serviciile, informații utile pentru colaborare, semnale de încredere **doar dacă sunt susținute de date reale** (profil verificat, badge-uri din checklist). Diferența clară între a descoperi, a urmări, a te conecta și a colabora.
- **Network: colaborarea, cap-coadă.** Descoperire → profil → interes → contact → comunicare → oportunitate / propunere → parteneriat. Verifici ce pași acoperă checklistul (Opportunities, Messaging, Partnerships) și propui separat ce lipsește.

**Pentru fiecare experiență, stările:** ideal · gol · încărcare · eroare · fără rezultate · utilizator nou · utilizator fără date / fără recompense / fără conexiuni · neautentificat (Portal) · acces restricționat (rol fără drept, Network) · conținut raportat sau blocat.

---

## 6. Etapele de lucru

**Etapa 1 — Audit.** Ce se poate refolosi din fundația comună, ce e nou, ce e neclar sau contradictoriu în checklisturi, cele trei decizii deschise (§3), dependențele (§4). Apoi te oprești pentru aprobare.

**Etapa 2 — Arhitectura UX** (pentru fiecare produs): sitemap, navigația principală (mobil și desktop), user journeys esențiale (utilizator nou, utilizator care revine, afacere nouă în Network, o colaborare cap-coadă), structura paginilor, componentele reutilizabile (ce vine din fundație, ce e nou), matricea stărilor. Apoi te oprești pentru aprobare.

**Etapa 3 — Direcția vizuală:** câte o direcție pentru fiecare produs, cu tokenii propuși (light și dark, contrast verificat), tipografie, carduri, fotografie și ilustrații, mișcare, și o comparație care arată de ce Portal, Network și designul business se recunosc ca Ventora, dar nu se confundă. Apoi te oprești pentru aprobare.

**Etapa 4 — Primele ecrane**, după aprobarea direcției:
- Portal: Homepage (telefon, apoi desktop) · Explorează / Discovery · Profilul unei afaceri
- Network: Homepage (desktop, apoi telefon) · Descoperirea afacerilor · Profilul unei companii

**Etapa 5 — Review**, după **fiecare** ecran:
- fișa A–E (DESIGN_RULES §15, șablonul atașat);
- revizuirea de microcopy (§13): extragi toate textele, propui varianta revizuită, marchezi ce cere decizia mea. Textele: naturale, calde, clare, fără formulări generice. Pentru consumatori, adresarea se stabilește la microcopy (în designul business, clienții finali sunt adresați cu „dumneavoastră”; propune ce se potrivește în Portal și argumentează);
- glosarul extins cu termenii noi, în cele 6 limbi;
- verificarea light / dark, telefon / tabletă / desktop / ecran lat.

Aștepți aprobarea mea înainte de ecranul următor.

---

## 7. Reguli de comportament

- Reduci efortul cognitiv, dezvălui progresiv, faci clară următoarea acțiune, motivezi prin valoare reală.
- **Fără dark patterns:** fără presiune artificială, fără numărători inverse false, fără refuz culpabilizant, fără pre-bifări, fără scroll infinit gândit să țină omul captiv, fără notificări de dragul engagement-ului.
- Personalizarea e transparentă și controlabilă.
- Încrederea se câștigă cu date reale, nu cu insigne decorative.

---

## REGULĂ FINALĂ

Design și documentație UX, atât. Începe cu **Etapa 1 (auditul)** pentru ambele produse și prezintă-mi-l înainte de a continua.
