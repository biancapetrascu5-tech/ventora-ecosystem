# VENTORA ECOSYSTEM
## REGULĂ GLOBALĂ OBLIGATORIE: DESIGN SOURCE OF TRUTH & SHARED COMPONENT SYSTEM

**Prioritate:** CRITICĂ  
**Aplicabilitate:** Ventora Core, Ventora Hub și toate cele 15 aplicații  
**Momentul implementării:** Din prima zi de dezvoltare a noului repository

### Istoric

| Data | Modificare | Decizie |
|---|---|---|
| 23.10.2026 | Versiunea inițială | — |
| 24.10.2026 | Limbile ecosistemului devin 6: se adaugă italiana (§8) | D-I18N-2 |
| 24.10.2026 | Portal și Network au identitate vizuală proprie, pe aceeași fundație tehnică (§2.1) | D-UI-4 |
| 24.10.2026 | Regulă nouă: UX writing și revizuirea microcopy-ului (§13), inclusă în criteriile de acceptare (§12) | D-UX-1 |
| 24.10.2026 | Regulă nouă: componente și sloturi comerciale, fără dark patterns (§14) | D-GRW-1…11 |
| 24.10.2026 | Standard nou: Global Product Experience & Behavioral Design, cu review în 5 etape pentru fiecare ecran (§15) | D-PX-1 |
| 24.10.2026 | Artefactul oficial e fixat: designul unificat aprobat (etapele 1–5), exportat în `docs/design/system/` (§1) | D-UI-5 |

### 1. CLAUDE DESIGN ESTE REFERINȚA VIZUALĂ OFICIALĂ

Întregul ecosistem Ventora trebuie să respecte designul stabilit în artefactul Claude Design furnizat de fondatori.

> **Artefactul oficial (aprobat 24.10.2026):** „Ventora” — https://claude.ai/artifact/7cKaNW6635S7vQavjgY8zH. Exportul lui stă în `docs/design/system/`; `README.md` de acolo e sursa unică (registrul celor 52 de decizii). Fișele de review aprobate: `docs/design/reviews/`. Portal și Network se proiectează separat (§2.1).

Acest artefact reprezintă referința vizuală principală pentru:

- Structura interfețelor.
- Layout.
- Navigație.
- Sidebar.
- Header.
- Dashboarduri.
- Carduri.
- Tabele.
- Butoane.
- Formulare.
- Inputuri.
- Selectoare.
- Dropdownuri.
- Modale.
- Tabs.
- Badges.
- Notificări.
- Grafice.
- Spațiere.
- Tipografie.
- Culori.
- Border radius.
- Umbre.
- Iconografie.
- Microinteracțiuni.
- Responsive design.
- Dark Mode și Light Mode.

**Claude Code nu are voie să inventeze un alt design pentru fiecare aplicație.**

Nu trebuie să recreeze aproximativ interfețele din memorie.

Trebuie să analizeze artefactul original și să extragă sistematic regulile sale vizuale.

Dacă artefactul conține cod reutilizabil, acesta trebuie evaluat înainte de a implementa componente echivalente.

Dacă anumite elemente nu sunt definite în artefact, Claude Code trebuie să le proiecteze conform regulilor existente, fără să introducă un stil vizual incompatibil.

### 2. UN SINGUR DESIGN SYSTEM PENTRU ÎNTREGUL ECOSISTEM

Toate aplicațiile trebuie să folosească aceeași bibliotecă centrală de componente.

Nu acceptăm implementări independente pentru elemente UI comune.

Exemple:

- Un singur sistem de Button.
- Un singur sistem de Input.
- Un singur sistem de Select.
- Un singur sistem de Checkbox.
- Un singur sistem de Dialog.
- Un singur sistem de DataTable.
- Un singur sistem de Form.
- Un singur sistem de Tabs.
- Un singur sistem de Badge.
- Un singur sistem de Tooltip.
- Un singur sistem de Pagination.
- Un singur sistem de DatePicker.
- Un singur sistem de Toast.
- Un singur sistem de EmptyState.
- Un singur sistem de LoadingState.
- Un singur sistem de AppShell.
- Un singur sistem de Sidebar.
- Un singur sistem de PageHeader.

