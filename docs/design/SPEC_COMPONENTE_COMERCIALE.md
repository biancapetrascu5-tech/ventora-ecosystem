# SPECIFICAȚIE: COMPONENTE COMERCIALE (Growth Engine) — pentru Claude Design

**Data:** 24 octombrie 2026
**Surse:** `GROWTH_ENGINE.md` (specificația funcțională aprobată), `DESIGN_RULES.md` §13 (UX writing) și §14 (componente comerciale), design system-ul unificat „Ventora”.
**Familia vizuală:** business (Hub, Founder, cele 13 aplicații). Variantele Portal și Network se fac separat, mai târziu.

> Instrucțiune pentru Claude Design: construiește componentele de mai jos **doar din tokenii și componentele existente** ale design system-ului (Button, Dialog, Notice, Badge, UsageMeter, AppIcon, AppTile, Tooltip, Menu etc.). Nu crea variante noi de Button, Dialog sau Card dacă există deja. Fiecare componentă: light + dark, telefon / tabletă / desktop, cele 6 limbi (test cu etichete DE și IT), stările complete. După fiecare componentă aplici fluxul de UX writing (§13): extragi toate textele, propui microcopy revizuit, marchezi ce cere decizia mea și aștepți aprobarea.

---

## Principii vizuale comune

- **Discret și util, nu insistent.** O recomandare arată ca o informație bună la momentul potrivit, nu ca o reclamă.
- **Mereu identificabilă:** eticheta mică „Recomandare” (Badge neutru) pe orice conținut comercial.
- **Fără culori de brand ca decor.** Navy doar pentru acțiunea principală; peach doar pentru „atenția ta / acum” (de exemplu, limita aproape); lime doar pentru „gata”.
- **Închiderea mereu vizibilă.** Recomandările proactive au „Nu mă interesează” și „Amintește-mi mai târziu”.
- **Costurile întotdeauna la vedere** înainte de confirmare: preț, periodicitate, cost de implementare (dacă există), condițiile trialului.
- **Fără dark patterns:** fără numărători inverse false, fără „ultimele locuri”, fără refuz culpabilizant, fără pre-bifări.

---

## 1. GrowthSlot

**Rol:** containerul pe care aplicațiile îl pun într-un loc permis. Afișează recomandarea primită de la Growth Engine sau nimic.

- **Stări de arătat:** gol (nu ocupă spațiu, fără „gaură” în layout), încărcare (nu se afișează skeleton; slotul apare doar când are conținut, fără să împingă brusc conținutul), cu conținut (găzduiește RecommendationCard sau DiscoveryTooltip).
- **Unde nu apare niciodată** (de documentat în README): formulare în lucru, plăți, erori, confirmări, autentificare, acțiunile sensibile din Finance/HR/Contracts.

## 2. RecommendationCard

**Rol:** recomandare în pagină (de exemplu, în coloana laterală din „Azi” sau în setări).

- **Anatomie:** eticheta „Recomandare” · iconul aplicației (AppIcon) sau un icon Lucide pentru add-on/plan · titlu scurt · o propoziție despre beneficiu, legată de contextul utilizatorului · linia de cost (preț și periodicitate, sau „Gratuit 14 zile, apoi X lei/lună”) · acțiunea principală · „Nu mă interesează” · meniu cu „Amintește-mi mai târziu”.
- **Variante după ofertă:** activare aplicație, add-on, upgrade de plan, trial, pachet.
- **Variante după rol:**
  - *Owner/Admin*: acțiunea e „Cumpără” / „Activează trialul” / „Cere schimbarea planului”, după caz;
  - *Membru* (doar dacă recomandarea e solicitată, de exemplu din catalog): fără acțiune de cumpărare; „Recomandă-i administratorului” + numele celui care decide.
- **Stări:** default, hover/focus, după „Nu mă interesează” (dispare cu un Toast „Am înțeles, nu-ți mai arătăm asta.” + „Anulează”), după „Amintește-mi mai târziu”.
- **Responsive:** pe telefon pe toată lățimea, acțiunile pe un rând sub text.

**Scenarii de arătat:**
1. Booking → CRM: „Clienții tăi din programări pot avea istoric, note și follow-up în CRM.” (cross-sell din semnalul „integrare lipsă”)
2. Trial Analytics, cu condițiile trialului complete.
3. Membru care vede o aplicație în catalog și o recomandă administratorului.

## 3. UpgradeDialog

**Rol:** dialogul de upgrade / add-on / trial. Se deschide **doar** la o acțiune a utilizatorului: a apăsat pe o funcționalitate blocată, a atins limita sau a ales „Vezi opțiunile”.

- **Pornește de la dialogul existent de limită atinsă** (UsageMeter) și de la fluxul de cumpărare a add-on-urilor deja desenat. Le extinde, nu le dublează.
- **Anatomie:** titlu legat de ce a încercat utilizatorul · ce s-a întâmplat (de exemplu, consumul cu UsageMeter) · 1–3 opțiuni (add-on, plan superior, trial), fiecare cu prețul, periodicitatea, costul de implementare și ce include · o notă clară că datele existente rămân neatinse · acțiuni.
- **Confirmarea plății e un pas separat:** rezumat cu totalul, periodicitatea, ce se activează și când, cardul (ultimele 4 cifre) → „Plătește X lei” / „Activează trialul”. Nicio activare dintr-un singur click pe o recomandare.
- **Variante după rol:**
  - Owner (și Admin cu drept de cumpărare): poate cumpăra;
  - Admin fără drept de cumpărare și membri: vede opțiunile, cine decide, „Recomandă-i administratorului”.
