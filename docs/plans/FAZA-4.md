# FAZA 4 — Servicii de platformă

**Status:** APROBAT (fondatoarea, 30.10.2026).
**Referințe:** `ARCHITECTURE.md` v0.4.6 din `main` și v0.4.7 de pe `feat/faza-2-ecrane` (PR #24: §15.1 „Obligații lăsate de F2 pentru F4”). Plus §4, §11.2–11.6, §12.3–12.4, §13.2 (T6), §15, §17.1. Apoi `docs/plans/FAZA-3.md` (PR #25), `SMS_NUMAR_PROPRIU.md`, `GROWTH_ENGINE.md`, `VENTORA_MASTER_BRIEF.md` (§33–39) și `docs/design/system`.
**Depinde de:** Faza 2 închisă, inclusiv Lotul 2.8 (shell-ul Hub și Founder, HubAdminTeam; definit în FAZA-3.md).
**Merge în paralel cu:** Faza 3 (ARCHITECTURE §15.2: „F3 și F4 merg în paralel după F2”).
**Acceptare globală (ARCHITECTURE §15.1):** T6 verde; notificarea ajunge în limba destinatarului; o solicitare de suport se poate trimite din orice aplicație.

---

## 0. Rezumat

Faza 4 construiește serviciile pe care se sprijină toate aplicațiile. La final:

- o schimbare de date și evenimentul ei se scriu împreună (outbox). Evenimentul ajunge la destinatari o singură dată, chiar dacă se reîncearcă. Ce eșuează de 3 ori ajunge într-o listă vizibilă;
- există un serviciu de job-uri care rulează lucrurile programate: livrarea evenimentelor, reconcilierea cotelor și job-urile cerute de Faza 3;
- notificările ajung în clopoțelul din Hub și pe e-mail, în limba fiecărei persoane (6 limbi), cu preferințe per persoană. Prima notificare reală: „{name} a cerut o invitație nouă pentru {businessName}.”;
- afacerile trimit solicitări de suport din orice aplicație și primesc răspunsul;
- fișierele (de exemplu, atașamentele la suport) se încarcă și se descarcă prin linkuri semnate, cu expirare;
- infrastructura pentru AI (modele, contorizare, limite de cost), generarea de PDF și motorul de automatizări (workflow engine) intră în fază după ARCHITECTURE. Vezi §1 și D4-25.

---

## 1. Ce NU intră în Faza 4

- **Asistentul AI cu interfață** (D-AI-5): vine după F4; faza lui e NECESITĂ DECIZIE. F4 construiește doar infrastructura AI (D-AI-6).
- **Asistentul AI pentru consumatori** (D-AI-7): e produs separat, în faza Portalului.
- **E-mailul comercial**: rămâne dezactivat până la validarea juridică și consimțământ (D-GRW-8). Canalul există în model, dar e blocat central.
- **Growth Engine**: vine în Faza 5. F4 îi dă doar categoria `commercial`, preferințele comerciale și evenimentele marcate `growthSafe`.
- **Adaptoarele SMS** (`SMS_PROVIDER`, `ANDROID_SIM`) și `core/messaging`: implementarea vine după E-SMS-1 (ARCHITECTURE §4). F4 pregătește doar canalul SMS ca interfață în `core/notifications`. Vezi D4-26.
- **Notificările push pe telefon**: canalul se poate adăuga mai târziu (§3.2), fără schimbarea modelului.
- **API-ul extern** (chei pe organizație, webhooks HMAC către clienți, §11.4): vine odată cu CRM / Analytics / Assets / Network.
- **Logica comercială** (planuri, cote, Stripe, SmartBill): ține de Faza 3. F4 îi oferă șabloanele, job-urile și dispecerul (§3.12).
- **Conținutul și versiunile documentelor**: țin de aplicația Documents. F4 face doar stocarea, linkurile semnate și politicile de acces (ARCHITECTURE §4, rândul `files`).

---

## 2. Ce există deja și ce lipsește

Verificat în cod pe `origin/main` (`a389927`) și pe `origin/feat/faza-2-ecrane` (`bdac178`, PR #24). Codul relevant pentru F4 e identic pe cele două ref-uri, cu excepțiile marcate.

### 2.1 Cod

| Zonă | Ce există | Ce lipsește pentru F4 |
|---|---|---|
| **Outbox** (`packages/db-kit`) | `writeOutboxEvent(tx, schema, {id, eventType, payload})` (`src/outbox.ts:17`) și `processOutboxEvents(client, schema, handler, batchSize=10)` (`src/outbox-dispatcher.ts:33`), cu 6 teste unitare pe un client simulat. Forma tabelului există doar în șablonul `docs/guides/templates/module-migration-init.sql.template`. | Nicio migrație nu creează `outbox_events`, iar niciun pachet nu depinde de `@ventora/db-kit`. Lipsesc plicul complet din §11.2 (`organizationId`, `version`, `correlationId`, `sourceApp`, `resourceId`), dead-letter-ul după 3 eșecuri (D-INF-4: fără coloană de stare, iar dispecerul reîncearcă la nesfârșit) și `processed_events` pe consumator. Blocarea `FOR UPDATE SKIP LOCKED` rulează fără tranzacție, deci se eliberează imediat. Contextul de tenant în dispecer lipsește (§12.3). |
| **Job-uri** | `core/identity/src/background.ts` trimite e-mailul de resetare după răspuns, cu `after()` din Next. Nu e un sistem de job-uri. | Inngest (sau alt serviciu), ruta `serve`, variabilele de mediu, job-urile periodice, pasul din CI. În cod apare doar în comentarii (`outbox-dispatcher.ts:27`, `core/quota/src/reconcile.ts:5`). |
| **`core/quota`** | `reconcileExpiredReservations` (nefolosit). | Apelul periodic. Tabelele reale le construiește F3 (Lotul 3.3). |
| **`core/notifications`** | Canalul e-mail: Resend, Log, Capture, Unconfigured (`makeEmailChannel`, `deliverEmail`), plus șablonul unic `renderOperationalEmail`. Șabloanele: resetarea parolei, parola schimbată, invitația membrului, invitația owner-ului, recuperarea owner-ului, sesiunea de suport (E-6). Textele e-mailurilor sunt în cele 6 limbi (cheia `email`), cu teste: 11 + 23 + 4 × 6 limbi. | Notificările în aplicație (tabel, inbox, „marchează citite”), preferințele stocate, catalogul de șabloane versionate, deduplicarea, limitarea ratei, livrarea prin outbox cu reîncercare (azi e-mailurile pleacă direct, în cerere), canalul SMS ca interfață, namespace-ul i18n pentru notificările din aplicație. `core/notifications` nu are schemă Prisma. |
| **Categoriile** | Tipul `NotificationCategory = 'operational' \| 'commercial'` (`packages/contracts/src/notifications.ts:12`); tipul `CommercialPreferences` (fără stocare). | Categoria obligatorie la trimitere. Componenta UI folosește alt set: `'operational' \| 'activity'` (`packages/ui/src/NotificationsPanel/NotificationsPanel.tsx:29`). Vezi C-F4-1. |
| **Clopoțelul** | `NotificationsPanel` (F1, în `enforced`) cu `countCategory`. Pe `feat/faza-2-ecrane`, `FounderShell.tsx:120` îl folosește cu o listă mereu goală. | Hub nu are încă shell (vine în Lotul 2.8) și nicio sursă reală de date. |
| **`invitation.new_link_requested`** | Doar pe `feat/faza-2-ecrane`: rândul de audit (`core/organizations/src/contract.ts:476-495`), coloana `new_link_requested_at`, `listInvitations` (`:731`), `resendInvitation` care șterge marcajul (`:836`). | Notificarea către owner și admini (obligația din ARCHITECTURE v0.4.7 §15.1). |
| **Suport** | Sesiunea de suport Founder (accesul echipei Ventora la datele unei afaceri, Lotul 2.5c) și recuperarea owner-ului. | Solicitările de suport (tichetele): model, tabele, contracte, ecrane. Azi există doar `ticket_ref`, un text liber pe `support_session`. |
| **Fișiere** | Componenta `FileUpload` (F1), folosită doar în `/design`. | Stocarea, tabelul de fișiere, linkurile semnate de încărcare și descărcare, variabilele de mediu. |
| **`packages/pdf`** | — | Nu există. |
| **AI** | — | Nimic: niciun SDK, configurare de modele, contorizare sau limită de cost. |
| **Workflow engine** | — | Nimic. |
| **`core/messaging`** | — | Nu există. |
| **i18n** | 6 limbi, `i18n:check` (`packages/i18n/scripts/check.mjs`). | `i18n:check` nu rulează în CI. Lipsesc namespace-urile pentru notificări, suport, fișiere. |
| **Observabilitate** | Sentry configurat în cele 3 aplicații. | Niciun `captureException`; nicio monitorizare a job-urilor. |

### 2.2 Design aprobat (`docs/design/system/components/`)

| Ecran / componentă | Ce arată | Folosit în |
|---|---|---|
| `NotificationsPanel` (v1.1.0, în `enforced`) | Clopoțelul din ContextBar și panoul: „Toate / Necitite”, „Marchează toate ca citite”, setări. Când există notificări operaționale, lista se împarte în „Despre cont și funcționare” și „Activitate”; recomandările stau la final. Starea goală: „Nu ai notificări noi — Îți spunem aici când ceva are nevoie de tine.” | 4.4 |
| `HubRecommendation` | „Clopoțelul numără doar notificările operaționale.” Recomandările stau în secțiunea lor. | 4.4 (regula numărării) |
| `HubAccount` → Notificări | „Alege pe unde vrei să afli de fiecare.”: o grilă cu coloanele „În aplicație”, „E-mail”, „SMS” × 4 rânduri; pe telefon, comutatoare. E-mailurile de securitate nu se pot opri. | 4.4 |
| `CommercialPreferences` | „Recomandări Ventora”: „În aplicație” (pornit) și „Pe e-mail” (blocat, „Disponibil în curând”). „Mesajele despre limitele contului tău rămân active…” | 4.4 |
| `BookingSmsNotifications` | Șablonul e-mail operațional unic (S3), regulile de deduplicare și limitare pentru alertele SMS, destinatarii (owner, admin, managerul EasyBook, S44) și owner-ul care nu poate opri e-mailul. „The in-app notifications can't be turned off.” | 4.3 (regulile), Booking |
| `HubSupport` | „Solicitările mele” (Subiect, Aplicație, Actualizat, Stare: „Răspuns nou” / „În lucru” / „Rezolvat”) și „Solicitare nouă”. Câmpurile formularului: Aplicația (precompletată), Subiect, Ce s-a întâmplat?, Cât de urgent e? (Normal / Mă blochează), Atașamente (PNG, JPG sau PDF, 10 MB). „Îți răspundem în cel mult o zi lucrătoare.” | 4.6 |
| `HubStates` (suport) | Trimisă: „Am primit mesajul. Îți răspundem aici și pe e-mail, în cel mult o zi lucrătoare.” Fără solicitări: „Nu ai nicio solicitare…” | 4.6 |
| `AccountMenu` | `onSupport`: suportul se deschide din orice aplicație. | 4.6 |
| `FileUpload` (în `enforced`) | Zona de încărcare, lista fișierelor cu progres / reușită / eroare, „Maximum 10 MB per fișier”. „Încărcarea o face cine folosește componenta.” | 4.6, 4.7 |

**Lipsesc din design** (de cerut la Design înainte de lotul indicat):

1. **Suport:**
   - pagina unei solicitări: firul de mesaje, răspunsul cu atașamente, istoricul stării, redeschiderea (4.6);
   - inbox-ul de suport în Founder; Spine-ul Founder nu are o intrare „Suport” (`patterns.md:146`) (4.6, D4-14);
   - e-mailul „Ai un răspuns nou la solicitarea ta” (4.6).
2. **Notificări:**
   - pagina de istoric (brief §36: „Istoric”), dacă se decide (D4-11);
   - matricea finală a preferințelor, fiindcă cele două designuri se contrazic (C-F4-2, D4-6);
   - textele notificărilor cerute de Faza 3: factura emisă, plata eșuată, limita la 80% / 100%, anunțul de 30 de zile, finalul perioadei de probă (4.5, D4-12).
3. **Workflow engine:** constructorul din Founder (pornire, oprire, jurnalul execuțiilor, D-WF-2) și lista doar pentru citire din Hub (D-WF-3) (4.10, D4-23).
4. **AI:** ecranele Founder pentru modele, contorizare și limite de cost (4.9).
5. **Fișiere:** previzualizarea și descărcarea; un PDF generat nu are design de șablon (4.7, 4.8).
6. **i18n:** cheile pentru notificări și suport există doar în preview-uri (`docs/design/system/i18n/` nu le are). Trebuie exportate ca la `founder-support.json`.

---

## 3. Loturile

Estimările sunt în ore de agent: implementare, teste, pre-push complet și raport, fără așteptarea CI. Ele se recalibrează după primul lot.

### Lot 4.1 — Outbox și evenimente (T6)

**Scop:** outbox-ul din ARCHITECTURE §11.2 și D-INF-4, gata de folosit de orice modul, inclusiv de Faza 3.

**Ce intră:**

- **`packages/db-kit`:**
  - plicul complet: `eventId` (UUIDv7), `type`, `version`, `occurredAt`, `organizationId`, `sourceApp`, `resourceId`, `correlationId`, `payload` validat cu Zod;
  - dead-letter după 3 eșecuri: stare, `last_error`, `failed_at`; mesajul eșuat nu mai e reluat automat;
  - blocarea într-o tranzacție;
  - `processed_events` pe consumator, pentru idempotență (D4-1, DECIS: a).
- **Migrarea-șablon:** un `outbox_events` și un `processed_events` pentru fiecare schemă care emite, cu RLS și cu rolul modulului.
- **Primul emițător real:** `core/organizations`, cu `invitation.new_link_requested` scris în aceeași tranzacție cu marcajul.
- **Catalogul evenimentelor** (`packages/contracts`): nume, versiune, schemă Zod, `growthSafe` (pentru Growth, F5) și comportamentul fără destinatar.
- **Unde stă codul** (D4-2, DECIS: a): helperii (plicul, scrierea în tranzacție, `processed_events`) în `packages/db-kit`, care rămâne fără concepte de business; dispecerul și registrul de job-uri în `core/integrations`.
- **Dispecerul:** setează contextul de tenant din plic, în fiecare tranzacție (§12.3), și nu folosește `withSystemContext` în codul de request.
- Lista dead-letter, citibilă din Founder; ecranul vine mai târziu (lipsește din design).

**Dependențe:** F2. Codul din `feat/faza-2-ecrane` în `main` (marcajul invitației).
**Migrări probabile:** `outbox_init` în `organizations` (apoi câte una în fiecare schemă care emite).
**Ecrane:** —
**Gata când (T6, §13.2):**

- același eveniment livrat de două ori → efect unic, pentru fiecare consumator;
- un consumator care eșuează de 3 ori → dead-letter, fără alte reîncercări;
- un eveniment al organizației A nu e procesat în contextul organizației B (test RLS);
- schimbarea de date și evenimentul se scriu împreună: o tranzacție anulată nu lasă eveniment (test).

**Estimare:** 16–22 de ore.

---

### Lot 4.2 — Serviciul de job-uri

**Scop:** un singur loc unde rulează tot ce e programat sau asincron (§11.3).

**Ce intră:**

- Serviciul ales la D4-3 (propunerea din ARCHITECTURE: Inngest), cu clientul, ruta `apps/platform/app/api/inngest/route.ts` și variabilele `INNGEST_EVENT_KEY` și `INNGEST_SIGNING_KEY`, doar în `.env.local` și Vercel.
- **Job-urile platformei:**
  - dispecerul outbox (periodic, D-INF-4);
  - reconcilierea rezervărilor expirate de cote (funcția vine din F3, Lotul 3.3);
  - reîncercarea e-mailurilor eșuate (4.3).
- **Registrul de job-uri:** fiecare lot sau fază își înregistrează job-urile fără să atingă ruta comună. **Job-urile cerute de F3** (reînnoirea abonamentului, finalul perioadei de probă, reîncercarea facturilor SmartBill, anunțul de 30 de zile) le scrie F3, în folderele ei, și le înregistrează aici.
- **Observabilitatea:** eroarea unui job ajunge în Sentry, cu `correlationId` și `organizationId`. Starea job-urilor se urmărește din panoul serviciului de job-uri (§14).
- **Local:** serverul de dezvoltare al serviciului (pentru Inngest, CLI-ul de dezvoltare), fără cont și fără URL public.
- **Pachetul nou** (`inngest`): **cere acordul fondatoarei** (regula 3, D4-4).

**Dependențe:** 4.1. D4-3, D4-4. Pentru rularea pe un URL public: proiectul Vercel (D3-18 / D4-5).
**Migrări probabile:** —
**Ecrane:** —
**Gata când:**

- dispecerul rulează periodic local și livrează un eveniment scris de 4.1;
- reconcilierea cotelor rulează periodic (după ce F3 livrează funcția pe tabelele reale);
- un job care aruncă eroare apare în Sentry și e reîncercat după regula serviciului;
- un job înregistrat de alt lot rulează fără modificări în ruta comună.

**Estimare:** 12–16 ore.

---

### Lot 4.3 — Notificări: modelul și livrarea

**Scop:** `core/notifications` devine serviciul din ARCHITECTURE §4 și brief §36: „Șabloane versionate. Categorii. Preferințe. Canale. Istoric. Deduplicare. Rate limiting. Retry. Localizare în șase limbi. Audit.”

**Ce intră:**

- **Schema `notifications`** (rolul `notifications_rw`, RLS):
  - `notification`: în aplicație, câte una pe destinatar; categoria obligatorie, citită / necitită, legătura spre acțiune;
  - `notification_preference`: pe persoană, categorie și canal;
  - `delivery`: e-mail și, mai târziu, SMS sau push, cu stare, reîncercări și motiv;
  - cheia de deduplicare.
- **Contractul `send`:** categorie (`operational` / `commercial`, obligatorie), tipul notificării (cheie de șablon cu versiune), destinatarii (persoane sau roluri ale unei organizații, de ex. owner + admin), cheia de idempotență, `validUntil`.
  - Trimiterea trece prin outbox. Nimic nu pleacă direct dintr-o cerere (`SMS_NUMAR_PROPRIU.md` §3.1). Excepțiile sunt la D4-9.
- **Destinatarii pe rol:** rezolvați la trimitere, din `core/organizations` și `core/access`, prin contract.
- **Limba:** a destinatarului, din preferințele lui (`UserPreference`), cu cataloagele din `packages/i18n` și namespace-ul nou `notifications` în 6 limbi (D-I18N-1). Excepție: conținutul comercial, fără fallback (P20).
- **Canalele:** `in_app`, `email` (adaptorul Resend existent) și `sms` (doar interfața `SmsChannel`, cu un adaptor „neconfigurat”; vezi D4-26).
  - **Un canal nou fără schimbarea modelului (D4-7):** canalul e o valoare în `delivery` și în preferințe, iar adaptorul se înregistrează separat. Mai târziu se adaugă SMS și WhatsApp către echipă, ca funcționalitate plătită (cheie de funcționalitate + cotă pe mesaje), fără migrare a modelului.
- **Regulile:**
  - deduplicarea și limitarea pe tip de notificare (parametrii din design pentru alertele SMS servesc ca model);
  - mesajele de securitate nu se pot opri (S83);
  - o notificare operațională nu conține nimic comercial (GROWTH §2.6);
  - e-mailul comercial e blocat central (D-GRW-8).
- **Prima notificare reală — `invitation.new_link_requested`** (ARCHITECTURE v0.4.7 §15.1): owner-ul și adminii afacerii primesc o notificare `operational` în Hub, „{name} a cerut o invitație nouă pentru {businessName}.”, cu acțiunea spre lista invitațiilor (HubAdminTeam, Lotul 2.8). `{name}` e adresa invitată. **Nu se trimite e-mail** către cel care a invitat.
- **Auditul** trimiterilor sensibile, unde se cere.
- `i18n:check` intră în CI, într-un PR separat pe `.github/workflows/ci.yml` (fișier comun).

**Dependențe:** 4.1, 4.2. D4-1, D4-6, D4-8, D4-9.
**Migrări probabile:** `notifications_init`.
**Ecrane:** —
**Gata când:**

- `invitation.new_link_requested` → câte o notificare pentru owner și pentru fiecare admin, niciuna pentru membri și niciun e-mail către invitator (test);
- aceeași notificare cerută de două ori cu aceeași cheie → una singură (test);
- notificarea e în limba destinatarului, verificat pe toate cele 6 limbi (criteriul F4);
- un e-mail eșuat la furnizor e reîncercat, apoi marcat ca eșuat, fără dublură;
- o notificare fără categorie e refuzată (test).

**Estimare:** 22–28 de ore.

---

### Lot 4.4 — Notificări: clopoțelul și preferințele

**Scop:** sursa reală pentru clopoțelul din shell-ul Hub (pus în Lotul 2.8 fără sursă) și pentru cel din Founder, plus preferințele persoanei.

**Ce intră:**

- `NotificationsPanel` în shell-ul Hub și în cel Founder, legat de contractele din 4.3: lista, „Necitite”, „Marchează toate ca citite”, deschiderea acțiunii.
- **`countCategory="operational"`** rămâne ca în design: clopoțelul numără doar notificările operaționale (HubRecommendation). Gruparea „Despre cont și funcționare” / „Activitate” urmează D4-5.
- **„Contul tău · Notificări”** (HubAccount), după D4-6 și D4-7, cu rândul fix „E-mailuri de securitate: le primești mereu…”.
- **„Recomandări Ventora”** (CommercialPreferences): „În aplicație” activ, „Pe e-mail” blocat („Disponibil în curând”).
- Fără pagină de istoric dacă D4-11 = a.
- Capturile `_design` / `_impl` la 390/1280 × light/dark (regula 12).

**Dependențe:** 4.3. Lotul 2.8 (shell-urile, HubAdminTeam). D4-5, D4-6, D4-7.
**Migrări probabile:** —
**Ecrane:** NotificationsPanel, HubAccount (Notificări), CommercialPreferences.
**Gata când:**

- un invitat cere o invitație nouă → owner-ul vede notificarea în clopoțel, apasă și ajunge în HubAdminTeam, unde marcajul e vizibil; după „Retrimite” marcajul dispare (test end-to-end, cu Lotul 2.8);
- clopoțelul numără doar notificările operaționale necitite (test);
- o preferință oprită nu mai produce livrări pe acel canal, iar cele de securitate nu se pot opri (test);
- capturile sunt în raport, cu diff.

**Estimare:** 16–22 de ore.

---

### Lot 4.5 — Șabloanele cerute de Faza 3

**Scop:** notificările și e-mailurile pe care F3 le cere prin lista de chei (FAZA-3.md §3.10), gata înainte de Lotul 3.7.

**Ce intră:**

- Tipurile de notificare și șabloanele e-mail, în 6 limbi, pe `renderOperationalEmail`:
  - **factura emisă:** „Ți-am trimis factura și pe e-mail”;
  - **plata eșuată:** pentru pachet și pentru reînnoire;
  - **limita la 80% și la 100%:** operaționale, nu se opresc din preferințele comerciale (CommercialPreferences);
  - **anunțul de 30 de zile** la mutarea pe o versiune în dezavantajul clientului (D-COM-9);
  - **finalul perioadei de probă:** reminderul cu 3 zile înainte și „s-a încheiat”.
- F3 emite evenimentele, iar F4 le transformă în notificări. Fiecare tip are categoria `operational`.
- **Textele** se aprobă la revizuirea de microcopy (D-UX-1). Fără texte aprobate, cheile nu se publică (D4-12).

**Dependențe:** 4.3. Lista de chei de la F3 (începutul lui 3.2). D4-12.
**Migrări probabile:** —
**Ecrane:** — (designul e-mailului e șablonul unic, S3).
**Gata când:**

- fiecare tip e acoperit de un test de randare în cele 6 limbi;
- F3 poate trimite fiecare tip printr-un singur apel de contract (test de integrare cu un eveniment F3 simulat).

**Estimare:** 8–12 ore.

---

### Lot 4.6 — Suport: solicitările

**Scop:** „Sistem comun de suport, disponibil contextual în toate aplicațiile” (brief §39); o solicitare se poate trimite din orice aplicație (criteriul F4).

**Ce intră:**

- **`core/support`, schema `support`:**
  - `support_request`: organizația, persoana, aplicația, subiectul, descrierea, urgența („Normal” / „Mă blochează”), starea („Răspuns nou” / „În lucru” / „Rezolvat”), responsabilul;
  - `support_message` (firul);
  - atașamentele, prin `core/files` (4.7).
- **`HubSupport` + stările din `HubStates`**:
  - intrarea din `AccountMenu` (`onSupport`), cu aplicația precompletată după pagina de pornire;
  - pe telefon, ecrane separate.
- **Partea echipei Ventora** după D4-14. Legătura cu sesiunea de suport: `ticket_ref` devine o referință spre solicitare, dacă D4-14 = b.
- **Notificările:** „Răspuns nou” (în aplicație și pe e-mail, prin 4.3), cu designul lipsă cerut înainte.
- **Termenul:** „Îți răspundem în cel mult o zi lucrătoare” e un text din design, nu o regulă implementată (D4-15).
- **Glosarul:** „solicitare”, nu „tichet”.

**Dependențe:** 4.3, 4.7, Lotul 2.8 (shell-ul Hub). Designul pentru pagina solicitării și (dacă D4-14 = b) inbox-ul Founder. D4-13, D4-14.
**Migrări probabile:** `support_init`.
**Ecrane:** HubSupport, HubStates (suport); pagina solicitării și inbox-ul Founder, după design.
**Gata când:**

- din orice aplicație, prin `AccountMenu`, se trimite o solicitare cu aplicația corectă (test);
- o solicitare a organizației A nu e vizibilă din organizația B (T1 / T2);
- un răspuns al echipei Ventora schimbă starea în „Răspuns nou” și trimite notificarea;
- atașamentele respectă limita (10 MB, PNG / JPG / PDF), verificată pe server;
- capturile `_design` / `_impl` sunt în raport.

**Estimare:** 20–28 de ore. Inbox-ul Founder (dacă D4-14 = b) adaugă 10–14 ore.

---

### Lot 4.7 — Fișiere

**Scop:** `core/files` (ARCHITECTURE §4, PROPUS): stocarea, linkurile semnate și politicile de acces. Conținutul și versiunile documentelor rămân în Documents.

**Ce intră:**

- Adaptorul de stocare (D4-16: propunerea din specificație e Supabase Storage), cu un singur bucket privat pe mediu.
- Tabelul `file`: organizația, proprietarul (modulul și resursa), numele, tipul, mărimea, starea.
- **Încărcarea** printr-un link semnat, emis după `authorize()`. Limitele de tip și de mărime se verifică pe server.
- **Descărcarea** doar prin linkuri semnate, cu expirare (§12.4).
- **Contorizarea spațiului**, raportată către cota din F3 (`documents.storage`, dacă D3-14 o păstrează), prin contract.
- `FileUpload` legat de un client comun de încărcare (`packages/upload`, §9).
- Scanarea malware și retenția: după D4-17 și D4-18.

**Dependențe:** 4.1 (evenimentele de fișier). D4-16, D4-17, D4-18.
**Migrări probabile:** `files_init`.
**Ecrane:** — (FileUpload există; previzualizarea lipsește din design).
**Gata când:**

- un link semnat expirat sau pentru altă organizație e refuzat (test);
- un fișier peste limită sau de tip nepermis e refuzat pe server, chiar dacă clientul îl trimite;
- fără cheia de serviciu a stocării în codul clientului (test sau gardă).

**Estimare:** 14–20 de ore.

---

### Lot 4.8 — `packages/pdf`

**Scop:** generarea de PDF-uri comune (§9), în limba destinatarului (§10.6). Exportul PDF apare în 10 checklisturi.

**Ce intră:** motorul ales (D4-19), o funcție de randare cu tokenii și fonturile sistemului, un test de randare în 6 limbi (diacritice). Fără șabloane de domeniu; acestea vin cu modulele.

**Dependențe:** D4-19. Facturile F3 nu depind de el: PDF-ul facturii vine din SmartBill.
**Migrări probabile:** —
**Ecrane:** —
**Gata când:** un document de test se generează corect în cele 6 limbi, pe server, în mediul Vercel.
**Estimare:** 8–12 ore.

---

### Lot 4.9 — Infrastructura AI (D-AI-6)

**Scop:** doar infrastructura: configurarea modelelor, contorizarea, limitele de cost (D-AI-6). Fără asistent cu interfață.

**Ce intră:**

- `core/ai`, schema `ai`:
  - configurarea modelului și a prompturilor de sistem în baza de date (§12.4);
  - contorizarea pe organizație și pe aplicație;
  - limitele de cost: un plafon global și unul pe organizație, cu oprire la depășire.
- **Adaptorul pentru furnizor**, ca la e-mail: aplicațiile nu apelează furnizorul direct (D4-20).
- **Legătura cu cota „Număr analize AI”** din F3, prin contract (D4-21).
- Cheile furnizorului doar în `.env.local` și Vercel.

**Dependențe:** F2 (`authorize()`), 4.1. D4-20, D4-21. Pachetul SDK al furnizorului cere acordul fondatoarei (regula 3).
**Migrări probabile:** `ai_init`.
**Ecrane:** — (ecranele Founder lipsesc din design).
**Gata când:**

- un apel trece prin `authorize()` și se contorizează pe organizația corectă;
- la plafon, apelul următor e refuzat cu o eroare tipizată (test);
- fără cheie de furnizor în cod sau în jurnale.

**Estimare:** 12–18 ore.

---

### Lot 4.10 — Workflow engine (D-WF-1…6)

**Scop:** motorul care rulează automatizările construite de echipa Ventora pentru o afacere. Construirea, pornirea și oprirea se fac doar din Founder; în Hub, lista e doar pentru citire (D-WF-2, D-WF-3). Obligatoriu pentru produs (D-ROAD-5).

**Ce intră:**

- Serviciul Core ales la D4-22: `core/integrations` sau un serviciu propriu, `core/workflows`.
- **Definițiile:** declanșatorul (un eveniment din catalogul 4.1 sau un program), condițiile, pașii. Pașii vin dintr-o listă albă (D4-24): notificare, e-mail operațional, apelul unui contract de modul.
- **Execuțiile:** fiecare pas idempotent, jurnalul execuțiilor, oprirea centrală.
- **Pornirea** unei automatizări rezervă o unitate din cota de stoc `workflows.active` (F3, D-WF-4); oprirea o eliberează.
- **Constructorul din Founder** și **lista din Hub**: după design (D4-23).
- Automatizările predefinite ale modulelor (D-WF-6) **nu** trec prin motor: rămân setări ale modulelor.

**Dependențe:** 4.1, 4.2, 4.3. F3 Lotul 3.3 (cotele reale). Lotul 2.8 (shell-urile). D4-22, D4-23, D4-24, D4-25.
**Migrări probabile:** `workflows_init`.
**Ecrane:** — (lipsesc din design; D4-23).
**Gata când:**

- o automatizare de test se pornește din Founder, rulează la evenimentul ei, iar execuția apare în jurnal;
- pornirea peste cota `workflows.active` e refuzată (test);
- o afacere nu poate porni sau opri o automatizare (refuz pe server, test);
- fiecare pornire și oprire e auditată pe persoana Founder.

**Estimare:** 30–45 de ore. Incertitudinea e mare: lipsesc designul și lista albă.

---

### Lot 4.11 — Închiderea Fazei 4

**Scop:** verificarea pe un URL public și raportul de închidere.

**Ce intră:**

- serviciul de job-uri legat de proiectul Vercel `platform` (același moment ca Lotul 3.9 din F3, D4-5);
- migrările F4 pe staging doar din `main` (regula 11);
- verificarea manuală a notificărilor în cel puțin două limbi;
- raportul de închidere.

**Dependențe:** toate loturile. Proiectul Vercel.
**Estimare:** 4–8 ore.

---

### 3.12 Ordinea propusă și paralelismul cu Faza 3

```
4.1 outbox (T6) ──► 4.2 job-uri ──► 4.3 notificări: model ──┬──► 4.4 clopoțel și preferințe
                                                            ├──► 4.5 șabloanele F3   (înainte de 3.7)
                                                            └──► 4.6 suport ◄── 4.7 fișiere
4.7 fișiere, 4.8 pdf, 4.9 AI: în paralel, după 4.1 (4.8 oricând)
4.10 workflow engine: după 4.3 și după F3 3.3 (cotele)
4.11 închidere
```

- **Total Faza 4:** 162–231 de ore de agent pe un singur fir (fără inbox-ul Founder de la 4.6). Cu 4.7–4.9 în paralel, drumul critic (4.1 → 4.2 → 4.3 → 4.6 → 4.10 → 4.11) e de aproximativ 104–147 de ore.

**Momentele de sincronizare cu Faza 3:**

| F4 livrează | F3 folosește în | Până atunci, F3 |
|---|---|---|
| 4.1: `db-kit` cu plicul complet și dead-letter, îmbinat în `main` | 3.3 (`commercial.quota.threshold`), 3.5–3.6 (plata confirmată → factura) | — (4.1 trebuie să fie primul PR comun) |
| 4.2: dispecerul periodic și registrul de job-uri | 3.3 (reconcilierea), 3.6 (reîncercarea facturilor), 3.8 (reînnoirea, finalul probei, anunțul de 30 de zile) | rulează funcțiile imediat după tranzacție sau manual din Founder (FAZA-3.md §3.10) |
| 4.5: șabloanele F3 | 3.6 (factura pe e-mail), 3.7, 3.8 | dacă 4.5 nu e gata la 3.7, F3 le adaugă într-un PR separat pe `core/notifications`, coordonat (FAZA-3.md §3.10) |
| 4.4: clopoțelul cu sursă reală | 3.7 (limita la 80% / 100% vizibilă în Hub) | clopoțelul din 2.8 rămâne fără sursă |

**Folderele** (regula 10: un agent per worktree; același tabel ca în FAZA-3.md §3.10, completat):

| Folder | Faza 3 | Faza 4 |
|---|---|---|
| `core/commercial/**`, `core/billing/**`, `core/quota/**` | scrie | — (F4 doar apelează reconcilierea, prin registrul de job-uri) |
| `core/integrations/**` (dispecer, registrul de job-uri), `core/notifications/**`, `core/support/**`, `core/files/**`, `core/ai/**`, `core/workflows/**` (dacă D4-22 = b), `packages/pdf/**`, `packages/upload/**` | — | scrie |
| `apps/platform/app/api/inngest/**`, `apps/platform/app/(hub)/suport/**`, `apps/platform/app/(hub)/cont/notificari/**` | — | scrie |
| `apps/founder/app/(support)/**`, `apps/founder/app/(automations)/**`, `apps/founder/app/(ai)/**` | — | scrie |
| `apps/founder/app/(commercial)/**`, `apps/platform/app/(hub)/admin/abonament/**`, `apps/platform/app/api/webhooks/stripe/**` | scrie | — |
| Shell-urile Hub și Founder (Lotul 2.8; F4 doar le leagă clopoțelul) | — | un PR mic, separat |
| `core/audit/src/actions.ts`, `core/access/src/platform-manifest.ts`, `core/organizations/**` (emițătorul 4.1; profilul de facturare F3), `packages/contracts/**`, `packages/db-kit/**`, `packages/i18n/messages/*.json`, `.github/workflows/ci.yml` | comune | comune |

**Regulile pentru fișierele comune:** aceleași ca în FAZA-3.md §3.10.

- PR-uri mici, separate, îmbinate în `main` înainte ca celălalt fir să le folosească.
- Cheile i18n ale F4 stau în namespace-uri proprii (`packages/i18n/messages/notifications/*.json`, `support/*.json`).
- **Primul PR comun** e cel din 4.1 (`packages/db-kit`), pentru că F3 îl folosește din 3.3.

---

## 4. Integrările externe

### 4.1 Serviciul de job-uri (D-INF-2)

- **Ce propune ARCHITECTURE:** Inngest (retry, delay, pași durabili, compatibil Vercel). E7 a trecut doar cu serverul local de dezvoltare. Pe Vercel, `inngest.send()` a eșuat fără cheie de cloud, iar varianta de producție („un poller / cron citește outbox-ul”) nu a fost testată pe Inngest cloud.
- **Ce face fondatoarea** (după D4-3 și D4-4):
  - creează contul Inngest;
  - verifică planul și costul pentru volumul estimat;
  - creează mediile (staging, producție) și pune cheile (`INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`) în `.env.local` și Vercel. **Nu le trimite în chat.**
- **URL-ul public:** Inngest cloud apelează ruta `serve` a aplicației, deci are nevoie de un URL public. Până la proiectul Vercel (D3-18, același moment ca Lotul 3.9), lucrul se face pe serverul local de dezvoltare, fără cont. Instalarea CLI-ului de dezvoltare cere acordul fondatoarei.
- **Datele trimise:** plicul evenimentului conține doar ID-uri și câmpuri fără date personale (§11.2, `growthSafe`). Payload-urile mari se citesc din baza de date de job, nu se trimit.

### 4.2 E-mail (Resend, D-NOT-1, D-NOT-2)

- **Există:** contul fondatoarei, domeniul `ventora-hub.com` verificat (SPF și DKIM), regiunea UE, adaptorul și șablonul unic.
- **Lipsesc** (ARCHITECTURE §11.6):
  - cheile API separate pentru staging și producție, folosite doar de ecosistem;
  - DMARC, dacă lipsește, adăugat înainte de primul e-mail real.
- **Starea livrării** (bounce, livrat): Resend o poate raporta prin webhook, ceea ce cere URL public. Recomand amânarea până la Vercel; până atunci, starea e „trimis / eșuat” din răspunsul API-ului (D4-10).
- **Validarea juridică** a DPA-ului Resend e deja pe listă (FAZA-2 §11).

### 4.3 Stocarea fișierelor (D4-16)

Specificația dă direcția Supabase Storage (ARCHITECTURE §17.5). Fondatoarea creează bucket-urile private pentru staging și producție, în proiectele Supabase existente, iar cheia de serviciu stă doar pe server.

### 4.4 Furnizorul AI (D4-20)

Fondatoarea alege furnizorul, creează contul și cheia și stabilește bugetul lunar maxim (limita globală din 4.9).

### 4.5 Furnizorul SMS (D-SMS-8)

ARCHITECTURE îl cere „înainte de F4” (SMSLink sau Twilio). F4 nu construiește adaptorul, dar decizia condiționează interfața `SmsChannel` din 4.3 și rândul SMS din preferințe (D4-7).

---

## 5. NECESITĂ DECIZIE

Tabelul e ordonat după lotul pe care îl blochează fiecare decizie. „Blochează” înseamnă că lotul nu se poate închide fără decizie; ideal, decizia se ia înainte de începerea lui.

| # | Blochează | Întrebare | Variante | Recomandare |
|---|---|---|---|---|
| D4-1 | 4.1 | **Idempotența consumatorilor** | a) `processed_events` pe consumator (ARCHITECTURE §11.2); b) `processedAt` pe rândul de outbox (E7) | **DECIS: a** (fondatoarea, 30.10.2026). `processed_events` pe consumator: același eveniment poate avea mai mulți consumatori (de ex. notificări + Growth), fiecare cu idempotența lui. |
| D4-2 | 4.1 | **Unde stă codul outbox-ului** | a) helperii în `packages/db-kit`, dispecerul și registrul în `core/integrations`; b) totul în `db-kit` | **DECIS: a** (fondatoarea, 30.10.2026). Helperii în `packages/db-kit`; dispecerul și registrul de job-uri în `core/integrations`. `db-kit` rămâne fără concepte de business (§9). |
| D4-3 | 4.2 | **Serviciul de job-uri** (D-INF-2: CONFIRMAT în §17.1, NECESITĂ DECIZIE în §11.3, vezi C-F4-8) | a) Inngest cloud; b) Trigger.dev; c) pg-boss + worker pe Railway / Fly | **DECIS: a** (fondatoarea, 31.10.2026). Inngest: e în specificație, D-INF-4 se bazează pe el, iar E7 l-a testat local. Contul, costul și cheile vin la Vercel (4.11). |
| D4-4 | 4.2 | **Pachetul nou `inngest`** și CLI-ul de dezvoltare (regula 3) | a) aprobate la începutul lui 4.2; b) altă variantă | **DECIS: a** (fondatoarea, 31.10.2026). Pachetul `inngest` și CLI-ul de dezvoltare sunt aprobate. |
| D4-5 | 4.4 (și 4.3) | **Ce înseamnă „operațional”** (C-F4-1) | a) `category` = `operational` / `commercial`, obligatorie (ARCHITECTURE); gruparea din panou („Despre cont și funcționare” / „Activitate”) devine un câmp separat (de ex. `group`); b) categoria din UI (`operational` / `activity`), cu `commercial` separat | **DECIS: a** (fondatoarea, 31.10.2026). `category` (`operational` / `commercial`) e obligatorie la fiecare notificare, ca în ARCHITECTURE. Gruparea din `NotificationsPanel` („Despre cont și funcționare” / „Activitate”) devine un câmp separat, doar de afișare. Tipul din `packages/ui` se schimbă cu compatibilitate, cu galeria și verificarea vizuală în prag. Clopoțelul numără doar operaționalele. |
| D4-6 | 4.4 (și 4.3) | **Preferințele de notificare** (C-F4-2) | a) în aplicație: operaționalele mereu pornite; e-mailul se poate opri pe categorie, cu excepția celor de securitate și a celor pe care owner-ul nu le poate opri (BookingSmsNotifications); b) grila din HubAccount, cu „În aplicație” oprit pe fiecare rând | **DECIS: a** (fondatoarea, 31.10.2026). În aplicație, notificările operaționale sunt mereu pornite. Pe e-mail se pot opri pe categorii, cu excepția celor de securitate și a celor pe care owner-ul nu le poate opri prin design. Recomandările comerciale au comutatorul lor; pe e-mail rămân blocate (D-GRW-8). |
| D4-7 | 4.4 | **SMS către echipă** (coloana „SMS” din HubAccount, C-F4-4) | a) fără SMS către echipă deocamdată; b) SMS prin furnizor (D-SMS-8), contorizat | **DECIS: a** (fondatoarea, 31.10.2026). Fără SMS către echipă deocamdată. **Pentru mai târziu (nu se construiește acum):** canalele SMS și WhatsApp către echipă, ca funcționalitate plătită (cheie de funcționalitate + cotă pe mesaje), adăugate ca alte canale în modelul de notificări. Modelul din 4.3 trebuie să permită un canal nou fără să se schimbe. |
| D4-8 | 4.3 | **Limba e-mailului E-6** (sesiunea de suport, „doar română”, C-F4-5) | a) în limba destinatarului, ca toate notificările (criteriul F4); b) rămâne în română | **DECIS: a** (fondatoarea, 31.10.2026). E-mailul E-6 (sesiunea de suport) pleacă în limba destinatarului, ca toate notificările. Traducerile vin de la Design; până atunci, cheile există în 6 limbi cu textul din română, marcat ca netradus în raportul lotului. |
| D4-9 | 4.3 | **E-mailurile trimise azi direct** (resetarea parolei, invitațiile, notificările de suport) | a) invitațiile și notificările trec prin outbox (cu reîncercare); resetarea parolei rămâne imediată (persoana așteaptă linkul); b) toate prin outbox | **DECIS: a** (fondatoarea, 31.10.2026). Invitațiile și notificările trec prin outbox (reîncercare, apoi dead-letter). Resetarea parolei rămâne imediată. |
| D4-10 | 4.11 | **Starea livrării e-mailurilor** (webhook Resend) | a) după Vercel; b) deloc deocamdată | **a**. |
| D4-11 | 4.4 | **Istoricul notificărilor** (brief §36, lipsește din design) | a) doar panoul, cu ultimele 30 de zile; pagina de istoric vine cu design; b) pagina în F4, după design | **a**. Retenția se decide la D4-18. |
| D4-12 | 4.5 | **Textele notificărilor cerute de F3** | a) Design / microcopy le scrie, iar fondatoarea le aprobă (D-UX-1) înaintea lui 4.5; b) le propune agentul și se aprobă la review | **a**: textele vizibile nu se inventează. |
| D4-13 | 4.6 | **Modelul solicitării** (C-F4-6) | a) ca în design: aplicație, subiect, descriere, urgență pe 2 niveluri, 3 stări, fir de mesaje; categoria și responsabilul doar intern, în Founder; b) toate câmpurile din brief §39, vizibile | **a**. |
| D4-14 | 4.6 | **Cum răspunde echipa Ventora** (C-F4-7) | a) doar pe e-mail (`support@ventorasystems.com`), iar solicitarea din Hub creează e-mailul; b) inbox în Founder, cu răspunsul vizibil în Hub („Îți răspundem aici și pe e-mail”) | **b**: e ce promite designul Hub. Cere design pentru inbox. Până atunci, a. |
| D4-15 | 4.6 | **„În cel mult o zi lucrătoare”** | a) e o promisiune din design, fără termen în sistem; b) termen urmărit, cu alertă în Founder | **b**, dacă D4-14 = b. |
| D4-16 | 4.7 | **Stocarea** | a) Supabase Storage (direcția din specificație, aceeași infrastructură, regiunea UE); b) S3 / R2 | **a**. |
| D4-17 | 4.7 | **Scanarea malware** pentru fișierele din afara Documents (atașamentele) | a) doar PNG / JPG / PDF, până la 10 MB, fără scanare până la Documents; b) scanare de la început | De întrebat specialistul în securitate. Până la răspuns, **a** cu tipurile restrânse. |
| D4-18 | 4.7 (și 4.3, 4.6) | **Retenția** (§17.4 #8): atașamente, notificări, textele SMS (designul: 30 de zile), solicitări | — | Fondatoarea stabilește valorile, cu juristul (§6). |
| D4-19 | 4.8 | **Motorul PDF** | a) randare din componente React (bibliotecă dedicată, fără browser); b) Chromium headless pe server | **a** pentru Vercel (fără browser în funcție). Alegerea exactă a pachetului cere acordul fondatoarei (regula 3). Alternativ, 4.8 se mută la primul modul care exportă PDF. |
| D4-20 | 4.9 | **Furnizorul AI** | Furnizorii mari cu DPA și procesare în UE | Un singur furnizor, în spatele unui adaptor (ca la e-mail), ca să poată fi schimbat. Alegerea o face fondatoarea, după verificarea DPA-ului și a locului datelor. |
| D4-21 | 4.9 | **Unitatea de măsură AI** | a) intern: costul (tokeni → lei); pentru client: cota „Număr analize AI” (F3); b) doar tokeni | **a**. Definiția unei „analize” se decide cu D3-14. |
| D4-22 | 4.10 | **Serviciul Core al motorului** (D-WF-1: „de ales în F4”) | a) `core/integrations`; b) `core/workflows`, propriu | **b**: alt folder, deci fără suprapunere cu dispecerul din 4.1–4.2. |
| D4-23 | 4.10 | **Designul pentru automatizări** | a) cerut la Design acum (constructorul Founder, jurnalul execuțiilor, lista Hub, `UsageMeter` pe automatizări); b) 4.10 doar cu motorul și contractele, ecranele mai târziu | **a**, ca 4.10 să se închidă cu ecrane. |
| D4-24 | 4.10 | **Lista albă de declanșatoare și pași (v1)** | — | Fondatoarea alege 3–5 automatizări reale pentru prima afacere; lista albă se deduce din ele. |
| D4-25 | 4.10 (și 4.8, 4.9) | **AI, PDF și workflow engine rămân în Faza 4?** (C-F4-9) | a) da, ca în ARCHITECTURE §15.1 și D-ROAD-5; b) F4 = outbox, job-uri, notificări, suport, fișiere; restul într-o fază separată | **a** pentru workflow engine (obligatoriu, depinde direct de 4.1–4.3). Pentru AI și PDF, decide fondatoarea. |
| D4-26 | 4.3 (doar interfața) | **`core/messaging` și furnizorul SMS** (D-SMS-8: „înainte de F4”) | a) F4 face doar interfața `SmsChannel`; adaptoarele vin cu Booking, după E-SMS-1; b) `core/messaging` complet în F4 | **a**. Furnizorul (SMSLink sau Twilio) rămâne de ales înainte de primul SMS. |
| D4-27 | 4.11 | **Cine verifică traducerile** (D-UX-2) pentru notificări și e-mailuri | — | Necesar înaintea primei notificări reale în altă limbă decât româna. |

