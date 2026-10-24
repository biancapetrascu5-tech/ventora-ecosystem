# VENTORA ECOSYSTEM
## MASTER PRODUCT & TECHNICAL ARCHITECTURE BRIEF
### Document de predare către Claude pentru proiectarea, auditarea și dezvoltarea ecosistemului Ventora

**Versiune:** 1.1  
**Modificare 1.1 (24.10.2026):** se adaugă italiana; ecosistemul suportă 6 limbi (decizia fondatoarei D-I18N-2, ARCHITECTURE.md §17.7). Restul documentului e neschimbat.  
**Data de referință:** 23 octombrie 2026  
**Stadiu:** Specificație funcțională confirmată pentru 15 aplicații; arhitectură tehnică de referință definită conceptual; auditul repository-ului existent NU a fost încă efectuat.

---

# PARTEA I. CONTEXTUL GENERAL

## 1. Ce este Ventora

Ventora este un ecosistem software dezvoltat de Ventora Systems, construit în jurul unui principiu fundamental:

**Mai multe aplicații independente, specializate, interconectate printr-o identitate comună, un sistem central de administrare și contracte de integrare standardizate.**

Nu dorim să construim o aplicație monolitică uriașă în care Booking, CRM, HR, Inventory, Finance și toate celelalte funcționalități sunt amestecate într-un singur sistem.

Nu dorim nici 15 aplicații complet izolate, fiecare cu propriul sistem incompatibil de utilizatori, organizații și abonamente.

Dorim o soluție intermediară, atent proiectată:

- Un ecosistem unificat pentru utilizator.
- Produse independente din punct de vedere funcțional.
- O singură identitate B2B.
- Organizații și apartenențe administrate central.
- Abonamente și limite administrate central.
- Aplicații activate individual.
- Integrări opționale între aplicații.
- Baze de date și responsabilități separate pe domenii.
- O experiență vizuală coerentă.
- Suport pentru mai multe limbi și teme încă din prima versiune.
- Posibilitatea de a adăuga aplicații viitoare fără reconstruirea fundației.

Scopul final este o platformă SaaS comercială, scalabilă, multi-tenant, cu o experiență premium și cu posibilitatea de a vinde aplicațiile individual sau în combinații.

## 2. Viziunea utilizatorului

Experiența dorită este următoarea:

Un utilizator accesează Ventora Hub.

Se autentifică o singură dată.

Dacă aparține mai multor organizații, alege organizația în care dorește să lucreze.

Ajunge într-o pagină modernă, cu aplicațiile disponibile pentru organizația respectivă.

Exemple:

- Your Booking
- Your CRM
- Your Documents
- Your HR
- Your Inventory
- Your Analytics

Fiecare aplicație apare sub forma unui card, cu icon propriu, denumire și eventual informații utile.

Utilizatorul apasă pe Booking și intră în aplicația Booking.

Apasă pe CRM și intră în CRM.

Nu trebuie să se autentifice din nou.

Dacă organizația nu are abonament pentru o aplicație, aceasta nu este disponibilă pentru utilizare.

Dacă organizația are abonament, dar utilizatorul nu are permisiune, acesta nu poate accesa aplicația.

**Accesul comercial și accesul utilizatorului sunt două lucruri diferite.**

Hub trebuie să fie un launcher premium al ecosistemului, nu un nou monolit care încearcă să implementeze toate funcționalitățile celorlalte aplicații.

---

# PARTEA II. STRUCTURA ECOSISTEMULUI

## 3. Componentele principale

Ecosistemul este împărțit în patru categorii.

### A. Ventora Core

Infrastructura centrală care gestionează:

- Identitate.
- Autentificare.
- Organizații.
- Apartenențe la organizații.
- Roluri și permisiuni.
- Registrul aplicațiilor.
- Abonamente.
- Planuri comerciale.
- Entitlements.
- Quotas.
- Usage metering.
- Add-on-uri.
- Excepții comerciale.
- Notificări comune.
- Automatizări comune.
- Preferințe de utilizator.
- Suport și tichete.
- Audit și securitate.
- Integrarea aplicațiilor.
- Administrarea Founder/Superadmin.

### B. Ventora Hub

Interfața de intrare în ecosistemul B2B.

Responsabilități:

- Autentificare și acces la sesiunea comună.
- Alegerea organizației active.
- Afișarea aplicațiilor disponibile.
- Lansarea aplicațiilor.
- Setări generale ale utilizatorului.
- Schimbarea limbii.
- Schimbarea temei.
- Acces la informații despre abonamente, în funcție de rol.
- Acces la suport.
- Administrarea organizației, prin interfețele autorizate Core.

Hub nu este proprietarul datelor de booking, CRM, HR sau Finance.

### C. Cele 15 aplicații

1. Ventora Booking
2. Ventora CRM / Clients
3. Ventora Documents
4. Ventora Contracts
5. Ventora Events
6. Ventora HR
7. Ventora Inventory
8. Ventora Shifts
9. Ventora Marketing & Campaigns
10. Ventora Analytics
11. Ventora Assets
12. Ventora Projects & Tasks
13. Ventora Finance
14. Ventora Portal
15. Ventora Network

### D. Servicii transversale

Servicii care pot fi folosite de mai multe aplicații:

- AI Assistant contextual.
- Support / My Tickets.
- Notificări.
- Audit.
- Permission checks.
- Entitlement checks.
- Usage metering.
- Localization.
- Theme engine.
- Logging și observabilitate.
- Integrare și event delivery.

Aceste servicii nu trebuie transformate automat în aplicații comerciale independente.

---

# PARTEA III. PRINCIPII ARHITECTURALE OBLIGATORII

## 4. Independența aplicațiilor

Fiecare aplicație trebuie să poată funcționa individual, fără a necesita achiziționarea celorlalte.

Exemple:

Booking trebuie să funcționeze fără CRM.

Inventory trebuie să funcționeze fără Assets.

HR trebuie să funcționeze fără Shifts.

Finance trebuie să funcționeze fără CRM.

Network trebuie să funcționeze fără Portal.

Documents trebuie să funcționeze fără Contracts.

O integrare poate oferi funcționalități suplimentare, dar nu trebuie să reprezinte o dependență ascunsă.

Dacă o organizație are două aplicații compatibile, ele pot comunica prin mecanismele standard de integrare.

Dacă nu are una dintre ele, cealaltă trebuie să continue să funcționeze.

## 5. Proprietatea datelor

Fiecare entitate operațională trebuie să aibă un proprietar clar.

Exemple:

- Booking deține Appointment.
- CRM deține Lead și Deal.
- Documents deține documentele și versiunile.
- Contracts deține Contract și Obligation.
- Events deține Event, Registration și Ticket.
- HR deține Employee și Attendance.
- Inventory deține StockMovement.
- Shifts deține Shift.
- Marketing deține Campaign.
- Analytics deține rapoarte și definiții analitice.
- Assets deține Asset.
- Projects deține Project și Task.
- Finance deține înregistrările financiare operaționale.
- Portal deține interacțiunile B2C specifice Portal.
- Network deține conexiunile și oportunitățile B2B.

Alte aplicații pot afișa sau utiliza date autorizate, dar nu devin automat proprietarii lor.

**Este interzis accesul direct al unei aplicații la tabelele altei aplicații.**

## 6. Separare logică și fizică

Arhitectura-țintă trebuie să permită:

- Cod separat pe domenii.
- Scheme și migrații controlate pe aplicație.
- Proprietate exclusivă asupra datelor.
- Contracte API între aplicații.
- Evenimente de domeniu.
- Deploy independent acolo unde este justificat.
- Evoluție independentă.

Nu este obligatoriu să implementăm imediat o infrastructură complexă de microservicii.

Alegerea între repository-uri separate, monorepo, deployment-uri distincte sau infrastructură partajată trebuie făcută după auditul tehnic.

Totuși, granițele funcționale și de date nu sunt negociabile.

---

# PARTEA IV. VENTORA CORE

## 7. Modelul canonic de date

Core trebuie să conțină entitățile transversale.

### Identity

Entități conceptuale:

- User
- ConsumerIdentity
- AuthIdentity
- Session
- UserPreference
- AuthenticationFactor
- RecoveryCredential

### Organizations

- Organization
- OrganizationMembership
- OrganizationLocation
- OrganizationSetting
- OrganizationInvitation

### Access Control

- Role
- Permission
- RoleAssignment
- ApplicationAccess
- ResourceAccessPolicy

### Application Registry

- Application
- ApplicationVersion
- ApplicationIntegration
- ApplicationAvailability

### Commercial

- Plan
- PlanVersion
- Subscription
- Entitlement
- Quota
- UsageCounter
- UsageEvent
- AddOn
- OrganizationOverride
- Trial
- CommercialAuditEvent

### Platform Services

- Notification
- NotificationPreference
- NotificationTemplate
- AutomationDefinition
- AutomationExecution
- SupportTicket
- AuditEvent

### Integrations

- IntegrationConnection
- IntegrationCredentialReference
- OutboxEvent
- EventDelivery
- WebhookDelivery
- BackgroundJob

Acestea sunt entități conceptuale.

Claude trebuie să le transforme ulterior într-un model de date riguros, fără să presupună că tabelele există deja în Prisma.

## 8. Identificatori canonici

Propunere:

- `userId`
- `consumerId`
- `organizationId`
- `membershipId`
- `applicationId`
- `subscriptionId`
- `planId`
- `resourceId`

Pentru identificatorii noi recomandăm UUIDv7, dacă auditul nu identifică motive tehnice serioase pentru altă soluție.

Identificatorii trebuie să fie:

- Stabili.
- Opaci.
- Unici.
- Independenți de denumiri comerciale.
- Independenți de localizare.
- Independenți de tipul abonamentului.

Datele existente nu trebuie rescrise arbitrar.

La migrare se folosesc mapări între identificatorii existenți și cei noi.

## 9. Utilizatori și organizații

Relație many-to-many:

Un utilizator poate aparține mai multor organizații.

O organizație poate avea mai mulți utilizatori.

Apartenența trebuie reprezentată explicit prin OrganizationMembership.

Exemplu:

Un utilizator poate fi Owner în organizația A, Admin în organizația B și Member în organizația C.

Rolurile nu sunt globale implicit.

Schimbarea organizației active trebuie să declanșeze reevaluarea:

- Sesiunii contextuale.
- Apartenenței.
- Permisiunilor.
- Aplicațiilor disponibile.
- Abonamentelor.
- Limitelor.
- Accesului la resurse.

Nu este suficientă modificarea unui ID în frontend.

## 10. Separarea B2B și B2C

Identitatea B2B este comună pentru Hub și aplicațiile profesionale.

Identitatea B2C din Portal este separată.

Un consumator nu devine automat utilizator B2B.

Un utilizator B2B nu primește automat acces la datele consumatorilor.

Aceeași adresă de email poate exista în ambele contexte fără să însemne că identitățile sunt aceeași entitate.

Trebuie definite:

- Fluxuri distincte de autentificare.
- Sesiuni și audiențe autorizate.
- Politici de recuperare cont.
- Legături explicite între identități, dacă vor fi necesare.
- Politici de protecție a datelor.
- Preferințe separate.
- Verificări de autorizare la fiecare acces.

## 11. Modelul de permisiuni

Recomandăm un sistem RBAC completat de politici contextuale.

Roluri conceptuale:

**Platform Founder / Superadmin**

Administrează ecosistemul, aplicațiile, planurile și organizațiile.

Nu trebuie să primească automat acces nelimitat la toate datele private ale clienților.

**Organization Owner**

Controlează organizația, utilizatorii, abonamentele și accesul la aplicații.

**Organization Admin**

Administrează funcționalitățile delegate.

**Application Manager**

Administrează o anumită aplicație.

**Member / User**

Accesează funcțiile permise.

**External Collaborator**

Primește acces limitat la anumite resurse sau proiecte.

### Formula de autorizare

O acțiune este permisă numai dacă sunt îndeplinite condițiile relevante:

- Identitate validă.
- Apartenență validă.
- Organizație activă corectă.
- Abonament și entitlement corespunzător.
- Permisiune corespunzătoare.
- Politică de acces la resursă satisfăcută.
- Limită comercială neîncălcată, când operațiunea este contorizată.

Verificările se fac în backend.

Ascunderea unui buton nu reprezintă o măsură suficientă de securitate.

---

# PARTEA V. FOUNDER / SUPERADMIN CONTROL CENTER

## 12. Cerință critică

Ventora trebuie să permită configurarea centralizată a tuturor planurilor comerciale și a restricțiilor de utilizare.

**Founder / Superadmin trebuie să poată modifica limitele, beneficiile și accesul comercial din Ventora Core, fără modificări de cod pentru operațiunile comerciale obișnuite.**

Această cerință se aplică tuturor aplicațiilor.

Nu dorim valori precum:

- Maximum 10 utilizatori.
- Maximum 25 campanii.
- Maximum 50 rapoarte.
- Maximum 3 locații.

scrise direct în codul aplicațiilor.

Valorile trebuie citite din configurația comercială centralizată.

## 13. Funcționalitățile panoului Founder

### Plan Management

- Creare plan.
- Editare plan.
- Duplicare plan.
- Activare și dezactivare.
- Arhivare.
- Versionare.
- Prețuri.
- Monede.
- Periodicitate.
- Beneficii incluse.
- Aplicații incluse.
- Funcționalități incluse.
- Limite de utilizare.

### Entitlement Management

- Activarea unei funcționalități pentru un plan.
- Dezactivarea unei funcționalități.
- Stabilirea disponibilității pe aplicație.
- Stabilirea condițiilor de acces.
- Gestionarea dependențelor comerciale.
- Vizualizarea diferențelor între planuri.

### Quota Management

Limite posibile:

- Număr utilizatori.
- Număr organizații sau locații.
- Număr campanii.
- Număr rapoarte.
- Număr analize AI.
- Număr proiecte.
- Număr evenimente.
- Număr active.
- Număr documente.
- Spațiu de stocare.
- Număr mesaje.
- Număr automatizări.
- Număr exporturi.
- Istoric de date.
- Număr înregistrări sau operațiuni.

Fiecare limită trebuie să aibă:

- Cod unic.
- Unitate.
- Valoare.
- Perioadă de contorizare.
- Regulă de resetare.
- Politică la depășire.
- Comportament la upgrade.
- Comportament la downgrade.

### Add-on Management

- Creare add-on.
- Preț.
- Capacitate oferită.
- Aplicație asociată.
- Valabilitate.
- Reguli de consum.
- Reguli de expirare.
- Activare și dezactivare.

### Organization Overrides

Founder poate acorda excepții pentru o anumită organizație:

- Limită suplimentară.
- Trial extins.
- Funcționalitate activată temporar.
- Plan personalizat.
- Beneficiu comercial special.
- Perioadă de grație.

Aceste excepții trebuie să fie auditate.

### Usage Monitoring

Founder trebuie să vadă:

- Utilizarea pe organizație.
- Utilizarea pe aplicație.
- Limitele curente.
- Consumul curent.
- Apropierea de limite.
- Depășirile.
- Add-on-urile active.
- Istoricul schimbărilor.

## 14. Modelul comercial

Concepte distincte:

**Plan:** pachetul comercial.

**PlanVersion:** versiunea exactă a beneficiilor unui plan.

**Entitlement:** dreptul de a utiliza o funcționalitate.

**Quota:** limita numerică.

**Usage:** consumul înregistrat.

**Add-on:** capacitate suplimentară.

**Override:** excepție specifică unei organizații.

**Subscription:** relația contractuală dintre organizație și Ventora.

Reguli:

1. Planurile sunt versionate.
2. Schimbările nu afectează retroactiv clienții fără reguli explicite.
3. Consumul este înregistrat idempotent.
4. Operațiunile concurente nu trebuie să permită depășiri accidentale.
5. Schimbările de plan au reguli clare.
6. Datele existente nu se șterg automat la downgrade.
7. Add-on-urile au perioade și condiții de utilizare.
8. Toate modificările făcute de Founder sunt auditate.
9. Aplicațiile verifică drepturile comerciale prin contractele Core.
10. Core este sursa de adevăr pentru drepturile comerciale.

