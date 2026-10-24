# Audit de Recoltare — Ventora Hub → Ventora Ecosystem

**Data auditului:** 2026-10-24  
**Repo auditat:** `C:\Projects\ventora_hub`  
**Scop:** Documentare exhaustivă a bazei de cod existente pentru a informa construcția proiectului nou **Ventora Ecosystem** (repo separat, pornit de la zero).  
**Restricție:** READ-ONLY. Nu s-au modificat fișiere existente, nu s-a rulat prisma, npm sau git.

---

## 1. Rezumat Executiv

Ventora Hub este o platformă SaaS multi-tenant construită pe **Next.js 16.2.4 (App Router)**, **Prisma 7**, **PostgreSQL** și **next-auth v5 beta**. Schema are **6 091 linii** cu ~120 modele Prisma. Codul acoperă 20 de domenii funcționale, de la booking și CRM până la HR, portal client, network B2B, funnel builder și semnături electronice.

### Verdict general

| Dimensiune | Stare |
|---|---|
| Acoperire funcțională | Foarte largă — aproape toate domeniile unui hub de business |
| Calitate arhitecturală | Neuniformă: core bun, unele zone copiate ad-hoc |
| Securitate | 3 vulnerabilități critice confirmate (detalii §5) |
| i18n | Parțial — acoperire ~40%, multe string-uri hardcodate RO |
| Migrații DB | 12 migrații, drift semnificativ față de schema actuală |
| Testare | Nu s-au identificat fișiere de test (`*.test.*`, `*.spec.*`) |
| Documentare | Absentă (CLAUDE.md minimal, AGENTS.md cu note Next.js) |

### Recomandare sintetică

**Rescriem arhitectura** în Ventora Ecosystem cu lecțiile din Hub. Reutilizăm selectiv ~15 componente/utilități clare (PDF, workflow engine core, limits system, permissions registry). Abandonăm codul duplicat, schema monolitică și pattern-urile de securitate defectuoase.

---

## 2. Inventar pe Domenii