Aceste componente trebuie să fie configurabile, extensibile și reutilizabile.

Exemplu:

Booking are nevoie de un tabel pentru programări.

CRM are nevoie de un tabel pentru leaduri.

HR are nevoie de un tabel pentru angajați.

Inventory are nevoie de un tabel pentru produse.

**Nu construim patru componente DataTable diferite.**

Construim o singură componentă DataTable comună, cu posibilitatea de a configura:

- Coloanele.
- Tipurile de date.
- Sortarea.
- Filtrarea.
- Căutarea.
- Paginarea.
- Selectarea rândurilor.
- Acțiunile.
- Vizibilitatea coloanelor.
- Empty states.
- Loading states.
- Permisiunile pentru acțiuni.
- Responsive behavior.

Logica specifică unei aplicații rămâne în aplicația respectivă.

Componenta vizuală comună rămâne centralizată.

### 2.1 Excepția Portal și Network (D-UI-4, 24.10.2026)

Regula „un singur design” se aplică pentru Ventora Hub, Founder Control Center și cele 13 aplicații de business.

**Portal** și **Network** au identitate vizuală proprie (culori, tipografie, compoziție, ecrane), proiectată separat. Ele folosesc însă aceeași fundație tehnică:

- schema de design tokens (aceleași nume semantice, valori proprii);
- mecanismul Light / Dark / System;
- sistemul i18n și cele 6 limbi;
- regulile de responsive, accesibilitate și contrast;
- primitivele de comportament (dialog, meniu, tooltip, focus, tastatură etc.).

În interiorul fiecărei familii vizuale (business, Portal, Network) rămân valabile toate celelalte reguli din acest document: fără duplicate, check before create, tokens centralizate, teme și i18n obligatorii.

Tile-urile și iconurile Portal și Network din launcher-ul Hub rămân în designul business. Detalii tehnice: ARCHITECTURE.md §10.8.

### 3. CENTRAL SOURCE OF TRUTH

Noul repository trebuie să conțină o sursă centrală de adevăr, documentată și obligatorie.

Propunem conceptual:

`docs/VENTORA_SOURCE_OF_TRUTH.md`

Acesta trebuie să indice:

- Artefactul oficial Claude Design.
- Versiunea de design aprobată.
- Biblioteca oficială de componente.
- Sistemul de design tokens.
- Regulile de reutilizare.
- Regulile pentru Light/Dark Mode.
- Regulile de internaționalizare.
- Convențiile de denumire.
- Structura componentelor.
- Responsabilitățile Core.
- Responsabilitățile aplicațiilor.
- Contractele comune.
- Regulile de extensibilitate.
- Procedura de introducere a unei componente noi.
- Componentele interzise ca duplicat.
- Criteriile de acceptare.

Acest document este registrul autoritativ al deciziilor, nu locul unde se implementează toate componentele.

Codul efectiv trebuie organizat în pachete comune.

Structura finală a pachetelor se stabilește după analiza artefactului și proiectarea noului repository.

### 4. REGULA CHECK BEFORE CREATE

**Înainte de a crea orice componentă UI, Claude Code trebuie să verifice dacă există deja o componentă echivalentă în biblioteca centrală.**

Ordinea obligatorie:

1. Verifică biblioteca de componente.
2. Identifică dacă există o componentă reutilizabilă.
3. Dacă există, utilizeaz-o.
4. Dacă lipsește o funcționalitate generală, extinde componenta centrală fără să îi strici contractul.
5. Dacă este o cerință exclusivă a unei aplicații, construiește componenta specifică folosind primitivele comune.
6. Dacă este necesară o componentă generală nouă, adaug-o în biblioteca centrală.
7. Documentează componenta și utilizarea sa.
8. Verifică dacă noua componentă funcționează în toate temele și limbile.

