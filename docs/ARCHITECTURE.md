# VENTORA ECOSYSTEM — ARHITECTURĂ TEHNICĂ

**Versiune:** 0.3.0
**Data:** 24 octombrie 2026
**Stadiu:** Propunere. Nimic nu este implementat. Faza 0 nu începe fără aprobarea explicită a acestei versiuni.

## Istoric

| Versiune | Data | Modificare |
|---|---|---|
| 0.1 | 24.10.2026 | Prima propunere de arhitectură |
| 0.2 | 24.10.2026 | Revizuire după „Corecții obligatorii pentru arhitectura v0.2”: izolare multi-tenant din prima zi, autorizare separată de cote, validarea tehnică a bazei de date, model comercial extensibil, Network/Portal clarificate, roadmap pe livrabile, ierarhia documentelor, statusuri explicite pentru fiecare decizie. Lista completă: §17.2. |
| 0.2.1 | 24.10.2026 | Actualizare după primirea specificației complete a celor 15 aplicații (checklisturile, 1.465 de funcționalități): C1, C2 și C3c rezolvate; Better Auth, Inngest/outbox, Stripe, SmartBill, Prisma și Supabase Storage confirmate ca direcție tehnică de specificație. Detalii: §17.5. |
| 0.2.2 | 24.10.2026 | Decizii ale fondatorilor: next-intl (D-I18N-1), domeniile (D-INF-1), Hub-ul vechi fără clienți reali și fără migrare de date (C13). Detalii: §17.6. |
| 0.2.3 | 24.10.2026 | Decizie a fondatoarei: se adaugă italiana; ecosistemul suportă 6 limbi (RO/EN/FR/ES/DE/IT). Detalii: §17.7. |
| 0.2.4 | 24.10.2026 | Decizii ale fondatoarei: design responsive obligatoriu pe toate dimensiunile de ecran (D-UI-3); aplicație mobilă nativă a ecosistemului, planificată la final (D-MOB-1), cu pregătire arhitecturală de acum (API pentru clienți first-party). Detalii: §17.8. |
| 0.2.5 | 24.10.2026 | Decizie a fondatoarei: proprietarul poate cumpăra singur add-on-uri (de ex. campanii în plus) din aplicație, cu plata cu cardul (D-COM-6). Detalii: §17.9. |
| 0.2.6 | 24.10.2026 | Decizie a fondatoarei: Portal și Network au identitate vizuală proprie, pe aceeași fundație tehnică (D-UI-4). Detalii: §17.10. |
| 0.2.7 | 24.10.2026 | Regulă nouă permanentă: UX writing și revizuirea microcopy-ului după fiecare ecran (D-UX-1), în DESIGN_RULES.md §13 și în criteriile de acceptare. Detalii: §17.11. |
| 0.2.8 | 24.10.2026 | Growth Engine aprobat ca serviciu Core (D-GRW-1…11), cu clarificările fondatorilor; specificația completă în `GROWTH_ENGINE.md`. Neimplementat. Detalii: §17.12. |
| 0.2.9 | 24.10.2026 | Standard nou: Global Product Experience & Behavioral Design (D-PX-1), review A–E pentru fiecare ecran (DESIGN_RULES §15). Adăugată nevoia de instrumentare a experienței de produs (§10.10, D-PX-2 deschisă). Detalii: §17.13. |
| 0.3.0 | 24.10.2026 | Designul unificat aprobat (Claude Design, etapele 1–5, 52 de decizii) și exportat în `docs/design/system/`. Integrate deciziile din fișele de review care ating arhitectura: 2FA obligatoriu pentru Owner (P5), invitațiile expirate (P6), excepții cu termen (P17), anunțul la schimbarea versiunii de plan (P19), regulile Growth (P20–P25), termenul „plan” doar în Founder (D1). Detalii: §17.14. |

## Statusuri folosite în acest document

- **CONFIRMAT**: susținut de o decizie explicită a fondatorilor (master brief, regula de design sau confirmare directă).
- **PROPUS**: recomandare tehnică, încă neaprobată.
- **NECESITĂ DECIZIE**: contradicție sau lipsă de informație pe care o pot rezolva doar fondatorii.
- **DE VALIDAT TEHNIC**: depinde de un experiment din Faza 0.

> Pentru Claude Code: acest document descrie CUM construim. Cerințele (CE construim) vin din sursele de rang superior (§1). La orice conflict între surse te oprești și marchezi conflictul. Nu îl rezolvi prin presupuneri.

---

## 1. Ierarhia documentelor

În ordinea autorității:

1. **Deciziile aprobate ale fondatorilor și checklisturile funcționale confirmate** (`docs/checklists/`) stabilesc cerințele.
2. **`VENTORA_MASTER_BRIEF.md`** consolidează viziunea și regulile de produs.
3. **`ARCHITECTURE.md`** (acest document) descrie implementarea tehnică aprobată.
4. **`DESIGN_RULES.md` + artefactul Claude Design** definesc regulile vizuale.
5. **`VENTORA_SOURCE_OF_TRUTH.md`** e indexul central către toate sursele de mai sus. Trimite la ele, nu le copiază.
6. **ADR-urile** (`docs/adr/NNNN-titlu.md`) înregistrează fiecare decizie arhitecturală.
7. **`CLAUDE.md`** (rădăcină + câte unul scurt pe modul) conține instrucțiunile operaționale pentru Claude Code, cu trimiteri la sursele autoritative.

**Formatul ADR:** ID, Status (unul dintre cele patru de mai sus), Context, Decizie, Justificare, Consecințe, Data aprobării.

**Regula anti-drift:** o regulă se scrie într-un singur loc. Celelalte documente trimit la ea. Dacă două surse se contrazic, se marchează conflictul și se cere decizie.

---

## 2. Principii arhitecturale

| # | Principiu | Status |
|---|---|---|
| P1 | Un monorepo, un **monolit modular**: Core + Hub + 15 aplicații ca module izolate, fără microservicii | CONFIRMAT |
| P2 | 15 aplicații independente funcțional și comercial; integrările sunt opționale, fără dependențe ascunse | CONFIRMAT (brief) |
| P3 | Fiecare modul își deține datele; niciun modul nu accesează tabelele altuia | CONFIRMAT (brief §5) |
| P4 | Comunicarea între module doar prin contracte publice tipizate și evenimente versionate | CONFIRMAT (brief §33–34) |
| P5 | Un singur design system și o singură bibliotecă de componente pentru Hub, Founder și cele 13 aplicații de business; Portal și Network au identitate vizuală proprie pe aceeași fundație tehnică (§10.8) | CONFIRMAT (DESIGN_RULES, D-UI-4) |
| P6 | Logica tehnică comună are o singură implementare autoritativă (§9) | CONFIRMAT (DESIGN_RULES §9) |
| P7 | Securitatea multi-tenant se demonstrează prin teste din prima zi, nu se amână | CONFIRMAT |
| P8 | Granițele sunt impuse automat (lint, drepturi de bază de date, teste), nu doar prin convenție | PROPUS |
| P9 | Arhitectura **minimizează** schimbările necesare pentru a muta ulterior un modul într-un deployment separat. Mutarea va cere totuși adaptări de transport, tranzacții și infrastructură; nu promitem extragere fără nicio rescriere. | PROPUS |
| P10 | Complexitatea se adaugă doar când există un caz real de utilizare | CONFIRMAT (brief §61) |
| P11 | Totul e responsive: telefon, tabletă, laptop, desktop și ecrane late, în browser | CONFIRMAT (D-UI-3) |
| P12 | Logica de business nu stă în UI și nici doar în acțiunile de server ale Next.js: e apelabilă și de o viitoare aplicație mobilă nativă | CONFIRMAT (D-MOB-1), PROPUS (mecanismul, §3.2) |
| P13 | Recomandările comerciale vin dintr-un singur serviciu Core (Growth Engine); aplicațiile declară doar sloturi și semnale și funcționează identic fără el | CONFIRMAT (D-GRW-1, D-GRW-2) |

---

## 3. Structura repository-ului

**Status: PROPUS**

```
ventora/
├── apps/                       # aplicații Next.js (deployment-uri)
│   ├── platform/               # Hub + aplicațiile B2B, inclusiv Network
│   ├── portal/                 # experiența Portal (B2C și partea business a Portal)
│   └── founder/                # Founder Control Center
├── modules/                    # logica de domeniu, câte un pachet pe aplicație (15)
│   └── <app>/
│       ├── db/                 # schema și migrațiile proprii (tehnologia: §6, DE VALIDAT TEHNIC)
│       ├── src/contract/       # API-ul public: singurul import permis din afara modulului
│       ├── src/server/         # servicii, repository-uri, handlere de evenimente
│       ├── src/ui/             # ecrane de domeniu, construite DOAR din packages/ui
│       ├── src/manifest.ts     # permisiuni, funcționalități, cote, navigație, evenimente
│       ├── messages/{ro,en,fr,es,de,it}.json
│       ├── tests/
│       └── CLAUDE.md
├── core/                       # servicii de business ale platformei (§4)
│   ├── identity/  organizations/  access/  commercial/  billing/
│   ├── notifications/  audit/  support/  ai/  integrations/  files/  growth/
├── packages/                   # pachete tehnice și UI comune (§9)
│   ├── ui/  tokens/  i18n/  contracts/  errors/  logger/  config/
│   ├── db-kit/  pagination/  upload/  pdf/  testing/
└── docs/
    ├── VENTORA_SOURCE_OF_TRUTH.md
    ├── VENTORA_MASTER_BRIEF.md
    ├── ARCHITECTURE.md
    ├── DESIGN_RULES.md
    ├── design/                 # exportul aprobat din Claude Design
    ├── checklists/             # funcționalitățile confirmate, pe aplicație
    └── adr/
```

Tooling propus: pnpm workspaces + Turborepo, TypeScript strict.

### 3.1 Deployment-uri

**Status: PROPUS**

| Deployment | Conține | De ce separat |
|---|---|---|
| `platform` — `app.ventora-hub.com` | Hub, cele 13 aplicații B2B obișnuite, **Network** (interfața autentificată) | Aceeași identitate B2B, același domeniu: o singură autentificare, preferințele de temă și limbă se păstrează automat între aplicații |
| `portal` — `portal.ventora-hub.com` | Portal: partea pentru consumatori (B2C) și partea de administrare pentru afaceri, descrisă în brief §30 „Business Management” | Altă identitate (B2C), alt public, nevoi de SEO |
| `founder` — `founder.ventora-hub.com` | Founder Control Center | Alt nivel de risc, se poate restricționa separat (2FA obligatoriu, eventual restricție IP) |

**Network:** e o aplicație B2B cu identitate Core, deci stă în `platform`. Dacă Network are pagini publice (profiluri de afacere vizibile fără cont, director public), acestea se servesc tot din `platform`, ca rute publice randate pe server și indexabile. **Nu se adaugă un al patrulea deployment.** Existența paginilor publice Network: **NECESITĂ DECIZIE** (D-NET-1).

**Partea business a Portal** (afacerile care își gestionează profilul, postările, ofertele): **NECESITĂ DECIZIE** (D-POR-1) dacă se servește în `portal` cu identitatea B2B sau ca segment `/portal` în `platform`. Recomandare: segment în `platform`. Utilizatorul B2B rămâne astfel pe un singur domeniu și nu avem două tipuri de sesiune în aceeași aplicație.

### 3.2 Pregătirea pentru aplicația mobilă

**Status:** aplicația mobilă a ecosistemului **CONFIRMAT** ca obiectiv (la final, după aplicațiile web). Mecanismul de mai jos: **PROPUS**. Tehnologia (de ex. Expo / React Native) și momentul: **NECESITĂ DECIZIE** (D-MOB-2), mai târziu.

Ce facem **de acum**, ca să nu rescriem nimic când vine aplicația mobilă:

- **Logica stă în contractele modulelor** (`src/contract`), nu în componentele React și nu doar în server actions. Server actions și route handlers din `apps/` sunt doar adaptoare subțiri peste contracte.
- **Contractele sunt serializabile** (input și output JSON, erori tipizate). Aceeași regulă din §11.1 face posibilă expunerea lor prin HTTP.
- **Un API first-party** (`app.ventora-hub.com/api/app/v1/...`), separat de API-ul extern comercial din §11.4, se adaugă când începe aplicația mobilă. E o colecție de adaptoare HTTP peste aceleași contracte, cu aceleași `authorize()`, cote și audit.
- **Autentificarea** trebuie să suporte și clienți non-browser: sesiuni cu token pentru aplicația mobilă (Better Auth le suportă), revocabile din același loc ca sesiunile web. Se verifică în experimentul E9.
- **Notificările** (Core) au de la început conceptul de canal, ca notificările push pe telefon să fie doar un canal nou.
- **Fișierele** se servesc prin URL-uri semnate, utilizabile la fel din browser și din aplicația mobilă.
- **Traducerile** stau în cataloage JSON pe care aplicația mobilă le poate reutiliza.

Ce **nu** facem acum: nu construim API-ul mobil, nu alegem tehnologia mobilă și nu facem ecrane mobile native.