| # | Domeniu | Modele Prisma principale | Rute API | Componente UI | Completitudine | Clasificare | Destinație Ecosystem |
|---|---|---|---|---|---|---|---|
| 1 | **Auth & RBAC** | User, Owner, PasswordResetToken, Permission, UserPermission, AdminRole | `/api/auth/*`, `auth.ts`, `auth.config.ts` | Login, 2FA flow | 85% | REFOLOSIM (logică) / RESCRIEM (JWT strategy) | Core — auth-service |
| 2 | **Multi-tenancy / Org** | Organization (80+ relații), Location | `/api/organizations/*` | Org settings | 70% | LECȚIE | Core — tenant-service |
| 3 | **Plan / Limite** | Plan, Addon, OrganizationAddon | `lib/limits/`, `/api/plans/*` | — | 90% | REFOLOSIM | Core — billing-service |
| 4 | **Booking / Programări** | BookingPage, Service, Appointment, AppointmentPackage, AvailabilityRule, StaffScheduleConfig, BookingTestimonial, BookingBadge, BookingFaq, BookingGalleryImage, AppointmentWaitlist | `/api/booking/*`, `/api/appointments/*` | BookingPage builder, calendar | 80% | RESCRIEM | App — booking |
| 5 | **CRM** | Lead, LeadActivity, Client, ClientActivity, Pipeline, PipelineStage, Deal, NextAction | `/api/crm/*`, `/api/leads/*`, `/api/clients/*` | Pipeline Kanban, Lead form | 75% | RESCRIEM | App — crm |
| 6 | **Finance** | Invoice, InvoiceItem, Payment, Expense, Quote, QuoteItem, QuoteDocument | `/api/invoices/*`, `/api/quotes/*` | Invoice editor, Quote builder | 80% | RESCRIEM (PDF refolosim) | App — finance |
| 7 | **Projects & Tasks** | Project, Task, Subtask, TimeEntry, ProjectMember, ProjectExpense | `/api/projects/*`, `/api/tasks/*` | Kanban, Gantt (parțial) | 65% | RESCRIEM | App — projects |
| 8 | **HR Suite** | AttendanceEntry, LeaveEntry, SalaryCalculation, SalaryTaxConfig, BenefitType, UserBenefit, HRDocument, OnboardingTemplate, PerformanceReview, Objective, KeyResult, Training, Certification, OrgChartNode | `/api/hr/*` | Org chart, Leave calendar | 60% | RESCRIEM | App — hr |
| 9 | **Portal Client** | ClientUser, LoyaltyConfig, LoyaltyTier, SpinWheelConfig, VeeCoinTransaction, ClientMission, Bundle, TrackerEntry, LifestyleEntry, VeeDailyBriefing, DigitalProduct | `/api/portal/*`, `/app/portal/*` | Portal UI (gamificat) | 70% | RESCRIEM | App — portal |
| 10 | **Network B2B** | BusinessPost, BusinessOffer, Partnership, PartnershipRequest, NetworkConversation, BusinessEvent, BusinessPortalProfile, JobListing, JobApplication | `/api/network/*` | Feed, Profile page | 50% | ABANDONĂM (sau MVP ușor) | App — network |
| 11 | **Messaging** | Conversation, Message, InternalMessage, Channel, ExternalConversation, ExternalMessage | `/api/conversations/*`, `/api/messages/*` | Chat UI, inbox | 60% | RESCRIEM | App — messaging |
| 12 | **Workflow Engine** | Workflow, WorkflowRun, WorkflowScheduledStep, WorkflowTemplate, EmailTemplate, SmsTemplate, WhatsappTemplate | `lib/workflow-engine.ts`, `/api/workflows/*` | Flow canvas (@xyflow) | 75% | REFOLOSIM (engine core) | Core — workflow-service |
| 13 | **Events (intern)** | Event, EventParticipant, EventTicketType, PromoCode, EventVendor, EventTimelineItem, InvitationPage | `/api/events/*` | Event builder, RSVP | 65% | RESCRIEM | App — events |
| 14 | **Funnel Builder** | Funnel, FunnelLead, CustomDomain | `/api/funnels/*`, `proxy.ts` | Block editor (JSON), custom domain | 55% | RESCRIEM | App — funnels |
| 15 | **Documente & Semnături** | Document, DocumentFolder, Template, CustomField, SignatureRequest, SignatureRequestSigner, SignatureAuditLog | `/api/documents/*`, `/api/signatures/*` | Doc viewer, e-sign flow | 60% | RESCRIEM | App — docs |
| 16 | **AI Features** | AiPromptTemplate, WidgetConfig | `/api/ai/chat`, `/api/ai/assistant`, `/api/ai/insights` | Chat widget, insights panel | 50% | RESCRIEM | App — ai |
| 17 | **Marketing & Ads** | AudienceSegment, MarketplaceAd, AdPricingConfig, ReviewCampaign, Review, BusinessOfTheMonth | `/api/marketing/*` | Ad manager | 40% | ABANDONĂM | — |
| 18 | **Founding 100** | FoundingReservation, ReferralCode, ReferralCommission, FoundingConfig, CityImage, PageVisit, FoundingCityDisplayBoost | `/api/founding/*`, `/founding-100` | Hero, FAQ, bulk upload | 85% | LECȚIE (pattern refolosit în alt context) | Admin — founding |
| 19 | **Calculatoare (Purolite)** | PuroliteCategory, PuroliteEntry (DB separată) | `/api/purolite/*` | CategoriesTab, EntriesTab | 90% | REFOLOSIM (sub-app complet) | App — calculatoare |
| 20 | **Platform / Infra** | SecurityAuditLog, ActivityLog, AuditLog, EmailLog | `proxy.ts`, `lib/prisma-org-guard.ts`, `lib/stripe.ts`, `lib/resend.ts` | — | 70% | LECȚIE / REFOLOSIM (parțial) | Core — platform |