### Clarificare importantă

Modificarea valorilor și activarea funcționalităților deja implementate nu necesită modificări de cod.

Introducerea unei funcționalități complet noi poate necesita dezvoltare.

---

# PARTEA VI. DESIGN SYSTEM, DARK MODE ȘI LOCALIZARE

## 15. Dark Mode și Light Mode

**REGULĂ OBLIGATORIE: TOATE aplicațiile se construiesc din prima zi cu suport complet pentru Light Mode și Dark Mode.**

Nu se acceptă construirea inițială doar în Light Mode și adăugarea Dark Mode ulterior.

Se aplică pentru:

- Ventora Hub.
- Ventora Core.
- Founder / Superadmin.
- Toate cele 15 aplicații.
- Portal B2C.
- Network B2B.
- Login și onboarding.
- Dashboarduri.
- Tabele.
- Formulare.
- Modale.
- Grafice.
- Notificări.
- Pagini publice.
- Interfețe mobile.

### Preferințe

Utilizatorul poate alege:

- Light.
- Dark.
- System.

Preferința este persistentă.

Trebuie să se păstreze la schimbarea aplicației.

### Implementare

Folosim design tokens semantice:

- Background.
- Surface.
- Text primary.
- Text secondary.
- Border.
- Interactive.
- Success.
- Warning.
- Danger.
- Accent.

Nu hardcodăm culorile în sute de componente.

Brandul general Ventora poate utiliza culorile:

- Navy: `#000C3F`
- Peach: `#FFAA75`
- Off-white: `#EFF0EE`
- Grey: `#9CA4B4`
- Lime: `#C5D86D`

Fonturile de referință sunt Syne și DM Sans.

Acestea sunt repere ale brandului Ventora, nu obligația ca fiecare produs să arate identic.

Aplicațiile pot avea identități vizuale proprii, dar trebuie să respecte mecanismul comun de teme și standardele de accesibilitate.

## 16. Traducere în șase limbi

**REGULĂ OBLIGATORIE: întregul ecosistem trebuie să suporte din prima versiune RO / EN / FR / ES / DE / IT.**

Limbile sunt:

- Română.
- Engleză.
- Franceză.
- Spaniolă.
- Germană.
- Italiană.

Utilizatorul poate schimba limba printr-un toggle sau selector comun.

Preferința se păstrează între aplicații.

### Reguli de implementare

1. Nu se introduc texte vizibile direct în componente.
2. Toate textele folosesc chei de traducere.
3. Toate cele șase limbi trebuie să fie disponibile.
4. Traducerile sunt organizate pe namespace-uri.
5. Fiecare aplicație își gestionează propriile texte.
6. Textele comune sunt furnizate de infrastructura comună.
7. Datele și orele se formatează localizat.
8. Numerele și monedele se formatează corect.
9. Mesajele de eroare sunt traduse.
10. Validările sunt traduse.
11. Notificările sunt localizate.
12. Emailurile sunt localizate.
13. Documentele generate folosesc limba corespunzătoare când există suport.
14. Trebuie să existe fallback.
15. Nu se afișează chei brute în interfață.

Limba de fallback recomandată: engleză.

Textele introduse de utilizatori, cum ar fi postările, descrierile și comentariile, nu se traduc automat doar pentru că limba interfeței se schimbă.

### Cerință de acceptare

O aplicație nu este finalizată dacă:

- Funcționează doar într-o singură temă.
- Funcționează doar într-o singură limbă.
- Conține texte hardcodate.
- Pierde preferințele la schimbarea aplicației.
- Afișează componente ilizibile în Dark Mode.

---

# PARTEA VII. CELE 15 APLICAȚII

## 17. VENTORA BOOKING

### Rol

Sistem independent de programări și rezervări.

### Funcționalități confirmate

Au fost selectate toate cele 59 de funcționalități din checklistul V1.

Domenii:

- Calendar de programări.
- Creare, editare și anulare programări.
- Programări recurente.
- Programări cu servicii multiple.
- Liste de așteptare.
- Clase și rezervări de grup.
- Mai multe locații.
- Catalog de servicii.
- Personal și resurse.
- Disponibilitate.
- Reguli de rezervare.
- Profiluri de clienți.
- Rezervări publice pentru invitați.
- Confirmări și remindere.
- Email și SMS.
- Automatizări pentru programări.
- Gestionarea no-show.
- Avansuri.
- Plăți și rambursări asociate rezervărilor.
- Reduceri.
- Rapoarte operaționale.
- Integrări opționale cu CRM, Finance, Marketing, Analytics, Portal și Inventory.
- AI contextual.
- Support.
- Permisiuni.
- Audit.

### Reguli

Booking trebuie să funcționeze independent de CRM.

Booking este proprietarul programărilor.

Portal poate iniția o programare numai prin Booking și numai dacă organizația are Booking activ.

Portal nu trebuie să implementeze un al doilea sistem de programări.

---

## 18. VENTORA CRM / CLIENTS

### Rol

Gestionarea relațiilor comerciale, contactelor, leadurilor și oportunităților.

### Funcționalități confirmate

66 din 66 selectate.

Domenii:

- Contacte.
- Companii.
- Profiluri clienți.
- Câmpuri personalizate.
- Import și export.
- Deduplicare.
- Lead management.
- Deal management.
- Pipeline-uri.
- Etape comerciale.
- Lead scoring.
- Conversie Lead → Client.
- Activități.
- Taskuri comerciale.
- Next Actions.
- Follow-up.
- Remindere.
- Automatizări predefinite.
- Mesaje.
- KPI.
- Forecast comercial.
- Rapoarte.
- Integrări opționale cu Booking, Marketing, Finance, Projects, Contracts, Analytics și Portal.
- Formulare de lead.
- API/Webhooks externe.
- AI contextual.
- Support.
- Audit.
- Permisiuni.

### Reguli

CRM deține relația comercială privată a organizației.

Network deține conexiunile din rețeaua profesională B2B.

Un contact descoperit în Network poate deveni lead CRM numai printr-o acțiune sau integrare autorizată.

Nu se sincronizează automat toate conexiunile Network în CRM.

---

## 19. VENTORA DOCUMENTS

### Rol

Sistem independent de administrare a documentelor și fișierelor.

### Funcționalități confirmate

69 din 69 selectate.

Domenii:

- Fișiere.
- Foldere.
- Upload individual și multiplu.
- Căutare.
- Previzualizare.
- Versionare.
- Check-in / check-out.
- Partajare.
- Acces extern controlat.
- Invitații.
- Stocare securizată.
- Criptare.
- Retenție.
- Scanare malware.
- Șabloane.
- Generare documente.
- Fluxuri de aprobare.
- Registru de documente.
- Import masiv.
- Export ZIP.
- Integrări cu Contracts, HR, Projects, CRM, Assets, Finance și Analytics.
- AI contextual.
- Support.
- Audit.
- Permisiuni.

### Reguli

Documents trebuie să funcționeze fără Contracts.

Contracts poate utiliza Documents, dar nu trebuie să depindă obligatoriu de achiziționarea sa.

Documentele trebuie să aibă proprietar, versiuni, permisiuni și politici de acces clare.

---

## 20. VENTORA CONTRACTS

### Rol

Gestionarea ciclului de viață al contractelor.

### Funcționalități confirmate

69 din 71 selectate.

### Excluderi explicite

- Furnizor extern de semnătură electronică.
- API/Webhooks pentru integrări externe.

### Adăugire confirmată

**Semnare sau acceptare prin OTP.**

Fluxul trebuie să includă:

- Cod de unică folosință.
- Expirare.
- Verificarea identității.
- Consimțământ explicit.
- Identificarea versiunii exacte a documentului.
- Dovezi de audit.
- Istoric de acceptare.

Important: acceptarea OTP nu trebuie prezentată automat drept echivalent juridic al unei semnături electronice calificate.

### Alte funcționalități