---

## 6. Riscuri și ce trebuie validat juridic

Aceasta nu e consultanță juridică. Sunt întrebările de pus unui specialist.

**Întrebări pentru avocat / DPO:**

1. **Serviciul de job-uri** (Inngest sau altul): DPA-ul, locul datelor, ce conțin evenimentele. Recomandarea tehnică e să nu conțină date personale, dar trebuie confirmat ce e acceptabil.
2. **Stocarea fișierelor:** locul datelor, retenția atașamentelor de suport (care pot conține date ale clienților finali), ștergerea la cererea afacerii.
3. **Furnizorul AI:** DPA-ul, dacă datele trimise sunt folosite la antrenare, locul procesării, ce se poate trimite din datele unei afaceri.
4. **Retenția** pe tip de date: notificări, solicitări, textele SMS, fișiere (§17.4 #8).
5. **Notificările:** confirmarea că limitele, facturile și securitatea sunt mesaje operaționale, nu comerciale (D-GRW-8 rămâne separat).
6. Registrul de subcontractori (GDPR): Inngest, Supabase Storage, furnizorul AI, alături de Resend.

**Riscuri tehnice:**

| Risc | Ce facem |
|---|---|
| Evenimentele se pierd între tranzacție și serviciul de job-uri | Outbox în aceeași tranzacție; dispecerul periodic reia ce n-a plecat (D-INF-4) |
| Livrare dublă (reîncercări, dispecer + trimitere imediată) | `processed_events` pe consumator; chei de idempotență deterministe (T6) |
| Job-urile rulează fără context de tenant (RLS) | Contextul din plic, setat în fiecare tranzacție (§12.3); test cross-tenant în 4.1 |
| Furtună de notificări (aceeași alertă repetată) | Deduplicare și limitare pe tip, după modelul alertelor SMS din design |
| F3 și F4 modifică `db-kit` sau `core/notifications` în același timp | Tabelul de foldere de la §3.12; 4.1 e primul PR comun |
| Inngest cloud netestat pe Vercel (E7) | Testul pe Vercel e criteriu la 4.11; până atunci, serverul local |
| Traducerile în 6 limbi întârzie notificările | Cheia intră cu toate traducerile în același PR (§15.5); D4-27 |
| Costul AI scăpat de sub control | Plafon global și pe organizație, verificat înaintea apelului (4.9) |
| Fișiere încărcate ocolind limitele | Validare pe server, la emiterea linkului și după încărcare |

---

## 7. Contradicții găsite între surse

Le listez, nu le rezolv. Fiecare cere decizia fondatoarei.

| ID | Subiect | Sursa A | Sursa B |
|---|---|---|---|
| C-F4-1 | **Două sensuri pentru „operațional”** | ARCHITECTURE §4 și GROWTH §2.6: orice notificare necomercială e `operational`; `category` e obligatorie | `NotificationsPanel` (S2): `category: 'operational' \| 'activity'`, opțională; „operational” e doar grupul „Despre cont și funcționare”. Contractul (`packages/contracts`) are `operational \| commercial`. |
| C-F4-2 | **Se pot opri notificările în aplicație?** | `BookingSmsNotifications`: „The in-app notifications can't be turned off.”; owner-ul nu poate opri e-mailul de alertă | `HubAccount`: o căsuță „În aplicație” pe fiecare rând, deci se pot opri. Aceeași pagină („Contul tău · Notificări”) are două designuri diferite. |
| C-F4-3 | **E-mailul comercial** | D-GRW-8, GROWTH §0.5, `CommercialPreferences`: e-mailul blocat („Disponibil în curând”) | `HubAccount`: rândul „Noutăți de la Ventora” are e-mailul pornit implicit |
| C-F4-4 | **SMS către echipă** | `HubAccount`: coloana „SMS” (de ex. „Facturi scadente” cu SMS pornit) | Nicio sursă de arhitectură nu definește SMS-urile către echipă; `ANDROID_SIM` e limitat la mesaje operaționale către clienți (D-SMS-6) |
| C-F4-5 | **Limba notificărilor** | Criteriul F4 (§15.1) și §10.6: în limba destinatarului | E-mailul E-6 (sesiunea de suport) și textele Founder sunt „doar în română” (S57, HubSupportSession) |
| C-F4-6 | **Modelul solicitării de suport** | Brief §39: Categorie, Prioritate, Responsabil, Mesaje, Istoric; checklisturile și ARCHITECTURE: „tichet”, „Pagină Support / My Tickets” în fiecare aplicație | `HubSupport`: fără categorie, urgență pe 2 niveluri, fără fir de mesaje; o singură pagină în Hub, din `AccountMenu`. Glosarul: „solicitare”, nu „tichet”. |
| C-F4-7 | **Cum răspunde echipa Ventora** | `HubStates`: „Îți răspundem aici și pe e-mail” | Nu există inbox Founder în brief, ARCHITECTURE sau design. Azi, cererile vin pe `support@ventorasystems.com` (FounderSupportSession: „Din cererea primită pe support@…”). |
| C-F4-8 | **Statusul serviciului de job-uri** | ARCHITECTURE §17.1: D-INF-2 „CONFIRMAT (specificație)”; D-INF-4 CONFIRMAT | ARCHITECTURE §11.3: „PROPUS, NECESITĂ DECIZIE (D-INF-2)”; §11.2 PROPUS; brief §58: outbox-ul tranzacțional e încă „propunere” |
| C-F4-9 | **Ce intră în Faza 4** | ARCHITECTURE §15.1 (F4): și cadrul AI, `pdf`, workflow engine (D-ROAD-5: obligatoriu, F4) | Cererea pentru acest plan și FAZA-2.md §1: „outbox, job-uri, notificări, suport, fișiere” / „Notificări, suport, AI, fișiere — Faza 4” |
| C-F4-10 | **Unde stă motorul de automatizări** | ARCHITECTURE §4: „motorul e în Core (`integrations`)” (PROPUS) | D-WF-1 și §4 (28.10): serviciul Core „se stabilește la proiectarea din F4” |
| C-F4-11 | **Numele stării `UNKNOWN`** | `SMS_NUMAR_PROPRIU.md` §3.3: „neconfirmată”; checklistul Booking :66: „neconfirmat” | Glosarul și designul: „Fără confirmare”, explicit nu „neconfirmat” (S9) |
| C-F4-12 | **Cine primește alertele SMS** | `SMS_NUMAR_PROPRIU.md` §3.6: Owner / Admin | Designul (S44): și managerul EasyBook; persoanele care nu sunt owner pot opri copia pe e-mail |
| C-F4-13 | **Idempotența outbox-ului** | ARCHITECTURE §11.2: `processed_events` pe consumator, plic complet | E7 (baza lui D-INF-4): `processedAt` pe rândul de outbox, plic fără `organizationId` / `version` / `correlationId` |
| C-F4-14 | **SMS de marketing** | Checklistul Marketing (:16, :41-53): campanii SMS către clienți | D-SMS-6: `ANDROID_SIM` doar operațional; `SMS_PROVIDER` neales (D-SMS-8) |
| C-F4-15 | **Fișierele: Documents sau Core** | Brief §19 și §32: fișierele, stocarea securizată și scanarea malware sunt ale Documents | ARCHITECTURE §4: `core/files` (PROPUS) pentru stocare și linkuri semnate în toate aplicațiile |
| C-F4-16 | **Limbile din brief** | D-I18N-2: 6 limbi | Brief §56–57, :2637, :2707: 5 limbi (fără italiană) |

---

## 8. Criteriile de ieșire din Faza 4

Faza 4 se închide doar când:

1. Migrările F4 (`notifications`, `support`, `files`, `ai`, `workflows` și tabelele outbox) se aplică pe o bază curată, fără drift (T9).
2. T6 e verde în CI: livrarea dublă are efect unic; consumatorul eșuat ajunge în dead-letter după 3 încercări.
3. O notificare ajunge în limba destinatarului, pe toate cele 6 limbi (test).
4. Se poate trimite o solicitare de suport din orice aplicație (test).
5. Obligația lăsată de F2 e îndeplinită: `invitation.new_link_requested` → notificare operațională în Hub pentru owner și admini, cu acțiunea spre HubAdminTeam; niciun e-mail către invitator.
6. Clopoțelul din Hub are sursă reală și numără doar notificările operaționale (`countCategory="operational"`).
7. Șabloanele cerute de F3 sunt livrate (4.5), iar job-urile F3 rulează prin serviciul de job-uri (4.2).
8. `i18n:check` rulează în CI.
9. Ecranele F4 au capturile `_design` / `_impl` în raport (regula 12).
10. CI e verde pe toate joburile.
11. Întrebările juridice din §6 sunt trimise (nu neapărat primite). Nicio dată reală nu trece prin serviciile noi înainte de răspuns.