**Este interzisă duplicarea componentelor doar pentru că este mai rapid să scrii încă o variantă.**

### 5. SEPARAREA UI DE BUSINESS LOGIC

Biblioteca centrală nu trebuie să conțină logică specifică aplicațiilor.

Exemple:

Core UI poate deține DataTable.

Booking deține definiția coloanelor și acțiunile programărilor.

CRM deține definiția coloanelor și acțiunile leadurilor.

HR deține definiția coloanelor și acțiunile angajaților.

Aceeași regulă se aplică pentru:

- Formulare.
- Dialoguri.
- Filtre.
- Dashboarduri.
- Carduri.
- Grafice.
- Selectoare.
- Navigație.

Nu construim o componentă universală uriașă cu sute de condiții pentru fiecare aplicație.

Reutilizăm primitivele comune și păstrăm logica domeniului în aplicația corespunzătoare.

### 6. DESIGN TOKENS CENTRALIZATE

Toate valorile vizuale comune trebuie definite prin tokens semantice.

Exemple:

- Culori.
- Tipografie.
- Spațiere.
- Border radius.
- Umbre.
- Dimensiuni.
- Breakpoints.
- Stări interactive.
- Culori semantice.
- Tokens pentru grafice.

Nu acceptăm valori vizuale hardcodate repetitiv în componente.

Schimbarea unui token central trebuie să se reflecte în toate aplicațiile care îl utilizează.

Aplicațiile pot avea elemente de identitate proprii, inclusiv iconuri sau accente, numai prin variante și tokens documentate, fără duplicarea componentelor comune.

### 7. DARK MODE ȘI LIGHT MODE

Biblioteca comună trebuie să suporte nativ:

- Light.
- Dark.
- System.

Fiecare componentă nouă trebuie testată în ambele teme.

Nu acceptăm componente construite exclusiv pentru Light Mode.

Nu acceptăm corecții Dark Mode făcute separat în fiecare aplicație.

### 8. INTERNAȚIONALIZARE

Toate componentele comune trebuie să fie compatibile cu:

- RO.
- EN.
- FR.
- ES.
- DE.
- IT. *(adăugată pe 24.10.2026, decizia D-I18N-2)*

Textele vizibile trebuie furnizate prin sistemul de traducere.

Nu se hardcodează etichete în componentele reutilizabile.

Formatarea datelor, numerelor și monedelor trebuie să respecte limba și setările aplicabile.

### 9. REUTILIZAREA LOGICII TEHNICE

Aceeași regulă de evitare a duplicării se aplică și infrastructurii comune.

Nu construim separat în fiecare aplicație:

- Authentication helpers.
- Permission checks.
- Entitlement checks.
- Quota checks.
- API clients pentru Core.
- Error handling comun.
- Notification helpers.
- Audit helpers.
- Localization helpers.
- Theme management.
- Logging comun.

Aceste mecanisme trebuie să aibă implementări comune și contracte clare.

Fiecare aplicație păstrează doar logica specifică domeniului propriu.

### 10. REGULI DE VALIDARE AUTOMATĂ

Nu este suficient să documentăm aceste reguli.

Trebuie să existe mecanisme automate care să detecteze încălcarea lor.

Exemple:

- Reguli ESLint pentru importuri interzise.
- Verificarea dependențelor dintre module.
- Detectarea importurilor între domenii neautorizate.
- Verificări pentru utilizarea componentelor comune.
- Verificări pentru texte UI hardcodate.
- Teste pentru Light/Dark Mode.
- Teste pentru traduceri lipsă.
- Teste vizuale pentru componentele importante.
- Verificări de accesibilitate.
- Validarea contractelor componentelor.

Nu toate verificările pot fi perfecte sau complet automatizate, dar trebuie implementate controale concrete, nu doar reguli scrise într-un document.

### 11. PROCEDURA PENTRU MODIFICĂRI DE DESIGN

Dacă fondatorii modifică designul oficial:

1. Se actualizează referința Claude Design.
2. Se actualizează tokens sau componentele comune afectate.
3. Se verifică compatibilitatea.
4. Se rulează testele relevante.
5. Se verifică impactul asupra aplicațiilor.
6. Se documentează schimbarea.

Nu se modifică individual fiecare aplicație pentru aceeași schimbare globală.

### 12. CRITERII DE ACCEPTARE

O aplicație nu este considerată conformă dacă:

- Nu respectă artefactul Claude Design.
- Introduce componente comune duplicate.
- Folosește alte stiluri vizuale fără justificare.
- Are butoane, tabele sau formulare proprii care duplică biblioteca centrală.
- Nu suportă Light/Dark Mode.
- Nu suportă cele șase limbi.
- Conține texte UI hardcodate nejustificat.
- Reimplementează mecanisme Core.
- Încalcă regulile de dependență dintre module.
- Textele interfeței nu au trecut prin revizuirea de UX writing (§13) sau nu au fost aprobate de fondatori.
- Ecranul nu are fișa de review completată (§15: A–E) și aprobată de fondatori. Un ecran nu e finalizat doar pentru că arată bine.

### 13. VENTORA UX WRITING & MICROCOPY REVIEW (D-UX-1, 24.10.2026)

După finalizarea fiecărui ecran, toate textele interfeței trec printr-o revizuire editorială înainte de aprobarea finală.

Obiectivul este ca Ventora să comunice într-un mod uman, natural, cald, elegant și profesionist.

#### Reguli

1. Evită limbajul robotic, corporatist, rigid sau tradus literal din engleză.
2. Folosește formulări clare, concise și naturale.
3. Preferă exprimarea activă și verbele care descriu acțiuni concrete.
4. Păstrează terminologia consecventă între aplicații (sursa: glosarul Ventora, §13.1).
5. Adaptează tonul la context: prietenos în onboarding; precis în Finance, HR și Contracts; calm și util în situații de eroare.
6. Nu folosi umor sau formulări jucăușe în mesaje critice.
7. Revizuiește toate titlurile, subtitlurile, butoanele, placeholder-ele, tooltipurile, empty states, mesajele de succes, erorile, confirmările și instrucțiunile.
8. Nu modifica sensul funcționalităților în încercarea de a îmbunătăți exprimarea.
9. Textele trebuie să fie pregătite pentru localizare în RO, EN, FR, ES, DE și IT, fără traduceri literale.
10. Nu introduce texte definitive direct în componente. În implementare, ele folosesc chei de traducere prin next-intl.

#### Flux obligatoriu după fiecare ecran

1. Prezintă ecranul realizat.
2. Extrage toate textele vizibile și mesajele aferente stărilor ecranului (default, gol, încărcare, eroare, succes, confirmare, limită atinsă, acces lipsă).
3. Pregătește o propunere de microcopy revizuit.
4. Marchează formulările care necesită decizia fondatorilor.
5. Așteaptă aprobarea textelor înainte de a considera ecranul finalizat.

Ecranele deja aprobate nu se modifică fără ca schimbarea să fie semnalată explicit.

#### 13.1 Glosarul Ventora

Pentru consecvența terminologiei (regula 4) se ține un glosar unic, `docs/ux-writing/GLOSAR.md`: fiecare termen de produs cu forma aprobată în RO și echivalentele în EN, FR, ES, DE, IT (de exemplu: programare, client, afacere, abonament, add-on, invitație). Un termen nou intră în glosar la prima aprobare a unui ecran care îl folosește.

#### 13.2 De la design la cod

Textele aprobate se predau implementării ca listă de chei cu textul RO aprobat și traducerile propuse. În cod ajung exclusiv în cataloagele next-intl, niciodată ca text literal în componente (verificat automat în CI).

### 14. COMPONENTE ȘI SLOTURI COMERCIALE (Growth Engine, 24.10.2026)