- Registru de contracte.
- Categorii.
- Părți contractuale.
- Statusuri.
- Termene.
- Obligații.
- Reînnoiri.
- Anexe.
- Versiuni.
- Șabloane.
- Aprobări.
- Valori contractuale.
- Urmărire financiară.
- Rapoarte.
- Integrări interne opționale.
- AI contextual.
- Support.
- Audit.

### Reguli

Contracts este independent de Documents și Finance.

---

## 21. VENTORA EVENTS

### Rol

Sistem complet de organizare și administrare a evenimentelor formale.

### Funcționalități confirmate

82 din 82 selectate.

### Adăugiri speciale confirmate

**A. Linkuri pentru invitați**

Invitații unui eveniment pot primi linkuri dedicate pentru:

- Recenzii despre eveniment.
- Încărcarea fotografiilor.
- Feedback.

Trebuie să existe moderare și protecția datelor.

**B. Invitation Design Store**

Magazin intern Events cu invitații predefinite, create de Ventora.

Utilizatorii pot:

- Explora modele.
- Cumpăra modele.
- Personaliza numele.
- Personaliza data.
- Personaliza locația.
- Personaliza textul.
- Trimite invitații digitale.

Acest magazin aparține Events.

**Nu este Marketplace-ul Portal.**

### Alte funcționalități

- Creare evenimente.
- Evenimente recurente.
- Categorii.
- Locații.
- Capacitate.
- Bilete.
- Bilete de grup.
- QR.
- Check-in.
- Participanți.
- Invitații.
- Pagini publice.
- Comunicări.
- Plăți.
- Echipe.
- Resurse.
- Organizare operațională.
- Rapoarte.
- Integrări opționale.
- AI.
- Support.
- Audit.

### Reguli

Events deține evenimentele formale.

Portal și Network pot afișa sau promova evenimente.

Organizațiile fără Events pot publica postări obișnuite despre evenimente, dar nu pot folosi funcțiile formale de ticketing, înregistrare și check-in.

---

## 22. VENTORA HR

### Rol

Sistem complet de resurse umane.

### Funcționalități confirmate

111 din 111 selectate.

### Domenii

**Employees & Organization**

- Evidență angajați.
- Structură organizațională.
- Departamente.
- Funcții.
- Profiluri.
- Date profesionale.

**Onboarding & Offboarding**

- Procese de integrare.
- Checklisturi.
- Documente.
- Responsabili.
- Etape.
- Procese de plecare.

**Attendance & Timesheets**

- Prezență efectivă.
- Pontaj.
- Ore lucrate.
- Pauze.
- Statusuri.
- Corecții.
- Aprobări.
- Rapoarte.

**Leave & Absence**

- Cereri de concediu.
- Absențe.
- Solduri.
- Aprobări.
- Calendar.
- Politici.

**Employee Documents**

- Dosare.
- Documente.
- Confirmări OTP.
- Versiuni.
- Expirări.

**Performance & Development**

- Obiective.
- Evaluări.
- Feedback.
- Evaluări 360.
- Dezvoltare profesională.

**Recruitment**

- Posturi.
- Candidați.
- Etape.
- Interviuri.
- Pagină publică de cariere.

**Training & Qualifications**

- Training.
- Calificări.
- Certificate.
- Expirări.
- Alerte.

**Employee Self-Service**

- Cereri.
- Documente.
- Aprobări.
- Date personale.
- Notificări.

**Reports & Integrations**

- Rapoarte HR.
- Pontaj.
- Concedii.
- Performanță.
- Integrări autorizate.
- Timesheets asociate proiectelor.

### Reguli

HR este produs independent.

Shifts este produs independent.

Leave Tracker și Shift Planner, în portofoliul extins de produse Ventora, nu trebuie presupuse drept componente obligatorii ale HR.

HR poate avea propriile funcții complete de concedii și evidență.

**HR deține prezența efectivă și pontajul oficial.**

Shifts deține planificarea turelor.

---

## 23. VENTORA INVENTORY

### Rol

Administrarea stocurilor, produselor și consumabilelor.

### Funcționalități confirmate

95 selectate.

### Excludere

API/Webhooks pentru integrări externe.

### Domenii

- Catalog produse.
- SKU.
- Categorii.
- Unități de măsură.
- Cantități.
- Intrări.
- Ieșiri.
- Ajustări.
- Transferuri.
- Depozite.
- Locații multiple.
- Furnizori.
- Comenzi de achiziție.
- Praguri minime.
- Alerte low-stock.
- Reaprovizionare.
- Previziuni de necesar.
- Loturi.
- Serii, unde este cazul.
- Date de expirare.
- FIFO / FEFO.
- Trasabilitate.
- Inventariere.
- Audit de stoc.
- Evaluare stoc.
- Rapoarte.
- QR și coduri de bare.
- Integrări interne cu Booking, Events, Finance, Assets, Analytics și Documents.

### Reguli

Inventory gestionează bunuri și consumabile prin cantități și mișcări de stoc.

Assets gestionează bunuri individuale identificabile.

Cele două aplicații sunt independente.

---

## 24. VENTORA SHIFTS

### Rol

Planificarea și gestionarea turelor de lucru.

### Funcționalități confirmate

87 selectate.

### Excludere

API/Webhooks pentru integrări externe.

### Domenii

- Planificarea turelor.
- Calendar de ture.
- Drag & drop.
- Schimburi între angajați.
- Ture deschise.
- Cereri de schimb.
- Disponibilitate.
- Acoperire.
- Reguli de planificare.
- Avertizări de conflict.
- Self-service pentru angajați.
- Acces mobil.
- Notificări.
- Rapoarte.
- Integrări opționale cu HR, Analytics, Booking și Events.

### Reguli

Shifts este produs independent.

Shifts deține planificarea.

HR deține prezența efectivă.

Sincronizarea este opțională și autorizată.

---

## 25. VENTORA MARKETING & CAMPAIGNS

### Rol

Crearea, lansarea și monitorizarea campaniilor de marketing.

### Funcționalități confirmate

Au fost confirmate toate funcționalitățile propuse, cu excepția API/Webhooks pentru integrări externe.

### Domenii

- Campanii.
- Audiențe.
- Segmentare.
- Mesaje.
- Email marketing.
- SMS marketing.
- Șabloane.
- Programare.
- Automatizări.
- Follow-up.
- Campanii recurente.
- Personalizare.
- KPI.
- Conversii.
- Performanță.
- Integrări interne.
- AI contextual.
- Support.
- Audit.

### Excludere

API/Webhooks pentru integrări externe.

Nu se presupune includerea unui sistem complet de administrare Meta Ads sau Google Ads.

### REGULĂ COMERCIALĂ SPECIALĂ

**Numărul de campanii disponibile depinde de abonament.**

Clienții pot cumpăra campanii suplimentare.

Sistemul trebuie să includă:

- Limită per plan.
- Afișarea consumului.
- Afișarea capacității rămase.
- Avertizare la apropierea limitei.
- Blocare controlată la depășire.
- Posibilitate de upgrade.
- Add-on-uri.
- Integrare cu Ventora Billing.
- Administrare din Founder/Superadmin.

Nu inventăm acum numărul de campanii incluse sau prețurile.

Trebuie stabilit ulterior ce reprezintă o campanie consumată și cum sunt tratate campaniile multistep.

### Reguli

Șabloanele tranzacționale și identitatea de expediere sunt controlate de Ventora.

Organizațiile pot personaliza conținutul campaniilor în limitele permise.

---

## 26. VENTORA ANALYTICS

### Rol

Sistem independent de analiză, raportare și interpretare a datelor.

### Funcționalități confirmate

110 din 110 selectate.

API/Webhooks pentru integrări externe sunt incluse.

### Domenii

- Executive Dashboard.
- Dashboarduri per aplicație.
- KPI.
- Report Builder.
- Filtre.
- Comparații.
- Grafice.
- Interpretări avansate.
- Workbooks interactive.
- Planuri de acțiune.
- AI Analytics.
- Forecasting.
- Scenarii.
- Rapoarte programate.
- Exporturi.
- Guvernanța datelor.
- Acces pe roluri.
- Integrări cu aplicațiile autorizate.