---

## 3. Top 15 Componente de Refolosit

Prioritizate după raportul valoare/risc. Fiecare necesită adaptare la arhitectura nouă, nu copy-paste direct.

### 3.1 `lib/limits/get-org-effective-limits.ts`
**Valoare: ÎNALTĂ.** Sistem DB-driven pentru limite de plan: citește `Organization`, aplică `OrganizationAddon` multiplicativ, returnează `null` pentru unlimited. Bine izolat, ușor de portat.  
**Adaptare:** Înlocuiește enum-ul `Plan` hardcodat cu referință la noul `plan-service`.

### 3.2 `lib/permissions/registry.ts`
**Valoare: ÎNALTĂ.** `PERMISSIONS` constant (~40 chei), `ADDON_TO_FEATURES` mapping, `KNOWN_ADDON_CODES`/`KNOWN_PERMISSION_KEYS` sets. Zero dependențe externe.  
**Adaptare:** Extinde namespace-urile pentru noile app-uri din Ecosystem.

### 3.3 `lib/permissions.ts` — `requirePermission()`
**Valoare: ÎNALTĂ.** Re-citește userul din DB la fiecare request (evită JWT stale). Pattern corect de RBAC server-side.  
**Adaptare:** Portează logica, nu dependența de next-auth v5 beta.

### 3.4 `lib/workflow-engine.ts`
**Valoare: ÎNALTĂ.** Engine JSON node/edge, `executeWorkflow()`, `EVENT_MAP` pentru trigger types, suport email/SMS/webhook via queue. Bine structurat.  
**Adaptare:** Decuplează de `orgGuardBypass`; adaugă tipuri stricte pentru node payloads.

### 3.5 `lib/workflow-template-deploy.ts`
**Valoare: MEDIE.** Pattern `deployAllBookingTemplates()` cu dedup (upsert pe slug). Refolosibil pentru orice template seeding.  
**Adaptare:** Generalizează pentru alte domenii.

### 3.6 `lib/pdf/invoice-pdf.ts` + `lib/pdf/quote-pdf.ts`
**Valoare: ÎNALTĂ.** pdf-lib + @pdf-lib/fontkit, DejaVuSans, generare complet server-side fără servicii externe. Calitate producție.  
**Adaptare:** Extrge font loading într-un helper comun; parametrizează template-ul.

### 3.7 `app/api/search/route.ts`
**Valoare: MEDIE.** Multi-model search (clients, projects, tasks, invoices) cu `organizationId` filter corect. Pattern de referință pentru cross-model search.  
**Adaptare:** Extinde cu modele noi; adaugă full-text index la Postgres.

### 3.8 `lib/stripe.ts` — lazy singleton pattern
**Valoare: MEDIE.** `getStripe()` returnează singleton leneș, evită re-inițializare. Pattern simplu, portabil.  
**Adaptare:** Refolosește pattern-ul pentru orice SDK extern (Resend, Twilio, OpenAI).

### 3.9 Componentele `purolite/` (sub-app complet)
**Valoare: ÎNALTĂ.** CategoriesTab, EntriesTab, ColorPicker, HelpTip, ConfirmModal, PuroliteKebabMenu, ToastProvider — UI complet, i18n prin `usePuroliteT()`, RBAC propriu cu `requirePuroliteAuth()`, activity logging, iron-session.  
**Adaptare:** Extrage design system în pachete independente; înlocuiește iron-session cu auth unificat.

### 3.10 `proxy.ts` — custom domain routing logic
**Valoare: MEDIE.** Upstash Redis lookup pentru custom domains, fallback pe `APP_URL`, `getDefaultRouteByRole()`.  
**Adaptare:** Mută în middleware dedicat; adaugă TTL configurabil.