- **Stări:** opțiuni, confirmare, procesare, succes (cota sau aplicația activă imediat, factura disponibilă), eroare de plată (ce s-a întâmplat, ce poți face), trial activat (data de final și ce urmează).
- **Responsive:** pe telefon ca bottom sheet, opțiunile una sub alta, butoanele pe toată lățimea.

## 4. DiscoveryTooltip

**Rol:** indiciu punctual despre o funcționalitate sau o aplicație, lângă elementul relevant.

- Maximum unul pe ecran. Săgeată către element, titlu scurt, o propoziție, „Am înțeles” și, opțional, „Vezi cum funcționează”.
- După închidere nu mai apare.
- **Atingere:** pe ecranele tactile se arată ca un mic card ancorat, nu la hover.
- Nu acoperă câmpuri sau butoane în uz.

## 5. HubRecommendation

**Rol:** recomandare în panoul de notificări din Hub.

- În **NotificationsPanel**, recomandările stau într-o **secțiune separată** („Recomandări”), sub notificările operaționale, cu eticheta „Recomandare”. Nu se amestecă niciodată cu reminderele, facturile sau erorile.
- Contorul de necitite al clopoțelului numără **doar** notificările operaționale.
- Acțiuni: deschide detaliul (RecommendationCard sau UpgradeDialog), „Nu mă interesează”.
- **Pentru admin:** apare și „Recomandare de la echipă”, adică un membru i-a recomandat o aplicație (cine, ce aplicație, nota opțională a membrului), cu „Vezi aplicația” și „Respinge”.

## 6. CatalogRecommendation

**Rol:** recomandări în launcher („Alte aplicații Ventora”) și în catalogul aplicațiilor.

- Pornește de la AppTile și stările de acces existente. Adaugă **motivul relevant** pentru afacere („Se potrivește cu Booking: trimite automat reamintiri și campanii clienților tăi.”) și costul.
- **Doar aplicații nedeținute.** O aplicație deținută nu apare niciodată ca recomandare.
- **Catalogul complet** (ecran nou în Hub): toate aplicațiile Ventora, grupate pe categorii, cu căutare. Fiecare aplicație are o pagină de detaliu: ce face, cu ce se integrează, prețul, periodicitatea, costul de implementare, trialul. Acțiunile depind de rol (Owner/Admin: activează sau cere; membru: „Recomandă-i administratorului”).

## 7. Eticheta „Recomandare”

- Badge neutru, mic, consecvent în toate componentele de mai sus. Nu e peach, nu e lime.

## 8. Preferințe comerciale (în Setările contului)

- O secțiune nouă în HubAccount → Notificări: „Recomandări Ventora”, cu:
  - comutator pentru recomandările în aplicație;
  - comutator pentru email, **dezactivat și blocat**, cu explicația „Disponibil în curând” (emailurile comerciale nu sunt încă active).
- O notă clară: mesajele despre limitele contului tău rămân active, pentru că sunt informații despre cont, nu recomandări.

---

## 9. Founder Control Center: Growth & Campaigns (în Etapa 5)

Ecrane, pe același shell ca restul Founder:

1. **Oferte:** listă (DataTable) și editor: tipul ofertei, obiectul comercial (aplicație, plan, add-on, trial, pachet), acțiunea, costurile afișate (citite din modelul comercial), textele în 6 limbi cu starea aprobării, status.
2. **Campanii:** listă și editor:
   - modul: **automat** (alege semnalul declanșator) sau **manual/programat** (alege perioada);
   - oferta, sloturile, regula de eligibilitate (editor de reguli din criteriile permise: aplicații active/inactive, plan, consum, vechimea afacerii, stadiul de onboarding, rol, limbă, țară, număr de utilizatori; criteriile sensibile nu există ca opțiune);
   - prioritatea, plafoanele (cele globale afișate ca informație), previzualizarea pe slot în light/dark și în fiecare limbă;
   - publicare doar cu textele RO aprobate.
3. **Audiențe:** segmente salvate, cu numărul estimat de organizații eligibile (doar numărul).
4. **Rezultate:** afișări, click-uri, „Nu mă interesează”, opt-out, conversii, venit atribuit, **rata de deranjare** evidențiată ca semnal de alarmă (`attention`).
5. **Control:** comutatoare de oprire **globală**, **pe campanie** și **pe slot**, cu confirmare și efect imediat; plafoanele globale (implicit 1/zi, 3/săptămână, 30 de zile după respingere); jurnalul modificărilor.

---

## 10. Microcopy: direcție de ton (de revizuit prin §13)

- Calm, transparent, la persoana a doua, fără superlative și fără presiune.
- Beneficiul legat de ce face deja utilizatorul, nu promisiuni generale.
- Prețul spus simplu, întreg: „49 lei/lună, fără cost de implementare” / „Gratuit 14 zile. Apoi 79 lei/lună, doar dacă alegi să continui.”
- Refuzul e neutru: „Nu mă interesează”, nu „Nu, mulțumesc, nu vreau mai mult”.
- Exemplele de text din această specificație sunt **orientative**. Formularea finală vine din revizuirea de microcopy și din aprobarea mea.