### REGULĂ COMERCIALĂ SPECIALĂ

Analytics are limite dependente de plan.

Exemple:

- Număr rapoarte.
- Număr analize AI.
- Număr workbooks.
- Număr exporturi.
- Număr rapoarte programate.
- Perioadă de istoric disponibilă.
- Acces la funcționalități avansate.

Limitele sunt configurate centralizat din Core.

### Reguli

Analytics poate analiza numai datele pentru care organizația și utilizatorul au drepturi.

Analytics nu devine proprietarul datelor operaționale.

---

## 27. VENTORA ASSETS

### Rol

Administrarea activelor și bunurilor individuale ale organizației.

### Funcționalități confirmate

96 din 96 selectate.

API/Webhooks externe sunt incluse.

### Domenii

- Registru de active.
- Identificatori unici.
- Categorii.
- Locații.
- Responsabili.
- Alocări.
- Predări și primiri.
- Confirmări OTP.
- Ciclul de viață.
- Statusuri.
- Mentenanță.
- Reparații.
- Intervenții.
- Garanții.
- Documente.
- Conformitate.
- Audit fizic.
- Verificări.
- Valoare.
- Depreciere internă.
- Rapoarte.
- Integrări cu alte aplicații.

### Reguli

Assets urmărește bunuri individuale.

Inventory urmărește stocuri și cantități.

Deprecierea internă nu reprezintă automat contabilitate fiscală oficială.

---

## 28. VENTORA PROJECTS & TASKS

### Rol

Gestionarea proiectelor, sarcinilor și colaborării.

### Funcționalități confirmate

112 selectate.

### Excludere

API/Webhooks pentru integrări externe.

### Domenii

**Projects & Portfolio**

- Registru proiecte.
- Creare și arhivare.
- Proiecte recurente.
- Șabloane.
- Statusuri.
- Priorități.
- Echipe.
- Departamente.
- Proiecte private.
- Proiecte pentru clienți.

**Tasks**

- Taskuri.
- Subtaskuri.
- Checklisturi.
- Responsabili.
- Priorități.
- Dependențe.
- Blocaje.
- Estimări.
- Recurență.
- Operațiuni în masă.

**Planning**

- Kanban.
- List.
- Calendar.
- Timeline / Gantt.
- Sprinturi.
- Backlog.
- Milestones.
- Roadmap.
- Drag & drop.

**Collaboration**

- Comentarii.
- Mențiuni.
- Fișiere.
- Notificări.
- Watchers.
- Colaboratori externi.
- Aprobări.

**Time Tracking**

- Cronometru.
- Timp manual.
- Timesheets de proiect.
- Estimat vs. efectiv.
- Workload.
- Capacitate.
- Tarife orare.
- Aprobări.

**Budgets & Progress**

- Progres.
- Bugete.
- Costuri.
- Riscuri.
- Indicatori.
- Estimări de finalizare.
- Jurnal de decizii.

**Client Collaboration**

- Proiecte per client.
- Portal de client pentru proiecte.
- Livrabile.
- Feedback.
- Aprobări.
- Fișiere partajate.

**Reports & Integrations**

- Rapoarte.
- Exporturi.
- CRM.
- Documents.
- HR.
- Assets.
- Finance.
- Analytics.
- Events.

### Reguli

Projects urmărește timpul alocat taskurilor.

HR rămâne proprietarul pontajului oficial.

Portalul de client din Projects este o interfață dedicată colaborării pe proiecte și nu trebuie confundat cu Ventora Portal B2C.

---

## 29. VENTORA FINANCE

### Rol

Sistem de evidență financiară operațională.

### Funcționalități confirmate

109 selectate.

### Excludere

API/Webhooks pentru integrări externe.

### REGULĂ FOARTE IMPORTANTĂ

**Finance NU emite facturi.**

Finance NU este:

- Program complet de contabilitate.
- Sistem SPV.
- Sistem e-Factura.
- Sistem de declarații fiscale.
- Motor de emitere a facturilor.
- Înlocuitor al contabilului.

Finance urmărește facturi deja emise sau primite.

### Domenii

**Dashboard**

- Situație financiară.
- Încasări.
- Plăți.
- Sume restante.
- Scadențe.
- Indicatori.

**Facturi emise existente**

- Registru.
- Introducere manuală.
- Import CSV/Excel.
- PDF.
- Clienți.
- Scadențe.
- Statusuri.
- Monede.
- Facturi recurente pentru urmărire.

**Facturi primite**

- Furnizori.
- Cheltuieli.
- Categorii.
- Centre de cost.
- Documente.
- Scadențe.

**Payments**

- Încasări.
- Plăți.
- Plăți parțiale.
- Avansuri.
- Refunduri.
- Diferențe de curs.
- Asocieri cu facturi.

**Reminders**

- Calendar.
- Alerte.
- Remindere interne.
- Remindere către clienți.
- Istoric.
- Oprire după achitare.

**Cash Flow**

- Estimări.
- Proiecții.
- Scenarii.
- Riscuri de lichiditate.
- Comparații.

**Budgets**

- Bugete departamentale.
- Bugete proiecte.
- Costuri.
- Praguri.
- Aprobări.

**Reports**

- Facturi.
- Restanțe.
- Încasări.
- Plăți.
- Clienți.
- Furnizori.
- Cash flow.
- Exporturi.

**Integrations**

- CRM.
- Contracts.
- Projects.
- Booking.
- Events.
- Inventory.
- Assets.
- Documents.
- Analytics.

### Reguli

Finance este separat de Ventora Billing.

Booking și Events își gestionează fluxurile operaționale de plată.

Finance poate primi înregistrări financiare prin integrări autorizate.

---

## 30. VENTORA PORTAL

### Rol

Platforma destinată consumatorilor B2C și descoperirii afacerilor.

### Funcționalități confirmate

150 selectate.

### Excludere

API/Webhooks pentru integrări externe.

### Domenii

**Consumer Accounts**

- Cont B2C.
- Profil.
- Preferințe.
- Favorite.
- Istoric.
- Confidențialitate.

**Business Discovery**

- Profiluri publice.
- Categorii.
- Căutare.
- Locații.
- Hartă.
- Recomandări.
- Badge Founding 100.
- Listări sponsorizate.

**Feed**

- Postări ale afacerilor.
- Imagini.
- Oferte.
- Like-uri.
- Comentarii.
- Salvări.
- Distribuire.
- Moderare.

**Reviews**

- Recenzii.
- Stele.
- Fotografii.
- Răspunsuri.
- Moderare.
- Recenzii verificate unde există integrare.

**Loyalty**

- Puncte.
- Recompense.
- Vouchere.
- Beneficii.
- Campanii.
- Istoric.

**VeeCoin**

- Portofel virtual.
- Sold.
- Istoric.
- Magazin de recompense.
- Spin Wheel.
- Misiuni.
- Niveluri.
- Achievements.
- Antifraudă.

**Family Accounts**

- Grup de familie.
- Membri.
- Roluri.
- Favorite comune.
- Recomandări.
- Beneficii familiale.

**Marketplace**

- Prezentarea produselor și serviciilor.
- Categorii.
- Fotografii.
- Descrieri.
- Prețuri informative.
- Oferte.
- Linkuri.
- Listări promovate.

**Booking & Events**

- Programări prin Booking.
- Evenimente prin Events.
- Bilete prin Events.
- Istoric.
- Recomandări.

**Messaging**

- Mesaje între consumatori și afaceri.
- Inbox.
- Notificări.
- Antispam.

**AI**

- Recomandări.
- Căutare conversațională.
- Personalizare.
- Controlul preferințelor.

**Business Management**

- Dashboard pentru afaceri.
- Profil.
- Postări.
- Oferte.
- Recenzii.
- Mesaje.
- Statistici.
- Locații.

**Growth**

- Referral.
- Afiliere.
- Reduceri.
- Comisioane recurente.
- Promovare.
- Planuri.
- Add-on-uri.

### REGULĂ CRITICĂ: MARKETPLACE

Marketplace-ul Portal este pentru prezentare și descoperire.