### 3.11 Pattern `prisma-org-guard.ts` (idee, nu implementarea)
**Valoare: ÎNALTĂ ca lecție.** Prisma extension cu `AsyncLocalStorage` pentru detectare query-uri fără `organizationId`. Ideea e corectă.  
**Adaptare:** **Re-implementează cu BLOCARE** (throw, nu log) în noul Ecosystem. Aceasta e lecția critică.

### 3.12 `auth.ts` — impersonation pattern
**Valoare: MEDIE.** `isImpersonation` flag în `authorize()`, `restoreAdmin` flow, `sessionVersion` tracking.  
**Adaptare:** Portează logica; elimină dependența de bcryptjs în favoarea argon2.

### 3.13 `lib/resend.ts` — singleton export
**Valoare: SCĂZUTĂ (simplitate).** `export const resend = new Resend(...)` — pattern minim de inițializare.  
**Adaptare:** Folosește același pattern pentru toți clienții de servicii externe.

### 3.14 Schema HR (SalaryTaxConfig cu procente românești)
**Valoare: MEDIE.** Procente CAS, CASS, impozit venit hard-codate în schemă dar în câmpuri DB — ușor de actualizat.  
**Adaptare:** Verifică procentele față de legislația 2026 înainte de a porta.

### 3.15 `lib/purolite-session.ts` — `requirePuroliteAuth()`
**Valoare: MEDIE.** Pattern clar de auth middleware pentru sub-app izolat. Model bun de referință.  
**Adaptare:** Generalizează pentru micro-app-uri din Ecosystem cu autentificare separată.

---

## 4. Lecții

### L1 — Schema monolitică este o capcană de productivitate
Schema de 6 091 linii cu ~120 modele într-un singur fișier face diff-urile imposibil de citit, migrațiile sunt riscante, și `prisma generate` durează. **Ecosystem: schema per domeniu/app, fiecare în propriul pachet.**

### L2 — Modelul `Organization` cu 80+ relații nu se scalează
Orice query pe `Organization` riscă N+1. Include-urile în cascadă sunt omniprezente. **Ecosystem: normalizare strictă, relații explicite numai unde e nevoie, CQRS pentru read-heavy views.**

### L3 — JWT role stale este o vulnerabilitate de design, nu un bug
`auth.config.ts` stochează `role` și `organizationId` în JWT (maxAge 24h / 30d). Dacă userul e degradat sau organizația e dezactivată, token-ul vechi e încă valid până la expirare. **Ecosystem: role re-citit din DB la fiecare request sensibil (pattern `requirePermission()` e corect — generalizează-l).**

### L4 — `prisma-org-guard.ts` care doar loghează e mai periculos decât nimic
Dă falsa senzație de protecție. Dev-ul vede log-ul, îl ignoră, trece în producție. **Ecosystem: guard cu THROW obligatoriu; bypass explicit prin `orgGuardBypass()` cu audit log.**

### L5 — Trei modele de logging separate (ActivityLog, AuditLog, SecurityAuditLog) creează confuzie
Niciun contract clar despre ce merge unde. **Ecosystem: un singur model `AuditLog` cu `category` enum (SECURITY | ACTIVITY | DATA_CHANGE).**

### L6 — Două tipuri de Event (`Event` vs `BusinessEvent`) cu naming identical confundă echipa
`Event` = ticketing intern, `BusinessEvent` = network RSVP. Niciun comentariu, niciun prefix. **Ecosystem: namespace în naming (`TicketedEvent`, `NetworkEvent`) sau apps separate.**

### L7 — `gpt-4o-mini` hardcodat în ruta de AI blochează upgrade-urile
Model schimbat → deploy forțat. **Ecosystem: model configurat în DB (pattern `AiPromptTemplate.model` e corect — aplică-l peste tot).**