---

## 4. Responsabilitățile Core

Core conține doar **servicii de business ale platformei**: lucruri pe care le deține ecosistemul, nu o aplicație anume. Core **nu** devine locul unde ajunge orice funcție reutilizabilă. Utilitarele tehnice merg în `packages/` (§9).

| Serviciu Core | Deține | Status |
|---|---|---|
| `identity` | User, AuthIdentity, Session, UserPreference, factori 2FA, recuperare; separat, identitatea consumatorilor (§7.6) | CONFIRMAT (brief §7) |
| `organizations` | Organization, Membership, Location, Invitation, OrganizationSetting, identitatea de bază a afacerii (nume, logo, date firmă) | CONFIRMAT (brief §7) |
| `access` | Role, Permission, RoleAssignment, ApplicationAccess, ResourceAccessPolicy, `authorize()` | CONFIRMAT (brief §11) |
| `commercial` | Application registry, Plan, PlanVersion, Entitlement, Quota, Usage, AddOn, Override, Trial | CONFIRMAT (brief §12–14) |
| `billing` | Subscription și facturarea serviciilor Ventora (separat de aplicația Finance) | CONFIRMAT (brief §43) |
| `notifications` | Template, preferințe, livrare, istoric; fiecare notificare are categoria obligatorie `operational` sau `commercial`, cu preferințe separate | CONFIRMAT (brief §36; categoria: D-GRW-3) |
| `growth` | Growth Engine: oferte, campanii, eligibilitate, sloturi, plafoane, tracking, experimente, oprire centrală (§8.7). Nu deține prețuri sau drepturi: le citește din `commercial` și `billing`. | CONFIRMAT (D-GRW-1) |
| `audit` | Un singur AuditLog cu categorii | PROPUS (lecția L5 din audit) |
| `support` | SupportTicket | CONFIRMAT (brief §39) |
| `ai` | Configurarea modelelor, contorizarea, cadrul asistentului contextual | CONFIRMAT (brief §38) |
| `integrations` | Outbox, livrarea evenimentelor, conexiuni de integrare, chei API externe, webhooks | CONFIRMAT (brief §33–35) |
| `files` | Stocarea, URL-urile semnate și politicile de acces la fișiere (conținutul și versiunile documentelor rămân în Documents) | PROPUS |

Automatizările comune (brief §37): motorul e în Core (`integrations`), iar fiecare automatizare predefinită aparține modulului care o folosește. Status: PROPUS.

---

## 5. Responsabilitățile celor 15 aplicații

**Status: CONFIRMAT (brief §5, §32).** Numărul aplicațiilor nu se schimbă.

| Aplicație | Deține (exemple) | Nu deține |
|---|---|---|
| Booking | Appointment, Service, disponibilitate, reguli de rezervare, waitlist | Clientul ca relație comercială (CRM), plata ca evidență financiară (Finance) |
| CRM | Contact, Company, Lead, Deal, Pipeline, Activity | Conexiunile din Network |
| Documents | Document, Folder, Version, Template, flux de aprobare | Contractul ca obligație (Contracts) |
| Contracts | Contract, Party, Obligation, Renewal, acceptare OTP | Fișierul ca document (Documents) |
| Events | Event formal, Registration, Ticket, Check-in, Invitation Design Store | Postările despre evenimente din Portal și Network |
| HR | Employee, prezență, pontaj oficial, concedii, recrutare, training | Planificarea turelor (Shifts) |
| Inventory | Product, SKU, StockMovement, depozite, loturi | Activele individuale (Assets) |
| Shifts | Shift, disponibilitate pentru ture, schimburi | Prezența efectivă (HR) |
| Marketing | Campaign, Audience, Segment, Message | Leadurile (CRM) |
| Analytics | Definiții de rapoarte, proiecții analitice, workbooks | Datele operaționale sursă |
| Assets | Asset, alocări, mentenanță, garanții | Stocurile (Inventory) |
| Projects | Project, Task, timpul pe taskuri, bugete de proiect | Pontajul oficial (HR) |
| Finance | Facturi emise și primite (evidență), plăți, cash flow, bugete | Emiterea facturilor; abonamentele Ventora (billing Core) |
| Portal | Consumer, feed, recenzii, loyalty, VeeCoin, family, marketplace de prezentare | Programările (Booking), evenimentele formale (Events) |
| Network | Profil profesional, conexiuni, oportunități B2B, grupuri, parteneriate | Relația comercială privată (CRM) |

### 5.1 Profilurile de afacere: fără modele duplicate

**Status: PROPUS, cu D-PROF-1 (NECESITĂ DECIZIE)**

- **Core `organizations`** deține identitatea de bază a afacerii: nume, logo, CUI, locații, categorii, date de contact. O singură sursă.
- **Portal** deține doar extensia orientată spre consumatori: descriere publică, galerie, oferte, program afișat, setări de vizibilitate în Portal.
- **Network** deține doar extensia profesională: industrii, specializări, servicii B2B, badge-uri de verificare, setări de vizibilitate în Network.
- Ambele extensii citesc identitatea de bază prin contractul Core. Nu o copiază.

**NECESITĂ DECIZIE:** dacă o afacere vrea aceeași descriere sau galerie în Portal și în Network, se introduce sau nu un „profil public comun” în Core.

### 5.2 Ciclul de viață al aplicațiilor

**Status: PROPUS**

Fiecare aplicație are o stare înregistrată în `docs/checklists/<app>.md` și în registrul de aplicații:

`Not started` → `In development` → `Internal testing` → `Pilot` → `Production ready`

- Doar aplicațiile `Pilot` (pentru organizațiile din pilot) și `Production ready` pot fi activate pentru clienți.
- Starea `Production ready` cere **toate** funcționalitățile confirmate din checklist, bifate și testate, plus criteriile din brief §56. Un flux principal funcțional nu e suficient.

---

## 6. Strategia bazei de date

### 6.1 Direcția

**Status: PROPUS (direcție), DE VALIDAT TEHNIC (implementare)**

- O instanță PostgreSQL (Supabase).
- **Scheme Postgres separate** pe domeniu: `core`, `booking`, `crm`, ..., `portal`, `network`.
- Migrații versionate și independente pe modul.
- **Roluri Postgres** separate pe modul, cu drepturi doar pe schema proprie.
- **Fără foreign key-uri între scheme.** Referințele către alte domenii sunt ID-uri, validate prin contracte (§6.4).

### 6.2 Variante de comparat în Faza 0

**Status: DE VALIDAT TEHNIC**

Nicio variantă nu e aprobată definitiv înainte de experimentul din Faza 0 (§14.3).

| Variantă | Descriere | Pentru | Contra / risc |
|---|---|---|---|
| **A** | Prisma, câte un `schema.prisma` și un client generat pe modul, conexiune cu `?schema=<modul>` și rol Postgres propriu | Izolare maximă: clientul unui modul nici nu cunoaște alte tabele | 15+ clienți generați în același proces; pool-uri multiple; complexitate la generare și build |
| **B** | Prisma cu un singur proiect multi-fișier și `multiSchema`, plus acces controlat: fiecare modul primește doar un repository-wrapper peste modelele proprii; lint interzice importul clientului brut; rolul Postgres e partajat sau separat prin `SET ROLE` | Un singur client, setup simplu, migrații într-un singur loc | Clientul expune toate modelele, deci izolarea depinde de lint și de disciplina wrapper-ului; migrații comune pentru toate modulele |
| **C** | Drizzle cu schemă pe modul | Scheme TypeScript per modul native, fără generare | Tehnologie nouă pentru echipă. Se alege **doar** dacă A și B au probleme nerezolvabile, nu doar remediabile. |

**Criteriile de alegere, în ordine:** izolare corectă → migrații predictibile → viteză de dezvoltare → mentenanță simplă → performanță.

### 6.3 Migrații

**Status: CONFIRMAT (lecția L9 din audit, aprobată prin corecții)**

- `prisma db push` (sau echivalentul) e **interzis** în orice mediu, cu excepția unei baze de date locale de unică folosință.
- Fiecare schimbare de schemă = o migrație versionată, cu review.
- CI aplică migrațiile pe o bază curată și verifică lipsa drift-ului.
- Schimbările distructive se fac în doi timpi: adaugi, migrezi datele, abia apoi ștergi.
- Baza de producție trebuie să poată fi recreată integral din migrații.

### 6.4 Integritatea între domenii

**Status: PROPUS**

Eliminarea foreign key-urilor între scheme **nu** rezolvă singură integrarea. Regulile:

**a) Proprietar unic.** Fiecare entitate are un singur modul proprietar (§5). Doar proprietarul o creează, modifică sau șterge.

**b) Validare la scriere.** Când modulul A salvează o referință către o entitate a modulului B (de exemplu, Booking salvează `staffMemberId`), A cheamă contractul public al lui B (`exists(ctx, id)` / `get(ctx, id)`), care verifică faptul că entitatea există, aparține aceleiași organizații și e activă. Fără validare nu se scrie referința.

**c) Ștergere = dezactivare.** Entitățile referibile din afară nu se șterg fizic din aplicație. Se **arhivează sau dezactivează** (`archivedAt`), iar proprietarul publică evenimentul `<app>.<entity>.archived.v1`.

**d) Reacția consumatorilor** e definită explicit pe fiecare relație, în manifestul consumatorului:

- `keep_snapshot`: păstrează referința și o copie minimă (numele) pentru afișarea istoricului, marcată „indisponibil”. Exemplu: o programare veche a unui angajat plecat.
- `block_new`: interzice referințe noi, cele vechi rămân.
- `cascade_archive`: arhivează și elementele proprii dependente. Se folosește rar și se justifică.

**e) Ștergerea legală (GDPR).** Core orchestrează: cheamă handler-ul de ștergere sau anonimizare al fiecărui modul activ, înregistrează rezultatul fiecăruia și reîncearcă până la finalizare. Cererea e completă doar când toate modulele au confirmat.

**f) Referințe orfane.** Un job periodic de reconciliere pe modul verifică referințele externe, raportează orfanii în panoul Founder și nu modifică nimic automat.

**g) Operațiuni care implică mai multe module.** Nu există tranzacții distribuite. Se folosește **saga**:

- fiecare pas e o tranzacție locală în modulul proprietar;
- pasul următor e declanșat prin eveniment (outbox) sau apel de contract;
- fiecare pas are o acțiune de compensare definită.

Exemplu, rezervare cu avans din Portal: Booking creează programarea `pending_payment` → plata confirmă → Booking o trece în `confirmed`. La eșecul plății sau la expirare, Booking o anulează și eliberează intervalul.

**h) Erori parțiale și retry.** Fiecare pas e idempotent (cheie de idempotență pe operație). Retry cu backoff. După epuizarea încercărilor: dead-letter vizibil în Founder și stare explicită pe entitate (de exemplu, `sync_failed`). Niciun pas nu e lăsat „pe jumătate” fără o stare care să o arate.

### 6.5 Identificatori

**Status: PROPUS (brief §8 recomandă UUIDv7)**

- UUIDv7 pentru toate entitățile, generat în aplicație.
- Fără ID-uri secvențiale expuse.
- Numerele umane (numărul de contract, numărul de programare) sunt coloane separate, unice pe organizație.

---

## 7. Identitate, organizații și acces

### 7.1 Autentificare B2B

**Status: PROPUS (librăria), CONFIRMAT (cerința de sesiuni revocabile)**

- **Sesiuni stocate în baza de date**, cu ID opac în cookie. Rolul **nu** stă în token. Permisiunile se citesc din DB la fiecare request, cu cache doar pe durata request-ului. Asta rezolvă vulnerabilitatea S2 din audit.
- Librăria propusă: **Better Auth** (self-hosted, adapter Prisma, invitații, 2FA). Versiunea stabilă se verifică la start. Alternative evaluate: Clerk/Auth0 (cost per utilizator, date la terți), Supabase Auth (organizațiile tot le construim noi).
- Parole cu argon2id. 2FA TOTP opțional pentru utilizatori, **obligatoriu** pentru Founder.
- **2FA obligatoriu pentru Owner (CONFIRMAT, P5):** proprietarul poate plăti și schimba accesul celorlalți, deci autentificarea în doi pași e obligatorie pentru el. La primirea rolului de Owner are o **perioadă de grație de 14 zile** (cu un Notice neutru, fără blocare); după ea, accesul la acțiunile de Owner cere 2FA activ. La activare primește **coduri de recuperare** de unică folosință (stocate ca hash, regenerabile, regenerarea auditată). Pierderea dispozitivului fără coduri se rezolvă doar prin sesiune de suport Founder, auditată.
- **Codul 2FA se cere pe un dispozitiv nou** (CONFIRMAT, D10 microcopy); „Ține-mă minte” păstrează sesiunea 30 de zile pe dispozitivul ales (CONFIRMAT, P1), revocabilă din Securitate.

**Acceptare (testat):**
- retrogradarea unui Admin are efect la următorul request;
- revocarea unei sesiuni îl scoate imediat pe utilizator.