**Nu implementăm:**

- Coș de cumpărături.
- Checkout e-commerce general.
- Procesare proprie a comenzilor marketplace.
- Sistem de fulfillment.

Un utilizator poate descoperi produse și servicii și poate contacta afacerea.

### REGULĂ CRITICĂ: BOOKING ȘI EVENTS

O afacere cu abonament doar Portal nu poate utiliza funcțiile formale Booking sau Events.

Poate publica postări obișnuite despre servicii, oferte și evenimente.

Dacă are Portal + Booking, utilizatorul poate rezerva din Portal prin backendul Booking.

Dacă are Portal + Events, utilizatorul poate participa sau cumpăra bilete prin backendul Events.

Portal nu dublează logica acestor aplicații.

### REGULĂ CRITICĂ: IDENTITATE

Conturile consumatorilor B2C sunt separate de identitatea profesională B2B.

---

## 31. VENTORA NETWORK

### Rol

Rețea profesională B2B pentru afaceri.

### Funcționalități confirmate

137 din 137 selectate.

**Nu există excluderi.**

API/Webhooks pentru integrări externe sunt incluse.

### Domenii

**Business Profiles**

- Profiluri profesionale.
- Date comerciale.
- Logo.
- Galerie.
- Servicii.
- Industrii.
- Specializări.
- Locații.
- Persoane de contact.
- Verificare.
- Badge-uri.
- Vizibilitate.

**Discovery**

- Director B2B.
- Căutare.
- Filtre.
- Recomandări.
- Conexiuni.
- Follow.
- Favorite.
- Istoric.

**Professional Feed**

- Postări.
- Documente.
- Realizări.
- Reacții.
- Comentarii.
- Mențiuni.
- Distribuire.
- Moderare.

**Messaging**

- Mesagerie între organizații.
- Inbox.
- Atașamente.
- Căutare.
- Arhivare.
- Grupuri.
- Antispam.

**Opportunities**

- Oportunități B2B.
- Cereri de ofertă.
- Căutare furnizori.
- Subcontractare.
- Colaborări.
- Propuneri.
- Statusuri.
- Termene.
- Răspunsuri.
- Istoric.

**Groups**

- Comunități.
- Grupuri publice și private.
- Membri.
- Moderatori.
- Discuții.
- Fișiere.
- Notificări.

**Networking Events**

- Calendar.
- Anunțuri.
- Recomandări.
- Interes de participare.
- Integrare opțională cu Events.

**Partnerships**

- Registru.
- Categorii.
- Statusuri.
- Responsabili.
- Obiective.
- Note.
- Documente.
- Termene.
- Evaluări.
- CRM opțional.

**AI Networking**

- Recomandări parteneri.
- Recomandări oportunități.
- Recomandări grupuri.
- Recomandări evenimente.
- Căutare conversațională.

**Monetization**

- Profiluri sponsorizate.
- Promovare postări.
- Promovare oportunități.
- Pachete de vizibilitate.
- Add-on-uri.
- Limite pe abonament.

**Analytics & Integrations**

- Vizualizări.
- Conexiuni.
- Engagement.
- Oportunități.
- Parteneriate.
- Exporturi.
- CRM.
- Documents.
- Contracts.
- Events.
- Projects.
- Analytics.
- API/Webhooks.

### Reguli

Network este exclusiv B2B.

Network nu este Portal.

Network nu este CRM.

Network utilizează identitatea comună B2B din Ventora Core.

Organizațiile pot folosi Network fără Portal.

---

# PARTEA VIII. DELIMITĂRI OBLIGATORII ÎNTRE APLICAȚII

## 32. Matricea responsabilităților

| Domeniu | Proprietar | Alte aplicații |
|---|---|---|
| Programări | Booking | Portal, CRM, Analytics |
| Leaduri și pipeline | CRM | Network, Marketing, Analytics |
| Fișiere și versiuni | Documents | Contracts, HR, Projects |
| Contracte și obligații | Contracts | Documents, CRM, Finance |
| Evenimente formale | Events | Portal, Network, Booking |
| Prezență efectivă | HR | Shifts, Projects |
| Ture planificate | Shifts | HR, Booking, Events |
| Mișcări de stoc | Inventory | Assets, Finance |
| Active individuale | Assets | Inventory, Projects, Finance |
| Campanii promoționale | Marketing | CRM, Booking, Analytics |
| Analize și rapoarte | Analytics | Toate sursele autorizate |
| Proiecte și taskuri | Projects | CRM, HR, Finance |
| Evidență financiară | Finance | CRM, Contracts, Projects |
| Interacțiuni consumatori | Portal | Booking, Events |
| Relații și oportunități B2B publice | Network | CRM, Contracts, Projects |
| Abonamente Ventora | Core Billing | Toate aplicațiile |

Nicio integrare nu schimbă proprietarul datelor fără o decizie arhitecturală explicită.

---

# PARTEA IX. INTEGRĂRI, API ȘI EVENIMENTE

## 33. Două tipuri de comunicare

### API sincron

Folosit când este necesar un răspuns imediat.

Exemplu:

Portal solicită Booking să verifice disponibilitatea și să creeze o rezervare.

### Evenimente asincrone

Folosite pentru comunicarea acțiunilor deja finalizate.

Exemplu:

Booking publică un eveniment de programare finalizată.

Marketing îl poate consuma pentru un follow-up permis.

Analytics îl poate folosi pentru indicatori.

## 34. Contractele evenimentelor

Fiecare eveniment trebuie să includă:

- Event ID.
- Event type.
- Schema version.
- Timestamp.
- Organization ID.
- Source application.
- Resource ID.
- Correlation ID.
- Payload validat.

Reguli:

- Evenimente versionate.
- Consumatori idempotenti.
- Transactional outbox.
- Retry controlat.
- Tratarea mesajelor eșuate.
- Audit.
- Observabilitate.
- Izolarea organizațiilor.
- Verificarea accesului la integrare.

## 35. API extern vs. API intern

**API intern:** mecanismul prin care aplicațiile Ventora comunică între ele.

**API extern:** interfață publică sau comercială pentru integrări ale clienților cu sisteme terțe.

Nu sunt același lucru.

API-urile interne sunt necesare arhitecturii ecosistemului.

API-urile externe trebuie implementate numai acolo unde au fost confirmate.

### API/Webhooks externe confirmate

- CRM.
- Analytics.
- Assets.
- Network.

### API/Webhooks externe excluse explicit

- Contracts.
- Inventory.
- Shifts.
- Marketing.
- Projects & Tasks.
- Finance.
- Portal.

Pentru celelalte aplicații trebuie respectate selecțiile din checklisturile originale, fără presupuneri.

---

# PARTEA X. NOTIFICĂRI, AUTOMATIZĂRI, AI ȘI SUPORT

## 36. Notificări

Core furnizează infrastructura comună.

Aplicațiile definesc evenimentele care generează notificări.

Exemple:

- Programare nouă.
- Contract aproape de expirare.
- Task întârziat.
- Factură restantă.
- Concediu aprobat.
- Stoc sub prag.
- Mesaj nou.

Trebuie să existe:

- Șabloane versionate.
- Categorii.
- Preferințe.
- Canale.
- Istoric.
- Deduplicare.
- Rate limiting.
- Retry.
- Localizare în șase limbi.
- Audit.

Organizațiile pot configura doar opțiunile permise.

## 37. Automatizări

Automatizările sunt definite și întreținute de Ventora.

Clienții pot:

- Activa.
- Dezactiva.
- Configura parametrii permiși.
- Consulta istoricul.

Nu construim implicit un workflow builder arbitrar în care clienții pot modifica orice proces intern.

## 38. AI Assistant

AI Assistant este disponibil contextual în aplicații.

Nu trebuie să devină automat o a șaisprezecea aplicație.

Reguli:

- Respectă organizația activă.
- Respectă permisiunile.
- Respectă entitlements.
- Respectă limitele de utilizare.
- Nu accesează date neautorizate.
- Nu execută acțiuni sensibile fără autorizare corespunzătoare.
- Este monitorizat și auditat unde este necesar.