### L8 — i18n parțial creează UX inconsistent
`messages/en.json` acoperă ~40% din chei. Restul e RO hardcodat, invizibil la `grep`. **Ecosystem: lint rule care interzice string-uri UI en clair în TSX; toate prin `useT()`.**

### L9 — 12 migrații pentru 120 modele = drift masiv
Probabil că schema actuală nu poate fi recreată din migrații. `prisma db push` folosit în dev a lăsat urme. **Ecosystem: migrații obligatorii de la prima zi; `prisma db push` interzis în orice mediu cu date reale.**

### L10 — Dual Prisma client (`prisma` + `purolite`) pe aceeași instanță Next.js funcționează, dar nu se scalează
Conexiunile se dublează. **Ecosystem: apps separate cu propriile conexiuni; connection pooling explicit (PgBouncer sau Prisma Accelerate).**

### L11 — Workflow engine bine proiectat, dar cuplat la DB principal
`orgGuardBypass` în workflow engine pentru operații cross-org sugerează că bypass-ul a fost soluția de avarie. **Ecosystem: workflow engine ca serviciu independent cu propriul DB sau event bus.**

### L12 — Stripe Portal-Only vs ticketing sunt două use-case-uri diferite în același cod
`lib/stripe.ts` servește atât billing/subscriptions cât și ticketing la events. Logica se încâlcește. **Ecosystem: Stripe billing în `billing-service`, Stripe ticketing în `events-app`.**

### L13 — `purolite` sub-app este cel mai curat cod din repo
Iron-session, RBAC propriu, activity logging, i18n complet, componente izolate. Model de urmat. Probabil e mai nou. **Ecosystem: folosește-l ca referință de calitate.**

### L14 — Lipsesc complet testele automate
Nu există niciun fișier `*.test.*` sau `*.spec.*` identificat. **Ecosystem: test coverage obligatoriu pentru auth, limits, permissions, și orice endpoint financiar.**

### L15 — `OrganizationAddon` + `getOrgEffectiveLimits()` e singurul sistem bine proiectat de la zero
DB-driven, extensibil, fără enum hardcodat, null = unlimited. **Ecosystem: copiază exact acest pattern pentru orice sistem de limite.**

---

## 5. Riscuri de Securitate

### S1 — CRITIC: prisma-org-guard nu blochează, doar loghează
**Fișier:** `lib/prisma-org-guard.ts`  
**Impact:** Query-uri fără `organizationId` pe modele sensibile (client, invoice, lead, appointment) ajung la DB și returnează date cross-tenant în dev. În producție, dacă un dev uită filtrul, datele unui tenant sunt expuse altuia.  
**Reproducere:** Orice query pe `prisma.client.findMany({})` fără `where: { organizationId }` va trece, va loga în fișier (doar în dev), și va returna date.  
**Remediere în Ecosystem:** Guard cu `throw new CrossTenantLeakError()` implicit; bypass doar cu token explicit în `AsyncLocalStorage` + audit log obligatoriu.

### S2 — CRITIC: JWT role stale — escaladare de privilegii prin token vechi
**Fișier:** `auth.config.ts` (jwt callback)  
**Impact:** Un user degradat din ADMIN în USER (de ex. după incident de securitate) poate continua să acceseze rute admin pentru până la 30 de zile (rememberMe) dacă nu se deloghează. `session.user.role` din JWT e folosit direct în 15+ componente client (`app/admin/organizations/[id]/page.tsx:268` etc.).  
**Reproducere:** Degradează un user în DB → nu-l forța să se delogheze → user-ul accesează `/admin/*` cu rol vechi.  
**Remediere în Ecosystem:** Adaugă `sessionVersion` increment la orice schimbare de rol; JWT callback verifică `sessionVersion` din DB (cost: 1 query per request, acceptabil).