Recomandările comerciale (upsell, cross-sell, upgrade, trial, descoperirea aplicațiilor) folosesc **doar** componentele comerciale comune: GrowthSlot, RecommendationCard, DiscoveryTooltip, UpgradeDialog, HubRecommendation, CatalogRecommendation, eticheta „Recomandare” și, ulterior, CommercialBanner. Nicio aplicație nu își construiește propriile bannere sau ferestre de vânzare. Specificația funcțională: `docs/GROWTH_ENGINE.md`; specificația vizuală: `docs/design/SPEC_COMPONENTE_COMERCIALE.md`.

#### Reguli

1. **Comercialul se recunoaște mereu ca atare:** eticheta „Recomandare”, separat vizual de mesajele operaționale.
2. **Nu blochează fluxurile principale.** Sloturile comerciale sunt interzise în formularele în lucru, plăți, erori, confirmări, autentificare și acțiunile sensibile din Finance, HR și Contracts.
3. **UpgradeDialog se deschide doar la o acțiune a utilizatorului** (a apăsat pe ceva blocat, a atins limita, a ales „Vezi opțiunile”). Niciodată la încărcarea paginii.
4. **Închiderea e mereu vizibilă** și fiecare recomandare proactivă are „Nu mă interesează” și „Amintește-mi mai târziu”.
5. **Transparență completă înainte de orice confirmare:** prețul, periodicitatea, costurile de implementare și condițiile trialului (durata, ce urmează la final, dacă e nevoie de card).
6. **Nicio activare plătită fără confirmarea explicită** a unei persoane autorizate. Pentru cei fără drept de cumpărare: cine poate decide + „Recomandă-i administratorului”.
7. **Fără dark patterns:** fără numărători inverse sau urgență falsă (doar termene reale, de exemplu sfârșitul trialului), fără „mai sunt doar X”, fără formulări care culpabilizează refuzul, fără pre-bifări, fără modaluri care blochează navigarea.
8. **Peach doar pentru sensul lui** („acum / atenția ta”, de exemplu limita aproape). Ofertele nu folosesc culorile de brand ca decor ca să atragă atenția.
9. Toate textele trec prin UX writing review (§13), în 6 limbi, cu ton calm, transparent și util, nu insistent.
10. Mesajele operaționale despre limite rămân informative și separate de oferte, chiar dacă afișează opțiunea de add-on.

### 15. VENTORA GLOBAL PRODUCT EXPERIENCE & BEHAVIORAL DESIGN STANDARD (D-PX-1, 24.10.2026)

Se aplică tuturor celor 15 aplicații (inclusiv Portal și Network, în identitatea lor vizuală), Hub-ului și Founder Control Center. Nu modifică funcționalitățile aprobate din checklisturi și nu autorizează implementarea.

**Obiectiv:** fiecare ecran este intuitiv, elegant, eficient, convingător și comunică clar valoarea produsului.

**Discipline de referință:** UX/UI și usability engineering · psihologie cognitivă și comportamentală · behavioral design etic · CRO · Product-Led Growth · UX writing și microcopy · emotional design și construirea încrederii · customer journey mapping · onboarding, activation, retention, feature discovery · accesibilitate și design incluziv.

#### 15.1 Cele 10 întrebări, pentru fiecare ecran

1. Care este obiectivul utilizatorului?
2. Care este obiectivul de business și cum se aliniază cu interesul utilizatorului?
3. Ce trebuie să observe utilizatorul în primele secunde?
4. Care este acțiunea principală și cât de ușor poate fi realizată?
5. Ce informații sunt esențiale și ce poate fi simplificat?
6. Ce bariere cognitive, emoționale sau funcționale există?
7. Cum construim încredere prin design și texte?
8. Cum formulăm titlurile, explicațiile, butoanele și mesajele ca să sune natural?
9. Există o oportunitate legitimă de onboarding, activare, retenție, descoperire sau upsell?
10. Cum măsurăm dacă experiența funcționează?

#### 15.2 Reguli