## 39. Support / My Tickets

Sistem comun de suport, disponibil contextual în toate aplicațiile.

Un tichet poate conține:

- Organizație.
- Utilizator.
- Aplicație.
- Categorie.
- Prioritate.
- Status.
- Descriere.
- Atașamente.
- Istoric.
- Responsabil.
- Mesaje.

Nu construim câte un sistem separat de suport pentru fiecare aplicație.

---

# PARTEA XI. SECURITATE ȘI MULTI-TENANCY

## 40. Izolarea datelor

Fiecare operațiune B2B trebuie să fie executată în contextul unei organizații autorizate.

Este interzis ca simpla modificare a unui `organizationId` în request să ofere acces la altă organizație.

Trebuie implementate:

- Verificări server-side.
- Politici de acces.
- Validarea membershipului.
- Validarea entitlementului.
- Validarea drepturilor asupra resursei.
- Audit.
- Teste cross-tenant.

## 41. Founder Access

Founder / Superadmin poate administra platforma.

Dar accesul la datele private ale clienților trebuie să fie controlat.

Recomandări:

- Privilegii separate pentru administrare comercială și acces la date.
- Acces de suport justificat.
- Acces temporar unde este cazul.
- Audit pentru acțiuni sensibile.
- Principiul privilegiului minim.

## 42. Protecția datelor

Arhitectura trebuie să permită:

- Retenție configurabilă.
- Export.
- Ștergere conform obligațiilor aplicabile.
- Gestionarea consimțămintelor.
- Separarea datelor.
- Criptare.
- Backup.
- Recuperare.
- Jurnale de securitate.
- Gestionarea incidentelor.

Nu presupunem că simpla existență a acestor funcții înseamnă conformitate juridică automată.

---

# PARTEA XII. VENTORA BILLING

## 43. Separarea Billing de Finance

Ventora Billing este un serviciu Core.

El gestionează:

- Abonamentele clienților Ventora.
- Planurile.
- Facturarea comercială a serviciilor Ventora, prin sistemele compatibile alese.
- Plățile pentru abonamente.
- Add-on-urile.
- Trialurile.
- Upgrade-urile.
- Downgrade-urile.
- Starea comercială.
- Entitlements.

Ventora Finance este aplicația cumpărată de organizații pentru evidența financiară proprie.

Acestea trebuie să rămână separate.

---

# PARTEA XIII. UX ȘI EXPERIENȚA UTILIZATORULUI

## 44. Experiență premium

Ventora trebuie să aibă o experiență vizuală coerentă și profesionistă.

Cerințe:

- Navigație clară.
- Layout responsiv.
- Dashboarduri utile.
- Empty states.
- Loading states.
- Error states.
- Confirmări pentru acțiuni sensibile.
- Tabele performante.
- Filtre.
- Căutare.
- Accesibilitate.
- Feedback vizual.
- Dark/Light.
- Șase limbi (RO, EN, FR, ES, DE, IT).

## 45. Iconuri custom

Fiecare aplicație trebuie să aibă icon propriu.

Nu dorim folosirea exclusivă a unor iconuri generice pentru identitatea principală a produselor.

Iconurile trebuie să fie coerente ca sistem vizual, dar distincte semantic.

Acestea pot fi proiectate separat în etapa de design.

## 46. Navigarea între aplicații

Utilizatorul trebuie să poată:

- Reveni în Hub.
- Schimba aplicația.
- Schimba organizația.
- Accesa setările.
- Schimba tema.
- Schimba limba.
- Accesa suportul.

Fără autentificări repetate inutile.

---

# PARTEA XIV. MIGRAREA SISTEMULUI EXISTENT

## 47. Context tehnic cunoscut

Ventora Hub are deja o implementare existentă.

Stackul folosit anterior include:

- Next.js App Router.
- TypeScript.
- Prisma.
- PostgreSQL.
- Supabase.
- Vercel.
- Resend.
- SMSLink.

Există sau au existat domenii funcționale precum:

- Users.
- Owners.
- Organizations.
- Clients.
- Services.
- Appointments.
- Invoices.
- Payments.
- Projects.
- Tasks.
- Tickets.
- Documents.
- Templates.
- Custom Fields.
- Activity Logs.
- Time Entries.
- Attendance.
- Availability Rules.
- CRM.
- Billing.
- Reports.
- Workflows.

Există și un proiect mobil Expo pentru zona Owner.

**Aceste informații reprezintă context istoric, nu rezultatul unui audit actual.**

Claude nu trebuie să presupună că toate componentele sunt complete, corecte sau funcționale.

## 48. Obiectivul auditului

Auditul trebuie să determine:

1. Ce funcționalități există.
2. Ce funcționalități sunt complete.
3. Ce funcționalități sunt parțiale.
4. Ce date există.
5. Ce dependențe există.
6. Ce este hardcodat.
7. Ce probleme de securitate există.
8. Ce poate fi păstrat.
9. Ce trebuie refactorizat.
10. Ce trebuie extras în aplicații independente.
11. Ce trebuie înlocuit.
12. Cum migrăm fără pierderi.

## 49. Clasificarea rezultatelor

**KEEP**

Funcționalitatea poate fi păstrată.

**REFACTOR**

Funcționalitatea trebuie adaptată.

**EXTRACT**

Funcționalitatea trebuie mutată într-un domeniu sau produs independent.

**REPLACE**

Implementarea trebuie înlocuită, cu plan de migrare.

## 50. Reguli de migrare

- Nu ștergem date existente fără plan.
- Nu rescriem identificatori fără mapare.
- Nu schimbăm simultan toate sistemele fără etapizare.
- Nu rupem fluxurile existente fără alternativă.
- Folosim migrații reversibile unde este posibil.
- Verificăm integritatea datelor.
- Păstrăm auditul și istoricul relevant.
- Construim teste de regresie.
- Pregătim rollback.
- Documentăm incompatibilitățile.

---

# PARTEA XV. ORDINEA DE IMPLEMENTARE

## 51. Etapa 1: Core Foundation

Înainte de construirea completă a aplicațiilor trebuie stabilite:

- Identitatea B2B.
- Identitatea B2C.
- Organizațiile.
- Memberships.
- RBAC.
- Entitlements.
- Quotas.
- Billing.
- App Registry.
- Design System.
- Theme Engine.
- i18n.
- Contractele de integrare.
- Audit.
- Observabilitate.

## 52. Etapa 2: Hub

- Login.
- Selectare organizație.
- Launcher.
- Carduri de aplicații.
- Permisiuni.
- Setări.
- Limbă.
- Temă.
- Suport.
- Administrare organizație.

## 53. Etapa 3: Aplicația pilot

Recomandarea de planificare este ca Booking să fie primul candidat pentru validarea fundației, având în vedere piața inițială a afacerilor cu programări.

Aceasta nu reprezintă încă o decizie definitivă de implementare.

Ordinea finală trebuie stabilită după audit, estimarea efortului și prioritățile comerciale.

## 54. Etapa 4: Aplicații suplimentare

Aplicațiile sunt construite pe fundația comună.

Fiecare aplicație trebuie să respecte contractele tehnice.

Nu recreăm autentificarea, billingul, temele, traducerile sau permisiunile.

## 55. Etapa 5: Integrări

Integrările se activează controlat.

Fiecare integrare are:

- Contract.
- Permisiuni.
- Entitlements.
- Versionare.
- Observabilitate.
- Tratarea erorilor.
- Teste.
- Documentație.

---

# PARTEA XVI. CRITERII OBLIGATORII DE ACCEPTARE

## 56. O aplicație Ventora este acceptată doar dacă:

- Funcționează independent.
- Folosește identitatea corectă.
- Respectă organizația activă.
- Verifică permisiunile în backend.
- Respectă abonamentul.
- Respectă limitele comerciale.
- Utilizează API-uri interne standardizate.
- Nu accesează direct datele altei aplicații.
- Are Light Mode.
- Are Dark Mode.
- Respectă System Theme.
- Are traduceri RO.
- Are traduceri EN.
- Are traduceri FR.
- Are traduceri ES.
- Are traduceri DE.
- Păstrează preferințele utilizatorului.
- Include auditul necesar.
- Include suport contextual.
- Respectă securitatea multi-tenant.
- Are teste.
- Are documentație.
- Are mecanisme de observabilitate.
- Nu introduce dependențe comerciale ascunse.