### S3 — ÎNALT: Acces control frontend-only pe componente admin
**Fișier:** `app/admin/organizations/[id]/page.tsx:268-467` (și altele)  
**Impact:** Verificările `if (!session?.user || session.user.role !== "ADMIN")` în `useEffect` hook-uri client-side sunt cosmetic. Un atacator poate apela direct API-urile subiacente dacă endpoint-urile nu au propriile verificări server-side.  
**Reproducere:** Înlătură condiția din browser → apelează API-ul direct.  
**Remediere:** Verificare de rol pe fiecare API route cu `requirePermission()` server-side; componenta client verifică doar pentru UX.

### S4 — ÎNALT: Model `gpt-4o-mini` hardcodat în ruta de AI cu prompt de sistem în română
**Fișier:** `app/api/ai/chat/route.ts`  
**Impact:** Prompt injection posibil dacă user input nu e sanitizat înainte de a fi trimis la OpenAI. Prompt-ul de sistem în RO hardcodat poate fi citit prin reverse engineering.  
**Remediere:** Sanitizare input, model configurat din DB, prompt-ul de sistem ca template în DB cu audit log la modificări.

### S5 — MEDIU: Secretul `CLIENT_SESSION_SECRET` pentru iron-session Purolite
**Fișier:** `lib/purolite-session.ts` (probabil)  
**Impact:** Dacă secretul este slab sau reutilizat, sesiunile Purolite pot fi forjate. iron-session 8.0.4 este stabil dar secretul trebuie să fie de minim 32 bytes aleatorii.  
**Remediere:** Verifică lungimea secretului în env validation; rotire automată la deploy.

### S6 — MEDIU: Schema drift — 120 modele, 12 migrații
**Impact:** Starea reală a DB în producție este necunoscută din cod. Orice migrație nouă riscă conflict cu coloane/tabele existente din `prisma db push`. Imposibil de auditat securitatea la nivel de schemă.  
**Remediere în Ecosystem:** Pornește cu migrații curate de la zero.

### S7 — SCĂZUT: `INTERNAL_API_SECRET` folosit pentru rute interne
**Impact:** Dacă secretul e slab sau expus în logs, rutele interne pot fi apelate din exterior.  
**Remediere:** Verifică că nu e loggat, că e de minim 32 chars, că rutele care îl verifică returnează 401 înainte de orice procesare.

---

## 6. Întrebări Deschise

### Î1 — Ce face `purolite` — este o aplicație client separată sau parte din Hub?
Schema `purolite` e pe o DB separată (`PUROLITE_DATABASE_URL`), cu client Prisma propriu, sesiuni iron-session proprii, și rute `/purolite/*`. Pare o aplicație complet separată embeddată în același repo Next.js. **Clarificare necesară:** Va fi extras ca app independent în Ecosystem sau rămâne embedded?

### Î2 — Care este diferența funcțională între `Client` și `ClientUser`?
`Client` (în CRM) = persoana care lucrează cu business-ul, gestionată de staff. `ClientUser` (în Portal) = contul digital al aceluiași client cu login propriu. Sunt legate? **Clarificare necesară:** Există o relație `Client ↔ ClientUser` în schema actuală? (Nu am identificat un FK explicit.)

### Î3 — `BusinessEvent` din Network și `Event` din Events app sunt convergente?
Ambele implică participanți, RSVP-uri, locații. Dar sunt în module complet separate cu modele diferite. **Clarificare necesară:** Vor fi unificate în Ecosystem sau rămân distincte?

### Î4 — Ce se întâmplă cu `FoundingReservation` / Founding 100 după lansare?
Domeniul Founding 100 are 7 modele Prisma și un flow complet. **Clarificare necesară:** Este un domeniu temporar de pre-lansare sau devine parte permanentă a platformei?