- Nu aplica mecanic principii psihologice doar pentru că sunt populare. Fiecare alegere se justifică prin obiectivul ecranului.
- Nu introduce pop-up-uri sau elemente comerciale fără context.
- Fără dark patterns, urgență falsă, confirmshaming sau obstacole artificiale (vezi și §14).
- Nu sacrifica eficiența utilizatorului pentru conversii comerciale.
- Respectă independența aplicațiilor și regulile Growth Engine: **orice oportunitate de upsell sau cross-sell identificată la întrebarea 9 se realizează doar printr-un slot Growth Engine** (§14, `GROWTH_ENGINE.md`), nu prin elemente comerciale desenate direct în ecran și nu prin trimiteri directe la alte aplicații.
- Păstrează consistența designului și a terminologiei (glosarul, §13.1) în cele șase limbi.
- Adaptează experiența la rolul utilizatorului (Owner, Admin, membru, colaborator extern, consumator) și la natura aplicației (precizie în Finance/HR/Contracts, viteză la recepție în Booking, căldură în Portal).
- Nu considera un ecran finalizat doar pentru că arată bine.

#### 15.3 Procesul de review, pentru fiecare ecran

| Etapă | Ce verifică | Se sprijină pe |
|---|---|---|
| **A. Functional UX Review** | Întrebările 1, 3, 4, 5: obiectivul, ierarhia vizuală, acțiunea principală, pașii inutili, stările complete (gol, încărcare, eroare, succes, confirmare, limită, acces lipsă), responsive | Patterns, ARCHITECTURE §10.7 |
| **B. Behavioral & Cognitive Review** | Întrebările 6 și 7: încărcarea cognitivă, deciziile cerute, valorile implicite, prevenirea greșelilor, feedback-ul, încrederea | Acest standard |
| **C. Marketing & Conversion Review** | Întrebările 2 și 9: alinierea interes utilizator ↔ business, momentele de activare și descoperire, oportunitățile de upsell (doar prin Growth Engine) | §14, `GROWTH_ENGINE.md` |
| **D. UX Writing & Microcopy Review** | Întrebarea 8: textele din toate stările, glosarul, cele 6 limbi | §13 |
| **E. Accessibility & Trust Review** | Contrast, tastatură, cititoare de ecran, ținte de atingere, zoom, mișcare redusă; transparența costurilor, a datelor și a consecințelor acțiunilor | §7, §8, ARCHITECTURE §10.7 |

Plus întrebarea 10: **măsurarea**. Fiecare ecran propune 1–3 indicatori (de exemplu, timpul până la acțiunea principală, rata de finalizare, rata de abandon, folosirea unei funcționalități descoperite). Indicatorii se implementează prin instrumentarea definită în ARCHITECTURE §10.10.

**Rezultatul review-ului** este o fișă scurtă (`docs/design/reviews/<app>/<ecran>.md`, șablonul din `docs/design/SCREEN_REVIEW_TEMPLATE.md`) care:

1. răspunde pe scurt la cele 10 întrebări;
2. listează modificările recomandate pe etape (A–E), fiecare cu o explicație de o propoziție despre de ce e utilă;
3. marchează ce cere decizia fondatorilor;
4. se încheie cu aprobarea fondatorilor.

Fără fișă aprobată, ecranul nu e finalizat.

### 16. REGULA FINALĂ

**ONE DESIGN. ONE SHARED COMPONENT SYSTEM. ONE SOURCE OF TRUTH. FIFTEEN INDEPENDENT APPLICATIONS.**

Ventora trebuie să arate și să se comporte ca un ecosistem unificat, chiar dacă aplicațiile sale sunt independente funcțional și comercial.

Nu construim aceeași componentă de 15 ori.

Nu reconstruim aceeași logică de 15 ori.

Nu reparăm aceeași problemă de 15 ori.

Construim fundația comună o singură dată, o verificăm și o reutilizăm consecvent.

**Această regulă este obligatorie pentru toate etapele viitoare de dezvoltare Ventora Ecosystem.**