---

# PARTEA XVII. DECIZII CONFIRMATE VS. PROPUNERI TEHNICE

## 57. Decizii confirmate de fondatori

Acestea nu trebuie schimbate unilateral:

1. Ecosistemul conține 15 aplicații funcționale definite.
2. Aplicațiile sunt independente.
3. Hub este launcherul comun B2B.
4. Core este fundația comună.
5. Utilizatorii B2B au identitate comună.
6. Consumatorii Portal au identitate separată.
7. Organizațiile au abonamente și permisiuni distincte.
8. Integrările sunt opționale.
9. Founder/Superadmin administrează planurile și limitele.
10. Restricțiile comerciale nu sunt hardcodate.
11. Dark/Light Mode este obligatoriu din prima zi.
12. RO/EN/FR/ES/DE este obligatoriu din prima zi.
13. AI Assistant este contextual.
14. Support este transversal.
15. Automatizările sunt predefinite de Ventora.
16. Finance nu emite facturi.
17. Portal Marketplace nu are checkout general.
18. Booking deține programările.
19. Events deține evenimentele formale.
20. Network este B2B.
21. Portal este orientat B2C.
22. HR și Shifts sunt independente.
23. Inventory și Assets sunt independente.
24. Documents și Contracts sunt independente.
25. Billing Ventora este separat de Finance.
26. Nu pierdem funcționalitățile existente fără analiză și migrare.
27. Respectăm toate funcționalitățile selectate și excluderile din checklisturi.

## 58. Propuneri tehnice care necesită validare

Următoarele sunt direcții recomandate, nu implementări deja aprobate în cod:

- UUIDv7.
- Model RBAC + politici contextuale.
- Transactional outbox.
- Contracte API versionate.
- Event-driven integration.
- Separare fizică graduală.
- Strategia de monorepo sau multiple repository-uri.
- Strategia exactă de autentificare.
- Structura finală a bazelor de date.
- Tehnologia pentru mesagerie asincronă.
- Implementarea design system-ului.
- Frameworkul i18n.
- Strategia de deployment.
- Ordinea finală a aplicațiilor.

Claude trebuie să le evalueze în raport cu repository-ul real și cu cerințele produsului.

---

# PARTEA XVIII. INSTRUCȚIUNI EXPLICITE PENTRU CLAUDE

## 59. Cum trebuie să abordezi acest proiect

Claude, acest document reprezintă contextul de produs și arhitectură pentru Ventora.

Nu îl trata ca pe o solicitare de a începe imediat să scrii cod.

Mai întâi trebuie să înțelegi:

- Ce este Ventora.
- Cum sunt împărțite aplicațiile.
- Care sunt responsabilitățile lor.
- Ce funcționalități au fost confirmate.
- Ce funcționalități au fost excluse.
- Ce reguli globale sunt obligatorii.
- Ce trebuie să rămână independent.
- Ce trebuie să fie centralizat.
- Ce trebuie verificat în codul existent.

### Nu face următoarele lucruri

1. Nu transforma cele 15 aplicații într-un monolit.
2. Nu crea sisteme separate de autentificare B2B pentru fiecare aplicație.
3. Nu dubla logica Booking în Portal.
4. Nu dubla logica Events în Network.
5. Nu confunda CRM cu Network.
6. Nu confunda Finance cu Billing.
7. Nu transforma Inventory în Assets.
8. Nu transforma Shifts într-o parte obligatorie a HR.
9. Nu presupune că toate aplicațiile trebuie cumpărate împreună.
10. Nu hardcoda limite comerciale.
11. Nu amâna Dark Mode.
12. Nu amâna traducerile.
13. Nu introduce API-uri externe comerciale acolo unde au fost excluse.
14. Nu inventa funcționalități noi fără aprobare.
15. Nu elimina funcționalități confirmate pentru simplificare fără să semnalezi explicit consecințele.
16. Nu presupune că repository-ul actual a fost auditat.
17. Nu propune ștergerea sau rescrierea datelor fără strategie de migrare.
18. Nu confunda o recomandare tehnică cu o decizie deja confirmată.
19. Nu implementa mecanisme de acces doar în frontend.
20. Nu crea dependențe ascunse între produse.

## 60. Ce așteptăm de la tine în prima etapă

Înainte de implementare, livrează o analiză structurată care să includă:

### A. Arhitectura tehnică propusă

- Core.
- Hub.
- Cele 15 aplicații.
- Servicii transversale.
- Contracte de integrare.
- Baze de date.
- Deployment.
- Observabilitate.

### B. Modelul canonic de date

- Entități.
- Relații.
- Identificatori.
- Constrângeri.
- Reguli de proprietate.
- Izolare multi-tenant.

### C. Identity & Access

- Autentificare.
- Organizații.
- Memberships.
- Roluri.
- Permisiuni.
- Entitlements.
- Resource policies.

### D. Commercial Control Center

- Planuri.
- Versiuni.
- Quotas.
- Usage.
- Add-ons.
- Overrides.
- Founder administration.

### E. Design & Localization

- Design tokens.
- Theme architecture.
- Light/Dark/System.
- i18n.
- RO/EN/FR/ES/DE.
- Persistența preferințelor.

### F. Integration Contracts

- API.
- Evenimente.
- Versionare.
- Autorizare.
- Retry.
- Idempotency.
- Audit.

### G. Repository Audit Plan

- Ce trebuie inspectat.
- În ce ordine.
- Cum se clasifică implementările existente.
- Cum se păstrează datele.
- Cum se pregătește migrarea.

### H. Implementation Roadmap

- Faze.
- Dependențe.
- Priorități.
- Riscuri.
- Criterii de acceptare.
- Puncte de decizie.

## 61. Formatul răspunsului tău

Vreau un răspuns tehnic riguros, nu un rezumat superficial.

Pentru fiecare decizie importantă:

1. Explică problema.
2. Prezintă soluția propusă.
3. Explică de ce este potrivită.
4. Arată ce compromisuri implică.
5. Precizează ce depinde de audit.
6. Indică riscurile.
7. Definește criterii verificabile de acceptare.

Dacă descoperi contradicții sau ambiguități, semnalează-le înainte să scrii cod.

Dacă există mai multe variante tehnice, compară-le.

Nu presupune automat că cea mai complexă arhitectură este și cea mai bună.

Scopul nostru nu este să construim infrastructură spectaculoasă pentru propria satisfacție.

Scopul este să construim un ecosistem comercial solid, scalabil, simplu de operat și suficient de flexibil încât să nu trebuiască refăcut de fiecare dată când lansăm o aplicație nouă.

---

# CONCLUZIE

Ventora trebuie să funcționeze ca un ecosistem unificat pentru utilizator și ca un set de produse independente pentru dezvoltare și operare.

**Ventora Core** controlează identitatea, organizațiile, accesul și modelul comercial.

**Ventora Hub** oferă intrarea comună în ecosistem.

**Cele 15 aplicații** oferă funcționalități specializate și își dețin propriile date.

**Integrările** permit colaborarea dintre aplicații fără dependențe obligatorii.

**Founder / Superadmin** controlează comercial întregul ecosistem.

**Dark/Light Mode și RO/EN/FR/ES/DE** sunt standarde obligatorii încă din prima zi.

**Securitatea, izolarea datelor și autorizarea** sunt responsabilități fundamentale, nu îmbunătățiri ulterioare.

**Auditul repository-ului existent** trebuie efectuat înainte de deciziile definitive privind refactorizarea, extragerea și migrarea codului.

Acesta este cadrul de referință pentru proiectarea și dezvoltarea Ventora.

**Prima ta sarcină este să validezi arhitectura conceptuală, să identifici orice neclaritate critică și să propui planul de audit al repository-ului. Nu începe implementarea până când direcția tehnică și planul de migrare nu sunt aprobate.**