### Î5 — Supabase este folosit efectiv sau sunt doar env vars rămase?
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` sunt referite în cod dar nu am identificat un client Supabase în lib/. **Clarificare necesară:** Supabase e activ (storage, realtime)? Sau env vars orfane?

### Î6 — Care este strategia de deployment pentru custom domains (Funnel Builder)?
`proxy.ts` + Upstash Redis + `VERCEL_API_TOKEN` / `VERCEL_PROJECT_ID` sugerează că domainele custom sunt adăugate dinamic la Vercel. **Clarificare necesară:** Această strategie se păstrează în Ecosystem sau se mută pe alt provider?

### Î7 — `CommissionConfig` / `CommissionOverride` — pentru ce use-case specific?
Am identificat modele de comisioane și chei i18n `commissions` dar contextul nu e clar. **Clarificare necesară:** Comisioane de referral, agenți de vânzări, sau altceva?

### Î8 — Testele automate lipsesc complet — este o decizie conștientă?
Nu am găsit niciun fișier de test. **Clarificare necesară:** Este Ecosystem-ul construit cu TDD/BDD sau rămâne fără teste?

---

## 7. Note Metodologice

### Fișiere citite integral
- `prisma/schema.prisma` (6 091 linii, citit în chunks)
- `auth.ts`, `auth.config.ts`, `proxy.ts`
- `lib/permissions.ts`, `lib/permissions/registry.ts`
- `lib/prisma-org-guard.ts`, `lib/workflow-engine.ts`
- `lib/stripe.ts`, `lib/resend.ts`
- `lib/limits/get-org-effective-limits.ts`
- `lib/pdf/invoice-pdf.ts`, `lib/pdf/quote-pdf.ts`
- `app/api/ai/chat/route.ts`, `app/api/ai/assistant/route.ts`
- `app/api/search/route.ts`
- `package.json`
- `messages/en.json` (chei top-level)
- `app/api/purolite/categories/route.ts`, `[id]/route.ts`
- `components/purolite/CategoriesTab.tsx`
- `CLAUDE.md`

### Fișiere citite parțial / prin grep
- `app/dashboard/page.tsx` (session.user.role checks)
- `app/admin/organizations/[id]/page.tsx` (frontend-only checks)
- `app/admin/notifications/settings/page.tsx`
- `app/admin/messages/page.tsx`
- `app/purolite/(app)/layout.tsx`
- `prisma/migrations/` (listate, nu citite)

### Metode de analiză
- Grep pentru pattern-uri de securitate (`session.user.role`, `hardcoded model names`, `env vars`)
- Read structural al schemei pentru identificarea relațiilor
- Verificare manuală a pattern-urilor de autorizare în API routes
- Comparare `messages/en.json` keys vs inferred UI coverage

### Ce nu s-a auditat (limitări)
- Rutele API individuale pentru fiecare domeniu (prea multe pentru audit manual complet)
- Componente React individuale din `components/` (câteva sute)
- Codul de test (inexistent)
- Queries Prisma pentru N+1 (necesită profiler în runtime)
- Performance (necesită profiling real)
- Acoperirea completă a i18n (necesită AST parser)

### Stack confirmat
```
Next.js 16.2.4 (App Router, standalone)
React 19.2.4
Prisma 7.7.0 + @prisma/adapter-pg (PostgreSQL)
next-auth 5.0.0-beta.31 (JWT strategy)
iron-session 8.0.4 (Purolite sub-app)
next-intl 4.13.0
Stripe 22.3.2
OpenAI 6.41.0 (gpt-4o-mini hardcodat)
Twilio 6.1.0
Resend 6.12.2
pdf-lib 1.17.1 + @pdf-lib/fontkit
@xyflow/react 12.10.2 (workflow canvas)
Zod 4.3.6
Recharts 3.8.1
Upstash Redis (custom domain cache)
```

---

**Fișier creat:** `C:\Projects\ventora_hub\docs\audit-recoltare.md`  
**Confirmare:** Nu s-a modificat niciun fișier existent. Nu s-a rulat prisma, npm install, sau git. Singura acțiune de scriere a fost crearea acestui fișier nou.