### 7.2 Politica de intrare: configurabilă, nu blocată în structură

**Status:**
- politica inițială „B2B doar prin invitație, organizații create de Founder”: **CONFIRMAT** (confirmare directă a fondatoarei);
- extensibilitatea structurală: **PROPUS**;
- activarea self-service: **NECESITĂ DECIZIE** viitoare (D-COM-4).

Modelul de date și serviciile **nu** presupun că doar Founder poate crea organizații pentru totdeauna:

- `Organization.createdVia`: `founder | self_service | import`.
- Crearea unei organizații trece printr-un singur serviciu Core (`createOrganization`), apelabil de Founder astăzi și de un flux self-service mâine.
- Abonamentul se poate crea din panou (plată manuală sau recurentă) și, în viitor, după un checkout. Modelul `Subscription` e același.
- O setare centrală de platformă controlează politica: `signup.b2b = invite_only | self_service`, `signup.b2b.checkout = disabled | enabled`.

**Model A (activ): Founder-managed.** Founder creează organizația, configurează planul și invită Owner-ul. Plata e manuală sau recurentă.

**Model B (pregătit structural, NEACTIVAT): Self-service.** Cont nou → organizație nouă → alegere plan → checkout sau trial → acces. Se activează doar cu aprobare explicită. Ecranele și checkout-ul **nu** se construiesc până atunci.

### 7.3 Invitații

**Status: PROPUS**

- Flux: Founder invită Owner-ul. Owner-ul invită membri și setează rolul și accesul la aplicații. Invitatul acceptă, își setează parola și intră în organizație.
- Token de unică folosință (stocat ca hash), expirare (implicit 7 zile, configurabilă), stări (trimisă / acceptată / expirată / revocată), retrimitere, revocare.
- **Invitațiile expirate dispar din lista echipei după 30 de zile** (CONFIRMAT, P6), dar rămân în jurnalul de audit. „Retrimite” stă la vedere pe invitațiile expirate.
- După acceptare, invitatul ajunge direct în aplicația principală a rolului său; launcher-ul rămâne la un click (P3, aprobat parțial: comportamentul exact se fixează la implementarea Hub-ului).
- Un email care are deja cont primește un membership nou, nu un cont nou.
- Toate acțiunile sunt auditate.

### 7.4 Organizația activă

**Status: PROPUS**

- Se stochează în sesiunea de pe server, nu în URL, localStorage sau câmpuri din request.
- Schimbarea organizației = acțiune pe server care verifică membership-ul și reîncarcă permisiunile, aplicațiile și entitlements.
- Un `organizationId` trimis în request nu are niciun efect asupra contextului.

### 7.5 Autorizare

**Status: PROPUS (implementarea), CONFIRMAT (regulile din brief §11)**

`authorize()` verifică **doar accesul**. **Nu** consumă cote (vezi §8).

```ts
const ctx = await authorize({
  app: 'booking',                              // organizația are aplicația activă și utilizatorul are acces la ea
  permission: 'booking.appointment.update',
  resource: { type: 'appointment', id },       // resursa aparține organizației + politica pe resursă
})
// ctx: TenantContext { organizationId, userId, membershipId, roles, actor: 'user' | 'system' | 'support' }
```

Funcția verifică, în ordine: sesiunea validă, membership-ul activ în organizația activă, aplicația activă (entitlement de bază), permisiunea rolului și, dacă e dată resursa, apartenența ei la organizație plus politica pe resursă (proprietar, colaborator extern). Erorile sunt tipizate: `NotAuthenticated`, `NotMember`, `AppNotEnabled`, `Forbidden`, `ResourceNotFound`. Accesul la o resursă din altă organizație întoarce `ResourceNotFound`, nu `Forbidden`, ca să nu dezvăluie existența ei.

**Roluri:**
- Owner, Admin, Member și External Collaborator, pe organizație;
- Application Manager, pe aplicație;
- permisiunile sunt declarate în `manifest.ts`.

Rolurile personalizate pe organizație: **NECESITĂ DECIZIE** (D-ACC-2). Modelul de date le permite din prima.

**Founder:** administrarea comercială e separată de accesul la datele clienților. Accesul la date se face doar prin **sesiune de suport**: motiv, durată limitată, `actor: 'support'` în context, audit, vizibilă organizației. Status: CONFIRMAT (brief §41).

### 7.6 Identitatea B2C (Portal)

**Status: CONFIRMAT (separarea, brief §10), CONFIRMAT (înregistrarea liberă a consumatorilor, confirmare directă), PROPUS (implementarea)**

- Tabele separate pentru consumatori, sesiune separată, cookie separat pe domeniul Portal.
- Același email în B2B și B2C nu înseamnă aceeași identitate.
- Legătura consumator ↔ client CRM se face doar explicit, prin integrare autorizată, cu consimțământ.
- O sesiune B2C nu poate apela niciun contract B2B și invers. Asta se testează.

---

## 8. Sistemul comercial

### 8.1 Patru operații distincte

