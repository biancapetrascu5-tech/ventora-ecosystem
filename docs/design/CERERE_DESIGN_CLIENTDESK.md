# Cererea de design pentru ClientDesk (CRM)

**Pentru:** Claude Design · **Din:** `docs/plans/CRM.md` §5.2 (aprobat 10.11.2026) · **Lotul:** CR.0

ClientDesk e CRM-ul unei afaceri de servicii. Prima afacere care îl folosește e un salon, împreună cu EasyBook (bundle-ul „Programări”). Cerința completă: `docs/checklists/02-crm.md` (66 de funcționalități și 4 adăugiri).

Fiecare ecran, ca până acum:
- doar din componentele sistemului;
- la 1280, 820 și 390, light și dark;
- cheile `crm.*` în `i18n/crm.json`;
- un README cu deciziile luate și ce rămâne de decis.

## Ce există deja

- **`CrmPipeline`:**
  - pipeline-ul, cu etapele implicite Contact nou, Ofertă trimisă, Negociere, Câștigate, Pierdute;
  - „Editează etapele”.
- **`AppStates`, stările ClientDesk:**
  - pipeline gol, etapă goală;
  - mutat;
  - pierdut, cu motiv opțional.
- **`Kanban`, `HubAppTexts`, `GrowthSlot`, `HubAutomations`, `BookingClientCard`.**

## Ce se cere, în ordine

### 1. Shell, lista, fișa (CR-UI.1–3)
- **Spine-ul ClientDesk:** intrările și ordinea lor.
- **Dashboard-ul:**
  - KPI: leaduri noi, conversie, valoarea pipeline-ului, câștigate în lună, sarcini după termen;
  - „Au nevoie de tine”;
  - slotul Growth în coloana laterală.
- **Lista contactelor și a companiilor:**
  - filtre, etichete, segmente salvate, segmentul „nu au mai venit de N zile”;
  - acțiuni în bloc;
  - starea goală.
- **Fișa contactului:**
  - datele, inclusiv ziua de naștere;
  - câmpurile proprii;
  - istoricul cronologic: activități, mesaje, schimbări de etapă, programări;
  - notițele;
  - comentariile cu mențiuni;
  - sarcinile;
  - dealurile;
  - atașamentele, cu avertismentul despre datele medicale;
  - consimțământul pe canal (e-mail / SMS);
  - ciclul de viață: nou, recurent, inactiv.
- **Fișa companiei:** persoanele, cu rolul fiecăreia.
- **Contactul legat de EasyBook** (D-CRM-1, D-CRM-2):
  - numele, telefonul, e-mailul și limba sunt doar în citire, cu „Editează în EasyBook”;
  - programările în istoric;
  - „Programare nouă”;
  - legătura spre fișa din EasyBook;
  - nota de comportament și datele medicale **nu apar** aici.

### 2. Leaduri, dealuri, activități (CR-UI.4–6)
- **Căsuța de leaduri:**
  - sursa, scorul cu motivul, starea (nou, contactat, calificat, descalificat);
  - fișa leadului;
  - conversia în contact (și companie) + deal.
- **Dealul (Drawer):**
  - valoarea și moneda, probabilitatea, data estimată;
  - serviciile, din catalogul EasyBook sau libere;
  - câștigat / pierdut, cu motiv.
- **Activitățile și sarcinile:**
  - apel, întâlnire, notă;
  - pasul următor, remindere;
  - „Ale mele” și ale echipei;
  - calendarul activităților, pe zi și pe săptămână.

### 3. Import, setări, duplicate (CR-UI.7–9)
- **Importul:**
  - fișierul (CSV / Excel);
  - maparea coloanelor;
  - previzualizarea cu erorile pe rând;
  - duplicatele: sari, actualizează sau creează;
  - progresul și raportul erorilor.
- **Exportul.**
- **Setările:**
  - pipeline-uri și etape (limita: 2 pipeline-uri);
  - câmpuri proprii;
  - etichete;
  - surse;
  - motive de pierdere;
  - scoring-ul (ponderile, cu motivul).
- **Duplicatele:**
  - lista;
  - îmbinarea câmp cu câmp.

### 4. Automatizări și mesaje (CR.13–CR.15)
- **Automatizările predefinite**, în modelul `HubAutomations`:
  - Next Action automat;
  - reminder pentru lead necontactat;
  - notificare la schimbarea etapei;
  - atribuirea pe rând sau pe sursă;
  - follow-up după N zile;
  - acțiuni la câștigat / pierdut;
  - reminder de ziua de naștere.
- **Șabloanele de mesaje**, scrise de Ventora; afacerea completează doar câmpurile marcate.
- **E-mailul și SMS-ul către un contact:**
  - compunerea;
  - cum apare în istoric;
  - mesajul primit de contact, pe e-mail și pe SMS, cu dezabonarea.
- **Registrul de consimțământ pe canal:** starea, sursa, versiunea textului, retragerea.
- **Secvențele:**
  - pașii (e-mail, SMS, sarcină, așteptare);
  - opririle;
  - starea fiecărui contact.

### 5. Rapoarte și formulare (CR.16, CR.17)
- **Rapoartele:**
  - conversia;
  - pipeline-ul și valoarea;
  - membrii;
  - sursele;
  - forecast-ul ponderat;
  - durata ciclului;
  - activitățile.
- **Obiectivele pe membru și pe echipă.**
- **Formularul public:**
  - editorul: câmpurile, consimțământul, mulțumirea;
  - codul de inserat;
  - pagina publică, în modelul `BookingPublic`.

### 6. API (C.3, în Hub)
- **Cheile API:**
  - crearea, cu scope-urile;
  - cheia arătată o singură dată;
  - expirarea, revocarea.
- **Webhook-urile:**
  - adresa, evenimentele;
  - secretul;
  - jurnalul livrărilor, cu reîncercările.