**Status: PROPUS (pe baza corecției #4)**

| Funcție | Ce face | Consumă? |
|---|---|---|
| `authorize(ctx, …)` | Acces: identitate, membership, aplicație activă, permisiune, resursă | Nu |
| `requireFeature(ctx, featureKey)` | Funcționalitatea e inclusă în planul efectiv al organizației | Nu |
| `checkQuota(ctx, quotaKey, amount)` | Informativ: există capacitate? (pentru UI: „ai mai rămas X”, avertizări) | Nu |
| `reserveQuota` / `commitQuota` / `releaseQuota` | Consumul efectiv, legat de operația reală | Da |

Doar verificarea accesului nu consumă niciodată cotă.

### 8.2 Două tipuri de cote

**Cote de flux** (consum pe perioadă: campanii pe lună, analize AI, SMS-uri, exporturi)
- Se consumă prin rezervare. Se resetează după regula definită (perioadă, ciclu de facturare).

**Cote de stoc** (număr de elemente existente: utilizatori, locații, proiecte active)
- Valoarea curentă = numărul real de elemente active, raportat de modulul proprietar prin contract (`countActive(ctx, key)`) sau menținut de un contor actualizat la creare și arhivare.
- La creare se folosește aceeași rezervare, ca să nu treacă două creări simultane peste limită.
- La arhivare sau ștergere se eliberează unitatea.

### 8.3 Consistența între operația de business și cotă

Cota e în schema `core`. Operația de business e în schema modulului, posibil pe alt client sau altă conexiune, deci **nu putem presupune o tranzacție comună**. Se folosește **rezervarea în doi pași**:

```
1. reserveQuota(ctx, key, amount, operationId)
      → UPDATE atomic condiționat: used + reserved + amount <= limit
      → creează QuotaReservation {operationId UNIQUE, status: RESERVED, expiresAt: now + 15 min}
      → același operationId = aceeași rezervare (idempotent la retry)
2. operația de business în modulul propriu (tranzacția lui), cu operationId salvat pe entitate
3a. succes  → commitQuota(operationId): RESERVED → COMMITTED, reserved → used
3b. eșec    → releaseQuota(operationId): RESERVED → RELEASED
4. eșec de proces între 2 și 3 → un job de reconciliere găsește rezervările expirate:
      dacă entitatea cu acel operationId există în modul → commit
      dacă nu există → release
```

- **Concurență:** pasul 1 e un singur `UPDATE ... WHERE used + reserved + amount <= limit`, deci două cereri simultane nu pot depăși limita.
- **Retry:** `operationId` e cheia de idempotență pe toată operația. Un retry nu dublează consumul.
- **Refund:** anularea unei operații deja consumate (de exemplu, o campanie anulată înainte de trimitere) cheamă `refundQuota(operationId)` doar dacă regula cotei permite (`refundable: true` în manifest).
- **Downgrade:** datele nu se șterg. Peste limită se blochează doar crearea, iar citirea și exportul rămân disponibile (CONFIRMAT, brief §14).

**Acceptare (teste reale):**
- 50 de cereri paralele pe o cotă cu 10 unități libere: exact 10 reușesc;
- un proces oprit forțat între pașii 2 și 3 se reconciliază corect;
- un retry cu același `operationId` nu dublează consumul.

### 8.4 Manifestul definește cheile, Founder setează valorile

**Status: CONFIRMAT (principiul, brief §12), PROPUS (mecanismul)**

```ts
// modules/marketing/src/manifest.ts
export const manifest = {
  id: 'marketing',
  permissions: ['marketing.campaign.create', /* ... */],
  features: ['marketing.sms', 'marketing.automations' /* ... */],
  quotas: [{
    key: 'marketing.campaigns', kind: 'flow', unit: 'campaign',
    period: 'billing_cycle', overflow: 'block', refundable: true,
  }],
  events: { emits: ['marketing.campaign.sent.v1'], consumes: ['crm.contact.created.v1'] },
}
```

- La deploy, manifestele se sincronizează în registrul Core.
- Founder poate seta valori doar pentru cheile existente.
- O funcționalitate nouă înseamnă o cheie nouă, deci dezvoltare. Asta e consecvent cu brief §14 („Clarificare importantă”).
- **Ce reprezintă o campanie consumată în Marketing: NECESITĂ DECIZIE** (D-MKT-1). Mecanismul suportă orice definiție.

### 8.5 Planuri, add-on-uri, excepții

**Status: CONFIRMAT (conceptele, brief §13–14), PROPUS (modelul)**

- `PlanVersion` e imuabilă după publicare. Abonamentul e legat de o versiune exactă. Migrarea clienților pe o versiune nouă e o acțiune explicită, cu regulă aleasă de Founder. Publicarea unei versiuni noi și migrarea clienților sunt **două acțiuni separate**.
- **Anunțul la migrare (CONFIRMAT, P19):** când versiunea nouă e în **dezavantajul** clientului (preț mai mare sau mai puțin inclus), migrarea se programează cu **anunț cu cel puțin 30 de zile înainte**, fără excepție. Când e doar în **avantajul** clientului, se aplică imediat, cu anunț. Clasificarea (avantaj/dezavantaj) se calculează automat din diferențele dintre versiuni și se arată în editor; Founder nu o poate ocoli.
- **Excepțiile au termen obligatoriu (CONFIRMAT, P17):** orice override are dată de expirare, **cel mult 12 luni**, prelungibilă explicit (prelungirea e auditată). Cu 7 zile înainte de expirare apare în „Prezentare” din Founder. Excepțiile nu se șterg: se încheie și rămân în istoric.
- **Dreptul efectiv** = PlanVersion + add-on-uri active + excepții (override-uri) active, calculat de o singură funcție. Pattern-ul vine din `get-org-effective-limits.ts`, componenta recomandată de audit (L15). `null` înseamnă nelimitat.
- Orice modificare făcută de Founder → `CommercialAuditEvent`.

### 8.6 Plăți și facturare (Core billing)

**Status: PROPUS, NECESITĂ DECIZIE (D-COM-2)**

- Încasare recurentă cu card prin **Stripe** (contul existent). Abonamentele se creează din panou, fără checkout public cât timp politica e Model A.
- Facturile legale prin **SmartBill** (API, inclusiv e-Factura), declanșate de plata confirmată.
- Varianta de plată manuală (transfer bancar): factură SmartBill + confirmarea încasării de către Founder.
- **Cumpărare de add-on-uri din aplicație (CONFIRMAT, D-COM-6):** proprietarul organizației (sau un rol cu permisiunea `billing.purchase`) poate cumpăra singur add-on-uri (de exemplu, campanii în plus) din pagina de abonament și din dialogul de limită atinsă.
  - Plata se face cu cardul, prin Stripe, cu cardul salvat sau cu unul nou introdus într-un formular Stripe securizat. Datele cardului nu trec niciodată prin serverele Ventora.
  - După confirmarea plății (webhook Stripe idempotent), add-on-ul se activează automat, cota crește imediat, iar factura se emite automat prin SmartBill.
  - Founder vede toate cumpărările și le poate anula sau rambursa din panou. Fiecare cumpărare e auditată (`CommercialAuditEvent`).
  - Prețurile și disponibilitatea fiecărui add-on se configurează de Founder (fără cod). Un add-on poate fi marcat „doar la cerere”, iar atunci rămâne fluxul „Cere activare”.
  - Organizațiile cu plată manuală (fără card) văd „Cere activare” în loc de „Cumpără”.
- **Schimbarea planului** (upgrade/downgrade de plan, nu add-on): **NECESITĂ DECIZIE** (D-COM-7). Rămâne deocamdată prin cerere către Founder.
- **Transparența prețurilor (D-GRW-10, CONFIRMAT):** planurile, add-on-urile și trialurile au în modelul comercial: prețul, periodicitatea, **costurile de implementare** (opționale, o singură dată) și **condițiile trialului** (durata, ce se întâmplă la final, dacă cere card). Toate se afișează înainte de orice confirmare. Nicio activare plătită nu se face fără confirmarea explicită a unei persoane autorizate.
- Webhook-urile Stripe sunt idempotente (`event.id` procesat o singură dată) și testate.

### 8.7 Growth Engine

**Status: CONFIRMAT (direcția, D-GRW-1…11). Nu se implementează încă.** Specificația completă: `docs/GROWTH_ENGINE.md`.

- **Serviciu Core** (`core/growth`), peste `commercial`, `billing`, `notifications`, `audit` și `access`, fără să le dubleze.
- **Aplicațiile declară doar sloturi** (`placements`) și **semnale** (`growthSignals`) în `manifest.ts`. Nu cunosc oferte și nu se referă la alte aplicații. Cu Growth Engine oprit, aplicațiile funcționează identic (test obligatoriu).
- **Semnalele** sunt doar evenimente marcate `growthSafe: true` în catalogul de evenimente, cu payload fără date sensibile (§11.2).
- **Ofertele** trimit la obiecte comerciale existente (aplicație, plan, add-on, trial, pachet). Produsele deținute sunt excluse automat.
- **Două moduri:** recomandări automate pe baza semnalelor și campanii manuale sau programate din Founder, fără cod.
- **Plafoane implicite:** 1 recomandare proactivă pe zi și 3 pe săptămână pe utilizator; cooldown de 30 de zile după respingere. Exceptate: recomandările solicitate explicit și mesajele operaționale despre limite.
- **Limite maxime de siguranță (CONFIRMAT, P25):** Founder poate modifica plafoanele globale doar până la **2 pe zi, 5 pe săptămână și minimum 14 zile** de pauză după respingere. Limitele sunt validate pe server, nu doar în interfață.
- **Oprirea automată (CONFIRMAT, P22):** o campanie (inclusiv una programată) se oprește automat când rata de deranjare („Nu mă interesează” + opriri din preferințe, raportate la afișări) depășește **5%**; oprirea trimite o **notificare către Founder** și se auditează. Repornirea e manuală.
- **Ofertele în limbile aprobate (CONFIRMAT, P20):** o ofertă se afișează doar în limbile în care textele ei sunt aprobate. **Fără fallback pe engleză** — excepție explicită de la regula generală i18n (D-I18N-1), valabilă doar pentru conținutul comercial. Publicarea cere cel puțin textele RO aprobate.
- **Audiența minimă (CONFIRMAT, P23):** o audiență sub **5 afaceri** nu poate fi folosită într-o campanie, iar numărul ei nu se afișează exact („Sub 5 afaceri eligibile”). Scop: nicio afacere nu poate fi țintită individual.
- **Atribuirea (CONFIRMAT, P24):** o conversie se atribuie unei recomandări dacă are loc în **7 zile de la click**. Regula e afișată lângă venitul atribuit.
- **Membrii (CONFIRMAT, P21):** pot fi audiență doar pentru „Recomandă aplicația”, niciodată pentru oferte de cumpărare (validat pe server).
- **Vizibilitate:** proactivele doar pentru Owner/Admin. Membrii descoperă aplicații în catalog și pot transmite o recomandare administratorului, fără drept de cumpărare.
- **Fără activări plătite automate** și transparență completă a costurilor (§8.6).
- **Email comercial dezactivat** până la validarea juridică și consimțământ (D-GRW-8).
- **Oprire centrală** pe trei niveluri (global, campanie, slot), cu efect practic imediat, auditată.
- **Separare strictă** de monetizarea proprie Portal/Network (promovări, profiluri sponsorizate, referral), care rămâne în acele aplicații (D-GRW-9).

**Etapizare:**
- Faza 0: doar pregătiri de schemă (D-GRW-3): câmpurile din manifest, `growthSafe`, categoria notificărilor, preferințele comerciale.
- v1: odată cu Hub-ul, în Faza 5 (D-GRW-4).
- A/B, audiențe avansate, email comercial, AI: după Booking + 2–3 aplicații în producție (D-GRW-5).

---

## 9. Logica comună: patru straturi

**Status: CONFIRMAT (regula anti-duplicare, DESIGN_RULES §9), PROPUS (împărțirea)**

| Strat | Locație | Conține | Regulă |
|---|---|---|---|
| **Servicii Core** | `core/*` | Concepte de business ale platformei: identitate, organizații, acces, comercial, billing, notificări, audit, suport, AI, integrări, fișiere | Au date proprii și contracte. Nu conțin logică de domeniu a vreunei aplicații. |
| **Pachete tehnice** | `packages/*` | Fără concepte de business: `errors` (tipuri de erori + mapare la răspuns și mesaj tradus), `logger` (log structurat cu correlationId), `contracts` (helpers Zod, versionare), `pagination` (paginare și filtrare standard pe server), `upload` (client de upload), `db-kit` (garda de tenant, helpers de tranzacție și outbox), `i18n`, `pdf`, `config`, `testing` (fixturi, suite standard cross-tenant) | Nu depind de module. Nu au date proprii. |
| **Pachete UI** | `packages/ui`, `packages/tokens` | Design system-ul (§10) | Fără logică de domeniu |
| **Logica de domeniu** | `modules/<app>` | Tot ce e specific aplicației | Folosește straturile de mai sus. Nu le duplică. |

**Implementări unice obligatorii:**
- autentificare și sesiuni (`core/identity`);
- permisiuni (`core/access`);
- entitlements și cote (`core/commercial`);
- validare și contracte (`packages/contracts`);
- erori (`packages/errors`);
- audit (`core/audit`);
- notificări (`core/notifications`);
- logging (`packages/logger`);
- localizare (`packages/i18n`);
- teme (`packages/ui` + `packages/tokens`);
- convenții pentru clienții de contract (`packages/contracts`);
- paginare și filtrare (`packages/pagination`);
- upload (`packages/upload`);
- gestionarea fișierelor (`core/files`).

**Anti-pattern interzis:** mutarea în Core a unei funcții doar pentru că două module o folosesc. Dacă e tehnică, merge în `packages/`. Dacă e de domeniu, aparține unui singur modul și se expune prin contractul lui.

---

## 10. Design system și biblioteca comună

### 10.1 Două niveluri de adevăr

**Status: CONFIRMAT (DESIGN_RULES)**

| Nivel | Conține |
|---|---|
| **Design Source of Truth** | Artefactul Claude Design aprobat, exporturile lui (în `docs/design/`), tokens, specificațiile componentelor, referințele vizuale |
| **Engineering Source of Truth** | `VENTORA_SOURCE_OF_TRUTH.md`, contractele componentelor, `packages/ui`, regulile de arhitectură, manifestele, regulile de reutilizare, testele automate |

**Starea exportului de design: CONFIRMAT (24.10.2026).** Designul unificat al ecosistemului (Hub, Founder, cele 13 aplicații de business, componentele comerciale) e aprobat în Claude Design, etapele 1–5. Sursa unică este artefactul Claude Design „Ventora” (https://claude.ai/artifact/7cKaNW6635S7vQavjgY8zH), exportat în `docs/design/system/`: `README.md` (registrul celor 52 de decizii), `tokens.json`, `glossary.md`, `patterns.md`, componentele (README + previzualizare), fonturile și logo-urile oficiale. **Acest document nu definește tokens; valorile vin doar din export.** Exporturile anterioare („Ventora Hub” și launcher-ul) sunt înlocuite și nu se mai folosesc. Portal și Network se proiectează separat (§10.8).

- **Logo:** SVG-urile oficiale din `docs/design/logo/`; în dark se folosește varianta B (CONFIRMAT). Spine-ul din Founder arată semnul + „Founder” (P26); favicon-ul Hub folosește varianta B în dark (P27).
- **Terminologie (CONFIRMAT, D1):** clienții văd doar „abonament”. Cuvântul „plan” apare **doar în Founder Control Center** (unde e termenul tehnic corect). Cheile i18n și glosarul respectă regula.

### 10.2 Reguli

**Status: CONFIRMAT (DESIGN_RULES)**

- Toate aplicațiile folosesc aceleași tokens, aceleași componente, aceeași navigație și același layout (cu variante configurabile), aceleași reguli pentru formulare, tabele, responsive, Light/Dark/System și i18n.
- **Check before create:** caută în `packages/ui` → reutilizează → extinde prin variante documentate → creează o componentă comună nouă doar dacă lipsește → creează o componentă locală doar pentru prezentare specifică domeniului, construită din primitivele comune.
- Interzise ca duplicat: Button, Input, Select, Checkbox, Dialog, Drawer, DataTable, Form/FormField, Tabs, Badge, Tooltip, Pagination, DatePicker, Toast, EmptyState, Skeleton, AppShell, Sidebar/Spine, PageHeader/ContextBar.

### 10.3 Contractul unei componente

**Status: PROPUS**

Fiecare componentă din `packages/ui` are un fișier de contract (`<Component>.contract.md`) cu:

| Secțiune | Conținut |
|---|---|
| Scop | O frază, plus când **nu** se folosește |
| Props | Tipizate, cu valori implicite |
| Variante | Lista închisă (de exemplu `primary | secondary | ghost | danger`) |
| Dimensiuni | `sm | md | lg`, legate de tokens |
| Stări | default, hover, focus-visible, pressed, disabled, error, loading |
| Accesibilitate | Rol ARIA, tastatură, focus, etichete obligatorii |
| Comportament | Interacțiuni, animații (din tokens de durată), `prefers-reduced-motion` |
| Responsive | Comportamentul pe mobil |
| Teme | Verificat în Light și Dark |
| Localizare | Fără texte proprii; etichetele vin din props/i18n; suportă texte cu ~30% mai lungi (germană) |
| Extensibilitate | Ce se poate extinde (slots, render props) și ce nu |
| Teste | Unitare + vizuale (light/dark × RO/DE) |
| Exemple | Utilizarea corectă + anti-exemple |

### 10.4 DataTable: comun vs domeniu

**Status: PROPUS**

**Componenta comună oferă:**
- coloane declarative, cu tipuri de afișare: text, număr, monedă, dată, status, persoană, acțiuni;
- sortare;
- filtre (ca descriptori: tip, opțiuni);
- căutare;
- paginare pe server (contract `packages/pagination`);
- selecție de rânduri și bara de acțiuni în masă;
- vizibilitatea coloanelor;
- densitate;
- empty, loading (skeleton) și error;
- acțiuni pe rând ascunse automat dacă lipsește permisiunea (permisiunea e primită ca prop; verificarea reală rămâne pe server);
- comportament responsive (pe mobil devine listă);
- tastatură;
- localizarea formatării.

**Aplicația oferă:**
- definiția coloanelor;
- sursa de date (funcția de server);
- filtrele disponibile;
- acțiunile și handler-ele lor;
- textele (prin i18n);
- formatarea specifică domeniului (de exemplu, numele statusului unei programări).

**Interzis:** condiții de tip `if (app === 'booking')` în componenta comună. O nevoie nouă comună devine opțiune generică. O nevoie specifică se rezolvă prin coloană sau cell renderer definit în aplicație.

### 10.5 Catalogul vizual

**Status: CONFIRMAT (DESIGN_RULES), PROPUS (implementarea)**

- Ruta `/design` (în dev și staging, nu în producție) prezintă fiecare componentă în variantele aprobate, cu comutatoare de temă și limbă.
- E poarta de acceptare a fazei de design system.

### 10.6 Teme și limbi

**Status: CONFIRMAT (cerințele, brief §15–16), PROPUS (tehnologia)**

- **Teme:** Light / Dark / System. Preferința e salvată în DB și în cookie, ca serverul să randeze direct tema corectă. Pe domeniul `platform` se păstrează automat între aplicații.
- **Limbi:** RO, EN, FR, ES, DE, IT. Fallback EN. Nicio cheie brută afișată.
  - **next-intl** pentru tot ecosistemul (ICU, plurale, formatare dată/număr/monedă, Server Components). Înlocuiește sistemul custom `useT()` din Hub-ul vechi. O singură infrastructură i18n în `packages/i18n` (CONFIRMAT, D-I18N-1).
- **Namespace-uri:** `common` în `packages/i18n`, câte unul pe modul în `modules/<app>/messages/`.
- Emailurile, SMS-urile, notificările și PDF-urile folosesc aceleași cataloage, în limba destinatarului.

### 10.7 Responsive

**Status: CONFIRMAT (D-UI-3), PROPUS (detaliile)**

Toate interfețele (Hub, aplicațiile, Portal, Network, Founder, paginile publice) funcționează și arată bine pe orice dimensiune de ecran din browser. Nu e o adaptare făcută la final.

**Lățimi de referință** (valorile exacte ale breakpoint-urilor vin din design system):

| Clasă | Lățimi de test | Exemple |
|---|---|---|
| Telefon | 360, 390, 430 | telefoane mici, obișnuite, mari |
| Tabletă portret | 768, 820 | iPad, tablete Android |
| Tabletă peisaj / laptop mic | 1024, 1180 | iPad peisaj, laptop 11–13" |
| Laptop / desktop | 1280, 1440 | ecrane obișnuite |
| Ecran lat | 1920, 2560 | monitoare mari: conținutul nu se întinde la nesfârșit (lățime maximă din design) |

**Reguli:**

- Fără scroll orizontal al paginii la nicio lățime. Tabelele late derulează doar în containerul lor sau devin liste (comportamentul DataTable, §10.4).
- **Tableta nu e „telefon mare” și nici „desktop mic”.** Are layout propriu unde designul îl definește: navigație compactă, drawer-e potrivite, formulare pe una sau două coloane.
- **Touch:** ținte de atingere ≥ 44×44 px pe telefon și tabletă. Nicio acțiune nu e disponibilă doar la hover (acțiunile de rând au și varianta pentru touch).
- Orientarea portret și peisaj funcționează pe telefon și tabletă.
- Textele mai lungi (DE, FR, IT) nu rup layout-ul la nicio lățime.
- Zoom-ul browserului la 200% păstrează conținutul utilizabil (accesibilitate).
- Imaginile și graficele se scalează. Graficele au variantă lizibilă pe telefon.

**Acceptare:** fiecare ecran e verificat la lățimile de test din tabel, în Light și Dark (testul T10, §13.2). Un ecran care merge doar pe desktop nu e terminat.

### 10.8 Portal și Network: identitate vizuală proprie

**Status: CONFIRMAT (D-UI-4, varianta A), PROPUS (structura tehnică)**

Portal (consumatori) și Network (rețea profesională) **nu** arată ca restul aplicațiilor. Fiecare are design propriu: culori, tipografie, compoziție, stil de navigație și ecrane proiectate separat în Claude Design. Brief §15 permite explicit identități vizuale proprii, cu condiția mecanismului comun de teme.

**Ce e comun (fundația tehnică, o singură implementare):**

- structura tokens (aceleași nume semantice: `canvas`, `ink`, `primary`, `attention` etc.), cu **valori proprii** pentru fiecare familie vizuală;
- mecanismul de teme Light / Dark / System și persistența preferinței;
- i18n (next-intl, cele 6 limbi, formatarea);
- regulile de responsive (§10.7), accesibilitate și contrast;
- **primitivele de comportament**: dialog, meniu, tooltip, focus, tastatură, date picker, upload, paginare. Logica și accesibilitatea sunt comune; aspectul vine din tokens și stilurile familiei;
- identitatea Core (pentru Network), autorizarea, notificările, fișierele.

**Ce e propriu fiecărei familii:**

- valorile tokens (paleta, tipografia, razele, umbrele, ritmul spațierii);
- componentele vizuale și compozițiile specifice (carduri de feed, profiluri, layout-uri sociale, navigație);
- ecranele.

**Structura propusă:**

```
packages/
├── tokens/              # schema comună + seturile de valori
│   ├── business/        # Hub, Founder, cele 13 aplicații (designul aprobat)
│   ├── portal/          # identitatea Portal (de proiectat)
│   └── network/         # identitatea Network (de proiectat)
├── ui-primitives/       # comportament + accesibilitate, fără aspect propriu
├── ui/                  # componentele familiei business
├── ui-portal/           # componentele vizuale Portal (construite din primitive)
└── ui-network/          # componentele vizuale Network (construite din primitive)
```

**Reguli:**

- În interiorul fiecărei familii rămâne regula „fără duplicate” și „check before create” (DESIGN_RULES).
- O componentă vizuală de familie nu își reimplementează comportamentul. Folosește primitiva comună.
- Punctele de contact cu Hub-ul (tile-ul și iconul aplicației în launcher, AppLaunch) rămân în designul business. Iconurile Portal și Network fac parte din familia celor 15.
- Partea business a Portal (dashboard-ul afacerii, D-POR-1) și designul Portal/Network se proiectează înainte de construirea fiecăreia, ca proiecte separate de Claude Design.
- DESIGN_RULES.md se actualizează cu această excepție (sursă de rang 4).

### 10.9 UX writing și microcopy

**Status: CONFIRMAT (D-UX-1)** — regula completă: DESIGN_RULES.md §13.

- Un ecran e finalizat doar după ce textele lui (inclusiv cele din toate stările) au trecut prin revizuirea editorială și au fost aprobate de fondatori.
- Terminologia vine din glosarul unic `docs/ux-writing/GLOSAR.md`.
- Textele aprobate ajung în cod doar ca chei next-intl, cu textul RO aprobat ca sursă și traducerile în celelalte 5 limbi.
- **Cine verifică traducerile** EN/FR/ES/DE/IT (vorbitor nativ, serviciu profesional sau revizuire asistată): **NECESITĂ DECIZIE** (D-UX-2), înainte de primul lansament public.

### 10.10 Experiența de produs și măsurarea ei

**Status: CONFIRMAT (D-PX-1, standardul), NECESITĂ DECIZIE (D-PX-2, instrumentul de măsurare)**

- Fiecare ecran trece prin review-ul A–E din DESIGN_RULES §15 înainte de a fi considerat finalizat (criteriu de acceptare, alături de T7, T8 și T10).
- **Compatibilitatea cu Growth Engine:** oportunitățile de upsell sau cross-sell identificate în review (întrebarea 9, etapa C) devin **propuneri de sloturi sau campanii Growth Engine** (§8.7). Nu se desenează elemente comerciale direct în ecrane și nu se adaugă trimiteri directe între aplicații. Momentele de onboarding, activare și descoperire care nu sunt comerciale (de exemplu, o listă de pași de pornire într-o aplicație) aparțin aplicației și nu trec prin Growth Engine.
- **Măsurarea (întrebarea 10)** cere instrumentarea experienței de produs, care azi nu există în arhitectură: Sentry acoperă erorile, iar Growth Engine doar afișările și conversiile ofertelor. Propunerea:
  - evenimente de produs standardizate (`<app>.<ecran>.<acțiune>`), definite în manifestul aplicației și emise printr-un singur helper comun (`packages/analytics`);
  - fără date personale sau sensibile în evenimente (doar ID-uri opace, rolul, aplicația, organizația);
  - respectarea consimțământului pentru analytics, acolo unde legea o cere;
  - indicatorii din fișele de review se calculează din aceste evenimente;
  - instrumentul: **NECESITĂ DECIZIE** (D-PX-2). Opțiuni: PostHog (cloud UE sau self-hosted), evenimente proprii în Postgres + dashboard în Founder, sau alt serviciu. Decizia trebuie luată înainte de F5 (Hub), iar regula „fără date sensibile” se aplică oricum.
- **Proporționalitatea review-ului:** **NECESITĂ DECIZIE** (D-PX-3). Propunere: review complet pentru ecranele-cheie (onboarding, „Azi”, fluxurile principale, plăți, limite, ecranele cu impact comercial) și review prescurtat (doar etapele cu modificări, pe aceeași fișă) pentru ecranele construite integral din pattern-uri deja aprobate (liste, formulare standard, setări simple).

---

## 11. Integrarea dintre module

### 11.1 Contracte sincrone

**Status: PROPUS**

- Fiecare modul expune `src/contract/` cu funcții tipizate. Input și output sunt validate cu scheme Zod din `packages/contracts`. Contractul are versiune (`booking.contract.v1`).
- **Un apel de contract nu accesează niciodată baza de date a altui modul.** Modulul destinatar își citește propriile date, cu propriul client.
- **Identitatea apelantului:** fiecare apel primește `TenantContext` + `caller: { app, actor }`. Contextul nu se construiește din parametri primiți de la client.
- **Autorizarea în modulul destinatar:** destinatarul verifică singur că:
  - organizația are aplicația activă (altfel `AppNotEnabled`);
  - integrarea dintre cele două aplicații e permisă pentru organizație;
  - actorul are permisiunea necesară.
  Nu se bazează pe verificările apelantului.
- **Aplicație inactivă:** apelantul primește `AppNotEnabled` și afișează varianta fără integrare. Exemplu: Portal fără Booking arată „Contactează afacerea” în loc de „Rezervă”. Fiecare integrare are comportamentul fără destinatar documentat în manifestul apelantului.
- **Erori:** tipizate (`packages/errors`), niciodată excepții brute traversând granița.
- **Idempotență:** operațiile care creează sau modifică acceptă `idempotencyKey`.
- **Timeouts și retry:** irelevante cât timp apelul e în proces. Sunt definite în contract (operație idempotentă sau nu) pentru momentul în care transportul devine rețea.
- **Evoluție:** o schimbare incompatibilă înseamnă o versiune nouă de contract, iar cea veche rămâne până nu mai are apelanți.

**Limita promisiunii:** un apel direct de funcție **nu** devine automat un apel HTTP fără adaptări. Contractele sunt proiectate să permită trecerea (input/output serializabil, fără obiecte partajate, fără tranzacții între module, erori serializabile), dar trecerea va cere adaptări controlate: transport, autentificare între servicii, timeouts reale.

### 11.2 Evenimente asincrone

**Status: PROPUS**

- **Outbox în schema modulului**, scris în aceeași tranzacție cu schimbarea de date.
- **Plicul evenimentului:** `eventId` (UUIDv7), `type`, `version`, `occurredAt`, `organizationId`, `sourceApp`, `resourceId`, `correlationId`, `payload` validat.
- **Consumatori idempotenți** (tabel `processed_events` pe consumator).
- **Retry** cu backoff, apoi dead-letter vizibil.
- **Livrare** doar dacă organizația are ambele aplicații active și integrarea e permisă.
- **Evoluția evenimentelor:**
  - adăugarea de câmpuri opționale = aceeași versiune;
  - orice schimbare incompatibilă = versiune nouă (`.v2`), publicată în paralel cât timp există consumatori ai versiunii vechi.
- **Fără event bus complex înainte de un caz real.** Primul pas: outbox + dispatcher + un serviciu de job-uri. Primul caz real: remindere Booking și notificări.

### 11.3 Job-uri de fundal

**Status: PROPUS, NECESITĂ DECIZIE (D-INF-2)**

- Vercel e serverless și nu are worker permanent. Propunere: **Inngest** (retry, delay, pași durabili, compatibil Vercel).
- Alternative: Trigger.dev, sau pg-boss + worker pe Railway/Fly.
- Pe acest serviciu rulează: outbox dispatch, notificări, remindere, automatizări predefinite, reconcilierea cotelor și a referințelor, rapoarte programate.

### 11.4 API-uri externe

**Status:** CRM, Analytics, Assets, Network → **CONFIRMAT** (brief §35 și checklisturi). Contracts, Inventory, Shifts, Marketing, Projects, Finance, Portal → **CONFIRMAT ca excluse**. Booking, Documents, Events, HR → **nu sunt în checklisturi, deci nu se construiesc** (CONFIRMAT, D-API-1).

Implementare (PROPUS): chei API pe organizație (hash, scope-uri), rate limiting, webhooks semnate HMAC, log de livrare, versiune în URL (`/api/v1`). E un strat separat peste contractul modulului.

---

## 12. Securitate și izolare multi-tenant

**Status: CONFIRMAT (cerința „din prima zi”), PROPUS / DE VALIDAT TEHNIC (mecanismele)**

### 12.1 Straturile izolării, toate din fundație

1. **TenantContext pe server.** Se stabilește doar de `authorize()` (sau `withSystemContext` / sesiunea de suport). Nu se citește niciodată din request.
2. **Autorizare la fiecare operație sensibilă** (§7.5), inclusiv verificarea apartenenței resursei la organizație.
3. **Filtrare obligatorie după organizație** prin stratul de acces la date din `packages/db-kit`. Garda **aruncă eroare** dacă lipsește contextul. Nu doar loghează (lecția S1 din audit).
4. **Row Level Security** pe tabelele care aparțin organizațiilor. Ca apărare în adâncime, nu ca unic strat.
5. **Rol Postgres pe modul** (§6.1).
6. **Acces de sistem** doar prin `withSystemContext(reason)`: explicit, auditat, interzis în codul de request al utilizatorilor (verificat prin lint).

### 12.2 Limitele gărzii din aplicație

O extensie ORM care injectează `organizationId` **nu** acoperă sigur:

- query-urile raw;
- scrierile nested (relații create sau actualizate în aceeași operație);
- operațiile în masă (`updateMany`, `deleteMany` fără filtru corect);
- agregările și query-urile cu JOIN construite manual.

**Reguli:**
- Query-urile raw sunt interzise în module, cu excepția unui helper aprobat din `db-kit` care cere `TenantContext` (verificat prin lint).
- Operațiile în masă trec prin helpers care impun filtrul de organizație.
- Aceste limite sunt **motivul pentru RLS**: baza de date refuză rândurile altei organizații chiar dacă aplicația greșește.

### 12.3 RLS: decizie înainte de primul modul cu date reale

**Status: DE VALIDAT TEHNIC (Faza 0), apoi NECESITĂ DECIZIE (D-SEC-1)**

Recomandare: **RLS activ din prima** pe tabelele organizațiilor, dacă experimentul din Faza 0 confirmă că funcționează curat. De definit și testat:

- **Politici pe categorii de tabele:**
  - date de organizație: `organization_id = current_setting('app.org_id')::uuid`;
  - date ale utilizatorului;
  - date publice (de exemplu, profiluri publice): politică separată de citire;
  - date de sistem: doar rolul de sistem.
- **Propagarea contextului:** `SET LOCAL app.org_id` (și `app.actor`) la începutul fiecărei tranzacții, prin stratul `db-kit`. Fiecare operație rulează într-o tranzacție.
- **Connection pooling:** cu pooler-ul Supabase în transaction mode, doar `SET LOCAL` în interiorul tranzacției e sigur. `SET` la nivel de sesiune e interzis, pentru că s-ar scurge către alte request-uri. Se testează explicit.
- **Tranzacții:** contextul e valabil doar în tranzacția curentă. Job-urile de fundal își setează contextul la fiecare tranzacție, din plicul evenimentului.
- **Roluri:** rolul de aplicație al modulului nu are `BYPASSRLS`. Rolul de migrare e separat. Rolul de sistem (`withSystemContext`) e separat și auditat.
- **Teste care dovedesc izolarea** (§13.2).

### 12.4 Restul securității

**Status: CONFIRMAT (corecția #11)**

- Sesiuni revocabile (§7.1).
- Separare B2B/B2C testată.
- Acces Founder la date doar prin sesiune de suport auditată.
- Secrete validate la pornire (minimum 32 de caractere unde e cazul) și detectate în repo (gitleaks).
- AI: modelul și prompt-urile de sistem sunt configurate în DB, inputul utilizatorului nu intră în prompt-ul de sistem, iar acțiunile cu efecte cer confirmare și trec prin `authorize()`.
- Fișiere: doar URL-uri semnate și cu expirare, generate după autorizare.

---

## 13. Testare și garduri automate

### 13.1 Principiu

**Status: CONFIRMAT (corecția #11)**

Testele verifică **comportamentul real**. Un control de tipul „handler-ul conține `authorize()`” e doar un indicator ieftin. **Nu** dovedește securitatea. Securitatea se dovedește prin teste care încearcă efectiv accesul interzis. Testele decorative (care trec fără să verifice ceva) sunt interzise la review.

### 13.2 Setul minim obligatoriu pentru fiecare aplicație

**Status: PROPUS**

O aplicație nu trece din `In development` în `Internal testing` fără:

| # | Test | Ce dovedește |
|---|---|---|
| T1 | **Cross-tenant:** pentru fiecare contract și fiecare rută, utilizatorul din org A încearcă să citească, creeze, modifice și șteargă resurse din org B, cu ID-uri valide ale lui B | Toate întorc `ResourceNotFound`, iar datele lui B rămân neschimbate |
| T2 | **RLS direct:** query-uri pe tabele cu contextul altei organizații, inclusiv raw, bulk și nested | Baza de date nu întoarce și nu modifică rânduri străine |
| T3 | **Matricea de permisiuni**, generată din manifest: fiecare rol × fiecare permisiune × fiecare rută/contract | Exact permisiunile declarate trec, restul primesc `Forbidden` |
| T4 | **Aplicație inactivă:** organizație fără aplicație → contractele întorc `AppNotEnabled`, iar integrările din alte aplicații arată varianta fără integrare | Nicio dependență ascunsă |
| T5 | **Cote:** concurență (exact N din M cereri), retry cu același `operationId`, proces oprit între pași, downgrade | Fără depășiri, fără dublă contorizare |
| T6 | **Evenimente:** livrare dublă = efect unic; consumator eșuat → dead-letter | Idempotență |
| T7 | **i18n:** fiecare cheie în cele 6 limbi; niciun ecran nu afișează chei brute; textele RO corespund versiunii aprobate la revizuirea de microcopy (D-UX-1) | Localizare completă și aprobată |
| T8 | **Teme și vizual:** ecranele principale în Light/Dark × RO/DE | Fără componente ilizibile, fără texte rupte |
| T9 | **Migrații:** aplicate pe o bază curată, fără drift | Schemă reproductibilă |
| T10 | **Responsive:** ecranele principale la lățimile de test din §10.7 (telefon, tabletă portret și peisaj, laptop, ecran lat), cu verificare automată că nu există scroll orizontal și că țintele de atingere au minimum 44px pe touch; capturi vizuale la cel puțin 390, 768, 1024 și 1440 | Utilizabil pe orice ecran |

Plus, la nivel de platformă: teste de webhook Stripe (semnătură, idempotență, ordine), test de revocare a sesiunii, test de retrogradare, test de separare B2B/B2C, test de sesiune de suport.

### 13.3 Garduri automate în CI

**Status: PROPUS**

| Regulă | Control |
|---|---|
| Import doar prin `src/contract` între module | `eslint-plugin-boundaries` / dependency-cruiser |
| Fără acces la clientul de date al altui modul | Lint + drepturi Postgres (și T2) |
| Fără query-uri raw în afara helper-ului aprobat | Regulă ESLint custom |
| Fără `withSystemContext` în codul de request | Regulă ESLint custom |
| Fără text UI hardcodat | `eslint-plugin-i18next` |
| Chei în toate cele 6 limbi | Script `i18n:check` |
| Fără culori sau valori arbitrare în afara tokens | Lint pe clase arbitrare / Stylelint |
| Fără componente comune duplicate, fără `<select>` nativ | Lint pe elemente și importuri interzise |
| Fără drift de schemă | Migrații pe DB curată + diff |
| Secrete | Gitleaks |
| Verificarea standard | `build` + `test` + `lint` + `typecheck`, toate obligatorii |

---

## 14. Deployment și medii

**Status: PROPUS; domeniile CONFIRMAT (D-INF-1)**

- **Medii:** `local` (Supabase local), `staging`, `production`, fiecare cu proiect Supabase separat. Fără date de producție în dezvoltare.
- **Domenii (CONFIRMAT):** ecosistemul folosește `ventora-hub.com`: `app.ventora-hub.com` (platform), `portal.ventora-hub.com` (portal), `founder.ventora-hub.com` (founder). Website-ul corporate e `ventorasystems.com`, separat de ecosistem. Nu se introduc alte domenii fără aprobare.
- **Cookie-uri:** sesiunea B2B e emisă doar pentru `app.ventora-hub.com` (host-only, nu pe `.ventora-hub.com`), sesiunea B2C doar pentru `portal.ventora-hub.com`, sesiunea Founder doar pentru `founder.ventora-hub.com`. Nicio sesiune nu se partajează între subdomenii.
- **Vercel:** trei proiecte (§3.1), cu preview pe PR legat de staging. Domeniile de staging: **NECESITĂ DECIZIE** (propunere: `staging-app.ventora-hub.com` etc. sau doar URL-urile Vercel).
- **CI (GitHub Actions):** setul din §13.3 + testele T1–T9. Merge doar pe verde.
- **Migrațiile de producție** rulează în pipeline, înainte de promovare. Niciodată manual.
- **Backup:** zilnic + PITR. Test de restaurare periodic.
- **Observabilitate:** Sentry, log-uri structurate cu `correlationId` și `organizationId`, dashboard de job-uri.

---

## 15. Roadmap pe livrabile

**Status: PROPUS.** Fără estimări în luni. Termenele se stabilesc după măsurarea vitezei reale din Faza 0 și Faza 1.

### 15.1 Etapele fundației

| Etapă | Livrabil | Depinde de | Acceptare |
|---|---|---|---|
| **F0 — Repo și experimente** | Monorepo, CI, garduri, validarea mediului, `CLAUDE.md`, documente în `docs/`; experimentele din §17.3 cu raport și ADR-uri | Aprobarea v0.2 | CI verde; raportul experimentelor aprobat; deciziile D-DB-1 și D-SEC-1 luate |
| **F1 — Design system** | `packages/tokens`, `packages/ui` cu contracte, `packages/i18n`, `/design` | Exportul Claude Design aprobat (cel puțin etapa 1) | Fiecare componentă aprobată pe `/design` în Light/Dark × 6 limbi |
| **F2 — Identitate și acces** | Identitate, sesiuni, invitații, organizații, membership, organizația activă, `authorize()`, `db-kit` cu gardă și RLS, audit | F0 | T1, T2, T3 verzi pe un modul de probă; revocare și retrogradare testate |
| **F3 — Comercial** | Registru aplicații, planuri și versiuni, entitlements, cote cu rezervare, add-on-uri, excepții, billing Stripe + SmartBill, aplicația `founder` | F2 | T5 verde; schimbarea unei limite fără deploy; plata → factura; audit pe acțiunile Founder |
| **F4 — Servicii de platformă** | Outbox + job-uri, notificări (6 limbi), suport, cadrul AI, fișiere, `pdf` | F2 | T6 verde; notificare în limba destinatarului; tichet din orice aplicație |
| **F5 — Hub** | Autentificare, alegerea organizației, launcher (4 stări de acces), setări cont, administrarea organizației, suport; **Growth Engine v1** (§8.7) cu componentele comerciale și secțiunea Growth & Campaigns din Founder | F1, F2, F3 (parțial: entitlements), F4 (parțial: notificări) | Fluxurile Hub testate end-to-end în Light/Dark × 6 limbi; testele Growth: produsele deținute nu apar, plafoanele și opt-out-ul se respectă, oprirea are efect imediat, aplicațiile funcționează identic cu Growth oprit, nicio activare plătită fără confirmare |

### 15.2 Ce se poate face în paralel

- **F1** (design system) merge în paralel cu **F0** și **F2**, după ce exportul de design e aprobat.
- **F3** și **F4** merg în paralel după F2.
- **Nu** încep înainte de stabilizare:
  - aplicațiile, înainte de F2 (acces) și de primele componente F1;
  - integrările între aplicații, înainte de F4 (outbox);
  - consumul de cote dintr-o aplicație, înainte de F3.

### 15.3 Aplicațiile: fluxuri verticale, fără reducerea scope-ului

**Status:** Booking ca prima prioritate: **CONFIRMAT**. Dezvoltarea pe fluxuri verticale în paralel: **CONFIRMAT (corecția #7)**.

- După fundație, dezvoltarea continuă pe **fluxuri verticale complete**: fiecare e testat (T1–T9 pe partea lui) și demonstrabil.
- **Booking** e primul. Exemplu de secvențiere: calendar + servicii + disponibilitate + programări → rezervare publică → remindere și automatizări → plăți și avansuri → rapoarte → AI contextual.
- În paralel, când fundația e stabilă, pot începe fluxurile de bază ale altor aplicații. Exemple: CRM (contacte, leaduri, pipeline), Documents (structură și upload), HR (angajați și organizație).
- **Acestea sunt doar secvențieri tehnice.** Checklisturile confirmate rămân integral în scope. O aplicație ajunge `Production ready` doar cu tot checklistul (§5.2).
- **Condiția paralelismului:** fluxurile paralele nu modifică simultan pachetele comune. O schimbare în `packages/ui` sau `core/*` se face într-un PR separat, cu review și testele tuturor modulelor afectate.
- Ordinea aplicațiilor după Booking: **NECESITĂ DECIZIE** (D-ROAD-1), pe baza priorităților comerciale. Propunere de pornire: CRM → Marketing → Finance → HR → Shifts → Documents → Contracts → Projects → Inventory → Assets → Events → Analytics → Network → Portal.

### 15.4 Riscuri

| Risc | Atenuare |
|---|---|
| Volumul total (~1.400 de funcționalități confirmate) cu o echipă mică | Fundația se face o singură dată; fluxuri verticale; viteza se măsoară înainte de orice termen |
| Claude Code ignoră regulile în timp | Garduri automate (§13.3), teste comportamentale (§13.2), review la fiecare etapă |
| Experimentele din F0 eșuează pentru varianta preferată | Alternativele B și C sunt evaluate în același experiment |
| Paralelismul destabilizează pachetele comune | PR-uri separate pentru pachetele comune, cu testele tuturor modulelor |
| Traduceri în 6 limbi la fiecare text nou | Cheia intră cu toate traducerile în același PR; CI blochează altfel |
| Juridic: spin wheel + VeeCoin, conturi de familie, recenzii verificate, acceptarea OTP | Verificare juridică înainte de construirea fluxurilor respective |

---

## 16. Registrul contradicțiilor și dependențelor

| ID | Subiect | Situație | Status |
|---|---|---|---|
| C1 | Checklisturile originale | Furnizate prin specificația completă; extrase în `docs/checklists/` (15 fișiere, 1.465 de funcționalități) | CONFIRMAT |
| C2 | API/Webhooks externe pentru Booking, Documents, Events, HR | Checklisturile acestor patru aplicații nu conțin API/Webhooks externe (nici ca funcționalitate, nici ca excludere). API extern apare ca funcționalitate doar în CRM, Analytics, Assets și Network. Deci nu sunt în scope. | CONFIRMAT (din checklisturi) |
| C3a | AI ca aplicație separată | Brief §38: contextual, nu a 16-a aplicație | CONFIRMAT (nu e aplicație) |
| C3b | Messaging ca aplicație separată | Brief: mesageria apare în Portal și Network, nu ca aplicație | CONFIRMAT (nu e aplicație) |
| C3c | Funnel builder (există în Hub-ul vechi) | Checklistul Marketing conține „Lead Capture & Landing Pages” (10 funcționalități: formulare, landing pages, șabloane, formulare încorporabile). Landing pages aparțin Marketing; funnel builder-ul vechi nu devine aplicație separată. | CONFIRMAT (din checklist) |
| C4 | Ce e o campanie consumată / campaniile multi-pas | Brief §25 lasă explicit deschis | NECESITĂ DECIZIE |
| C5 | Founding 100 după lansare | Nu apare în brief ca parte a platformei | NECESITĂ DECIZIE |
| C6 | Denumirea în launcher („Your Booking” vs „Booking”) | Brief §2 dă „Your Booking” ca exemplu | NECESITĂ DECIZIE |
| C7 | Organizațiile cu doar Portal sunt Organization în Core, create tot de Founder | Consecvent cu brief §10 și politica de invitație | PROPUS |
| C8 | Purolite | Aplicație separată pentru Ecolab, **nu** intră în ecosistem | CONFIRMAT |
| C9 | Două exporturi de design care se contrazic („Ventora Hub” vs „Ventora”-launcher) | Înlocuite de designul unificat în lucru | NECESITĂ DECIZIE (aprobarea designului unificat) |
| C10 | Profilurile de afacere în Portal și Network | Risc de modele duplicate (§5.1) | NECESITĂ DECIZIE (D-PROF-1) |
| C11 | Pagini publice Network | Brief-ul nu spune dacă există | NECESITĂ DECIZIE (D-NET-1) |
| C12 | Partea business a Portal: în `portal` sau în `platform` | §3.1 | NECESITĂ DECIZIE (D-POR-1) |
| C13 | Clienții reali din Hub-ul vechi | Nu există clienți reali activi; nu se migrează date. Hub-ul vechi rămâne doar sursă de cod și idei (auditul de recoltare, 24.10.2026). Repository-ul, datele și resursele lui nu se șterg fără aprobare explicită. | CONFIRMAT |

---

## 17. Decizii, modificări, experimente, informații lipsă

### 17.1 Tabelul deciziilor

| ID | Decizie | Recomandare | Status | Necesită aprobare |
|---|---|---|---|---|
| D-ARCH-1 | Monolit modular într-un monorepo | Da | CONFIRMAT | Nu |
| D-ARCH-2 | Trei deployment-uri: platform / portal / founder | Da; Network în platform | PROPUS | Da |
| D-ARCH-3 | Structura `apps / modules / core / packages` | Da | PROPUS | Da |
| D-DB-1 | Organizarea bazei de date: varianta A sau B (§6.2) | Decisă după experiment | Prisma + PostgreSQL/Supabase: CONFIRMAT (specificație); A vs B: DE VALIDAT TEHNIC; C (Drizzle) ar contrazice specificația, deci doar cu decizia fondatorilor | Da, după F0 |
| D-DB-2 | Scheme Postgres separate + roluri pe modul | Da | PROPUS | Da |
| D-DB-3 | Migrații obligatorii, fără `db push` | Da | CONFIRMAT | Nu |
| D-DB-4 | Integritatea între domenii (§6.4) | Ca în §6.4 | PROPUS | Da |
| D-DB-5 | UUIDv7 | Da | PROPUS | Da |
| D-SEC-1 | RLS din prima pe tabelele organizațiilor | Da, dacă experimentul confirmă | DE VALIDAT TEHNIC | Da, după F0 |
| D-SEC-2 | Garda de tenant care aruncă eroare + interzicerea raw queries | Da | PROPUS | Da |
| D-AUTH-1 | Sesiuni în DB, fără roluri în token | Da | CONFIRMAT (cerința de sesiuni revocabile) | Nu |
| D-AUTH-2 | Librăria Better Auth | Da | CONFIRMAT (specificație) | Nu |
| D-COM-1 | Politica inițială B2B: doar invitație, organizații create de Founder | Da | CONFIRMAT | Nu |
| D-COM-2 | Stripe pentru încasare + SmartBill pentru facturi | Da | CONFIRMAT (specificație); varianta de plată manuală: PROPUS | Doar plata manuală |
| D-COM-3 | Modelul de date extensibil spre self-service (§7.2) | Da | PROPUS | Da |
| D-COM-4 | Activarea self-service | Nu acum | NECESITĂ DECIZIE (viitor) | Da |
| D-COM-5 | Autorizare separată de cote; rezervare/commit/release (§8) | Da | PROPUS | Da |
| D-COM-6 | Proprietarul cumpără singur add-on-uri din aplicație, cu cardul (Stripe), activare automată, factură SmartBill automată (§8.6) | Da | CONFIRMAT | Nu |
| D-COM-7 | Schimbarea planului direct din aplicație (cu plată) vs. prin cerere | Prin cerere deocamdată | NECESITĂ DECIZIE | Da |
| D-ACC-1 | Roluri de sistem + Application Manager, permisiuni în manifest | Da | PROPUS | Da |
| D-ACC-2 | Roluri personalizate pe organizație | Mai târziu; modelul le permite | NECESITĂ DECIZIE | Da |
| D-B2C-1 | Înregistrare liberă pentru consumatori, identitate separată | Da | CONFIRMAT | Nu |
| D-UI-1 | Un design system, check before create, contracte de componente | Da | CONFIRMAT | Nu |
| D-UI-2 | Radix/shadcn ca bază pentru primitive | Da | PROPUS | Da |
| D-GRW-1…5, 9 | Growth Engine: serviciu Core, sloturi + semnale, pregătiri în F0, v1 în F5, funcții avansate ulterior, separare de monetizarea Portal/Network | Da | CONFIRMAT | Nu |
| D-GRW-6 | Plafoane: 1/zi, 3/săptămână, cooldown 30 de zile; exceptate cele solicitate și mesajele de limită | — | CONFIRMAT | Nu |
| D-GRW-7 | Proactive doar Owner/Admin; membrii descoperă și transmit recomandări, fără cumpărare | — | CONFIRMAT | Nu |
| D-GRW-8 | Email comercial dezactivat până la validarea juridică și consimțământ | — | CONFIRMAT; validarea juridică: NECESITĂ DECIZIE | Da, validarea |
| D-GRW-10 | Nicio activare plătită fără confirmare explicită; costuri transparente (preț, periodicitate, implementare, trial) | — | CONFIRMAT | Nu |
| D-GRW-11 | Recomandări automate + campanii manuale/programate din Founder, fără cod | — | CONFIRMAT | Nu |
| D-PX-1 | Global Product Experience & Behavioral Design: 10 întrebări și review A–E pentru fiecare ecran, în toate cele 15 aplicații, Hub și Founder (DESIGN_RULES §15) | Da | CONFIRMAT | Nu |
| D-PX-2 | Instrumentul de analytics de produs (PostHog UE / evenimente proprii / altul) | De ales înainte de F5 | NECESITĂ DECIZIE | Da |
| D-PX-3 | Review complet pentru ecranele-cheie, prescurtat pentru ecranele din pattern-uri aprobate | Da | NECESITĂ DECIZIE | Da |
| D-UX-1 | Revizuire de UX writing și aprobarea textelor după fiecare ecran; glosar unic (§10.9, DESIGN_RULES §13) | Da | CONFIRMAT | Nu |
| D-UX-2 | Cine verifică traducerile în EN/FR/ES/DE/IT | — | NECESITĂ DECIZIE | Da, înainte de lansare |
| D-UI-4 | Portal și Network: identitate vizuală proprie, fundație tehnică comună (varianta A, §10.8) | Da | CONFIRMAT | Nu |
| D-UI-3 | Responsive obligatoriu: telefon, tabletă, laptop, desktop, ecran lat (§10.7) | Da | CONFIRMAT | Nu |
| D-MOB-1 | Aplicație mobilă nativă a ecosistemului, la final; logica apelabilă din afara Next.js de acum (§3.2) | Da | CONFIRMAT (obiectivul), PROPUS (mecanismul) | Mecanismul |
| D-MOB-2 | Tehnologia și momentul aplicației mobile | Decis mai târziu | NECESITĂ DECIZIE | Da, mai târziu |
| D-I18N-1 | next-intl în locul `useT()` custom; fallback EN | Da | CONFIRMAT | Nu |
| D-I18N-2 | Limbile ecosistemului: RO, EN, FR, ES, DE, IT (italiana adăugată pe 24.10.2026) | Da | CONFIRMAT | Nu |
| D-INF-1 | Domeniile: `app.`, `portal.`, `founder.ventora-hub.com`; corporate `ventorasystems.com` | — | CONFIRMAT | Nu |
| D-INF-3 | Domeniile de staging | Subdomenii dedicate sau URL-uri Vercel | NECESITĂ DECIZIE | Da |
| D-MIG-1 | Fără migrare de date din Hub-ul vechi; repo-ul vechi rămâne read-only, nimic nu se șterge fără aprobare | — | CONFIRMAT | Nu |
| D-INF-2 | Inngest + outbox pentru job-uri și evenimente | Da | CONFIRMAT (specificație) | Nu |
| D-API-1 | API extern pentru Booking, Documents, Events, HR | Nu sunt în checklisturi, deci nu se construiesc | CONFIRMAT (din checklisturi) | Nu |
| D-NET-1 | Pagini publice Network | — | NECESITĂ DECIZIE | Da |
| D-POR-1 | Partea business a Portal în `platform` | Da | NECESITĂ DECIZIE | Da |
| D-PROF-1 | Profil public comun în Core | Doar identitatea de bază în Core; extensiile separate | NECESITĂ DECIZIE | Da |
| D-MKT-1 | Definiția campaniei consumate | — | NECESITĂ DECIZIE | Da |
| D-AUTH-3 | 2FA obligatoriu pentru Owner: grație 14 zile, coduri de recuperare, cod pe dispozitiv nou (P5, D10) | Da | CONFIRMAT | Nu |
| D-ACC-3 | Invitațiile expirate ies din listă după 30 de zile, rămân în audit (P6) | Da | CONFIRMAT | Nu |
| D-COM-8 | Excepții cu termen obligatoriu, maximum 12 luni, prelungibile (P17) | Da | CONFIRMAT | Nu |
| D-COM-9 | Migrarea pe o versiune nouă de plan: anunț de 30 de zile dacă e în dezavantajul clientului; imediat, cu anunț, dacă e în avantaj (P19) | Da | CONFIRMAT | Nu |
| D-GRW-12 | Oferte doar în limbile aprobate, fără fallback EN (P20) | Da | CONFIRMAT | Nu |
| D-GRW-13 | Oprire automată la rata de deranjare peste 5%, inclusiv pentru campaniile programate, cu notificare către Founder (P22) | Da | CONFIRMAT | Nu |
| D-GRW-14 | Audiență minimă 5 afaceri; numărul exact ascuns sub prag (P23) | Da | CONFIRMAT | Nu |
| D-GRW-15 | Atribuire în 7 zile de la click (P24) | Da | CONFIRMAT | Nu |
| D-GRW-16 | Plafoane: implicit 1/zi, 3/săptămână, 30 de zile; maxime permise 2/zi, 5/săptămână, minimum 14 zile (P25) | Da | CONFIRMAT | Nu |
| D-UI-5 | Designul unificat aprobat; sursa unică = artefactul Claude Design exportat în `docs/design/system/` | Da | CONFIRMAT | Nu |
| D-UX-3 | „Plan” doar în Founder; clienții văd „abonament” (D1) | Da | CONFIRMAT | Nu |
| D-ROAD-1 | Ordinea aplicațiilor după Booking | Propunerea din §15.3 | NECESITĂ DECIZIE | Da |
| D-ROAD-2 | Booking prima aplicație | Da | CONFIRMAT | Nu |
| D-ROAD-3 | Fluxuri verticale paralele, fără reducerea scope-ului | Da | CONFIRMAT | Nu |

### 17.2 Modificări față de v0.1

1. Am adăugat ierarhia documentelor, formatul ADR și statusurile explicite pentru fiecare decizie (§1, §17.1).
2. Am retras promisiunea că un modul poate fi extras „fără rescriere” (P9, §11.1).
3. Am clarificat Network (în `platform`, fără al patrulea deployment) și am deschis deciziile despre paginile publice Network și partea business a Portal (§3.1).
4. Responsabilitățile Core și ale celor 15 aplicații sunt acum în tabele separate (§4, §5), plus regula anti-duplicare a profilurilor (§5.1) și ciclul de viață al aplicațiilor (§5.2).
5. Baza de date nu mai e decisă: trei variante comparate în F0 (§6.2). Am adăugat strategia completă de integritate între domenii (§6.4).
6. RLS nu mai e amânat după Booking. Se decide înainte de primul modul cu date reale, cu recomandare de activare din prima (§12.3). Am documentat limitele gărzii ORM (§12.2).
7. `authorize()` nu mai verifică și nu mai consumă cote. Am introdus `requireFeature`, `checkQuota` și rezervarea/commit/release cu reconciliere (§8.1–8.3), plus distincția cote de flux / cote de stoc.
8. Design: am separat Design SoT de Engineering SoT, am adăugat contractul de componentă și specificația DataTable comun/domeniu. Am marcat explicit dependența de exportul aprobat; nu se definesc tokens (§10).
9. Am adăugat cele patru straturi de logică comună și lista implementărilor unice (§9).
10. Politica de intrare: Model A activ, Model B pregătit structural, fără să fie construit (§7.2).
11. Contractele între module: identitatea apelantului, autorizarea în destinatar, comportamentul fără aplicația destinatară, evoluția versiunilor (§11).
12. Testare: am eliminat ideea că un lint pe `authorize()` dovedește securitatea. Am adăugat setul minim obligatoriu T1–T9 (§13).
13. Roadmap: livrabile, dependențe și paralelism în loc de bariere stricte; fără estimări în timp; Booking primul, dar fără blocarea celorlalte fluxuri (§15).
14. C1–C7 reclasificate. C2 nu mai exclude automat API-urile. Am adăugat C8–C13 (§16).

### 17.3 Experimente tehnice în Faza 0

Fiecare experiment produce un raport scurt și un ADR. Pentru toate se folosesc **două module de probă reale** (de exemplu, un subset Booking și un subset CRM) cu un contract între ele.

| # | Experiment | Ce verifică |
|---|---|---|
| E1 | Variantele Prisma A și B de organizare a datelor (§6.2); C (Drizzle) doar dacă ambele eșuează și fondatorii aprobă | Generarea clienților, importurile între pachete, build, timp de build, ergonomia pentru dezvoltare |
| E2 | Scheme Postgres separate + migrații independente | Migrații care nu se calcă una pe alta; recrearea completă din migrații |
| E3 | Roluri Postgres restrânse pe modul | Un modul nu poate citi sau scrie în schema altuia |
| E4 | Conexiuni simultane din același proces Next.js pe Vercel | Comportamentul pool-urilor cu pooler-ul Supabase (transaction mode), numărul de conexiuni la încărcare |
| E5 | RLS + `SET LOCAL` în tranzacție, prin pooler | Fără scurgere de context între request-uri; overhead-ul de performanță |
| E6 | Garda de tenant: raw, nested, bulk | Ce prinde garda și ce prinde doar RLS |
| E7 | Contract sincron între cele două module + outbox → job → consumator | Idempotența, retry, dead-letter |
| E8 | Rezervarea de cotă în concurență și la eșec de proces | Corectitudinea din §8.3 |
| E9 | Sesiuni în DB (Better Auth), revocare, retrogradare; sesiune cu token pentru un client non-browser | Efectul imediat; aceeași revocare funcționează și pentru token |
| E10 | Costul operațional | Timpul de setup pentru un modul nou, pașii manuali necesari |

### 17.4 Informații lipsă din documentele existente

1. ~~Checklisturile funcționale complete~~ — furnizate (v0.2.1).
2. **Exportul aprobat** al designului unificat din Claude Design (C9).
3. **Logo-ul oficial** în format vectorial, în repo-ul nou.
4. ~~Domeniile~~ — confirmate (v0.2.2).
5. **Politica de prețuri și planurile inițiale** (pentru configurarea, nu pentru codul sistemului comercial).
6. **Furnizorul SMS**: SMSLink sau Twilio. Hub-ul vechi le folosește pe amândouă.
7. **Domeniul și identitatea de expediere pentru email.**
8. **Politicile de retenție** a datelor pe tip de date (brief §42).
9. ~~Clienții existenți din Hub-ul vechi~~ — nu există (v0.2.2).
10. **Verificarea juridică** pentru VeeCoin, spin wheel, conturi de familie, recenzii verificate, acceptarea OTP și termenii de utilizare.
11. **Definiția campaniei consumate** în Marketing (C4).
12. **Founding 100** după lansare (C5).

### 17.5 Modificări în v0.2.1 (după specificația completă)

1. **Checklisturile** sunt în `docs/checklists/`: 15 fișiere + index, 1.465 de funcționalități, extrase fără modificări. C1 rezolvat.
2. **API extern** pentru Booking, Documents, Events, HR: nu apare în checklisturi, deci nu se construiește. C2 / D-API-1 rezolvate.
3. **Landing pages** aparțin Marketing (secțiunea „Lead Capture & Landing Pages”). C3c rezolvat.
4. Specificația stabilește explicit **direcția tehnică**: Next.js App Router, TypeScript, Prisma, PostgreSQL/Supabase, Better Auth, Stripe, SmartBill, Supabase Storage, Inngest/outbox, Sentry. D-AUTH-2, D-INF-2, D-COM-2 trec în CONFIRMAT. Pentru D-DB-1, experimentul din F0 compară doar variantele Prisma A și B; Drizzle nu mai e o alternativă fără decizia fondatorilor.
5. Specificația confirmă și principiul de livrare: fiecare funcționalitate e cerință V1, dar ordinea de livrare se stabilește separat. Consecvent cu §15.3.
6. **Diferențe de numărătoare față de brief** (HR 111 vs 112, Contracts „69 din 71” vs 71, Portal 150 vs 151): conform ierarhiei, checklisturile au prioritate; brief-ul trebuie corectat. Detalii în `docs/checklists/README.md`.
7. Specificația **nu** menționează biblioteca de i18n. D-I18N-1 a rămas deschisă până la v0.2.2.

### 17.6 Modificări în v0.2.2 (decizii ale fondatorilor)

1. **D-I18N-1 → CONFIRMAT:** next-intl, RO/EN/FR/ES/DE/IT, fallback EN, o singură infrastructură i18n (§10.6).
2. **D-INF-1 → CONFIRMAT:** `app.ventora-hub.com`, `portal.ventora-hub.com`, `founder.ventora-hub.com`; corporate `ventorasystems.com` (§3.1, §14). Adăugat: cookie-uri host-only, fără sesiuni partajate între subdomenii. Deschis: D-INF-3 (domeniile de staging).
3. **C13 / D-MIG-1 → CONFIRMAT:** Hub-ul vechi nu are clienți reali; nu se migrează date. Auditul de recoltare (`audit-recoltare.md`, 24.10.2026) e sursa pentru ce se refolosește; înainte de fiecare aplicație se face un audit țintit al modulului vechi corespunzător, folosit doar ca specificație de comportament. Arhitectura veche nu se păstrează. Repo-ul, datele și resursele vechi nu se șterg fără aprobare explicită.

### 17.7 Modificări în v0.2.3

1. **D-I18N-2 → CONFIRMAT:** italiana se adaugă. Toate regulile, testele (T7, T8), cataloagele de mesaje și selectorul de limbă acoperă acum 6 limbi: RO, EN, FR, ES, DE, IT. Fallback-ul rămâne EN.
2. **De actualizat pentru consecvență** (surse în afara acestui document): `VENTORA_MASTER_BRIEF.md` (§16 și criteriile de acceptare §56), `DESIGN_RULES.md` (§8), specificația celor 15 aplicații (principiile de arhitectură) și designul din Claude Design (LanguageSwitcher).

### 17.8 Modificări în v0.2.4

1. **D-UI-3 → CONFIRMAT:** design responsive obligatoriu pe toate dimensiunile de ecran din browser. Adăugate: principiul P11, §10.7 (lățimi de test, reguli pentru touch, tabletă, orientare, zoom) și testul T10.
2. **D-MOB-1 → CONFIRMAT ca obiectiv:** o aplicație mobilă a ecosistemului, construită la final. Adăugate: principiul P12 și §3.2 (logica în contracte serializabile, API first-party viitor, autentificare cu token pentru clienți non-browser, notificări pe canale). Tehnologia și momentul rămân NECESITĂ DECIZIE (D-MOB-2).
3. Experimentul E9 verifică în plus că autentificarea suportă sesiuni cu token revocabile pentru un client non-browser.

### 17.9 Modificări în v0.2.5

1. **D-COM-6 → CONFIRMAT:** proprietarul poate cumpăra singur add-on-uri din aplicație, cu cardul prin Stripe. Activarea și factura SmartBill sunt automate, iar totul e auditat și vizibil în Founder (§8.6). Consecvent cu checklistul Marketing („pot să plătească pentru campanii în plus”) și cu D-COM-1: organizația e creată tot de Founder, nu există înregistrare sau checkout public.
2. **D-COM-7 (nou, NECESITĂ DECIZIE):** dacă și schimbarea planului se poate face direct din aplicație. Până la decizie, prin cerere.

### 17.10 Modificări în v0.2.6

1. **D-UI-4 → CONFIRMAT (varianta A):** Portal și Network au identitate vizuală proprie, proiectată separat, pe aceeași fundație tehnică: schema tokens, teme, i18n, responsive, accesibilitate, primitive de comportament. Adăugate: §10.8 și structura `tokens/{business,portal,network}`, `ui-primitives`, `ui-portal`, `ui-network`. P5 actualizat.
2. Designul unificat din Claude Design acoperă Hub, Founder și cele 13 aplicații de business. Portal și Network se proiectează separat, înainte de construirea lor.
3. De actualizat: `DESIGN_RULES.md` (excepția pentru Portal și Network) și master brief-ul (§15, unde se aplică).

### 17.11 Modificări în v0.2.7

1. **D-UX-1 → CONFIRMAT:** regula permanentă de UX writing și revizuire a microcopy-ului după fiecare ecran. Adăugată în DESIGN_RULES.md §13 (reguli, flux, glosar, predarea către cod), în criteriile de acceptare (DESIGN_RULES §12, testul T7) și în §10.9.
2. **D-UX-2 (nou, NECESITĂ DECIZIE):** cine verifică traducerile în celelalte 5 limbi.
3. DESIGN_RULES.md a primit istoric și include acum și italiana (§8) și excepția Portal/Network (§2.1).

### 17.12 Modificări în v0.2.8

1. **Growth Engine** aprobat ca serviciu Core: principiul P13, rândul `growth` în §4, secțiunea §8.7, categoria obligatorie a notificărilor (`operational` / `commercial`), transparența costurilor în §8.6, Growth Engine v1 inclus în F5. Specificația completă și clarificările fondatorilor: `docs/GROWTH_ENGINE.md`.
2. Pregătirile din Faza 0 (doar tipuri și documentație, fără implementare): adăugate în FAZA-0.md, pasul 0.1.
3. DESIGN_RULES.md §14: regulile pentru componentele și sloturile comerciale.
4. Specificația componentelor comerciale pentru Claude Design: `docs/design/SPEC_COMPONENTE_COMERCIALE.md`.

### 17.13 Modificări în v0.2.9

1. **D-PX-1 → CONFIRMAT:** standardul Global Product Experience & Behavioral Design (DESIGN_RULES §15), cu review A–E și fișă aprobată pentru fiecare ecran; adăugat în criteriile de acceptare.
2. **Verificarea compatibilității:**
   - cu Growth Engine: compatibil, cu regula explicită că oportunitățile comerciale din review trec doar prin sloturi Growth Engine;
   - cu independența aplicațiilor: compatibil, fără trimiteri directe între aplicații;
   - cu UX writing: etapa D este revizuirea din DESIGN_RULES §13, nu un proces separat;
   - cu identitatea vizuală Portal/Network: standardul se aplică și acolo, fiind un proces, nu un stil.
3. **Lipsă găsită:** măsurarea experienței (întrebarea 10) nu avea suport în arhitectură. Adăugate §10.10 și deciziile D-PX-2 (instrumentul de analytics) și D-PX-3 (review proporțional).

### 17.14 Modificări în v0.3.0

1. **D-UI-5 → CONFIRMAT:** designul unificat e aprobat (Claude Design, etapele 1–5, 52 de decizii) și exportat în `docs/design/system/`; logo-ul oficial în `docs/design/logo/`; fișele de review Product Experience și revizuirea de microcopy în `docs/design/reviews/`. §10.1 actualizat; exporturile vechi scoase.
2. Deciziile din fișele de review care ating arhitectura (restul sunt doar de interfață și stau în fișe):
   - P5 → D-AUTH-3 (§7.1); D10 (cod 2FA pe dispozitiv nou) și P1 („Ține-mă minte” 30 de zile) în §7.1;
   - P6 → D-ACC-3 (§7.3); P3 (aprobat parțial) notat în §7.3;
   - P17 → D-COM-8 și P19 → D-COM-9 (§8.5);
   - P20–P25 → D-GRW-12…16 (§8.7); P21 confirmă D-GRW-7;
   - D1 → D-UX-3 (§10.1).
3. **Impact pe testare:** se adaugă la T5 (comercial) testele pentru termenul excepțiilor, clasificarea avantaj/dezavantaj și anunțul de 30 de zile; la testele Growth (F5): plafoanele maxime validate pe server, oprirea automată la 5%, audiența minimă și lipsa fallback-ului EN pentru oferte. Faza 0 nu se schimbă, în afară de tipurile din `packages/contracts` (2FA Owner și plafoanele intră ca tipuri, fără implementare).
4. **Nicio decizie deschisă nu s-a închis prin această versiune** în afara celor de mai sus. D-COM-7, D-PX-2, D-PX-3, D-GRW-8 (validarea juridică), D-UX-2 rămân NECESITĂ DECIZIE.

---

**Nu se scrie cod, nu se instalează pachete, nu se modifică nicio bază de date. Faza 0 începe doar după aprobarea explicită a acestei versiuni.**
