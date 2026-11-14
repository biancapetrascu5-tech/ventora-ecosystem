

## 2026-11-14 · S149 — Lista de clienți EasyBook, clase pe pagina publică, taburile Setărilor, raportarea recomandărilor, bugetul ofertei, repornirea blocată

### Biblioteca (bundle.js, index.d.ts)
- **RecommendationCard** (1.1.0) — prop nou `onReport` (doar pentru proprietar): „Nu e relevant pentru mine” în meniul ⋯ (`reportIrrelevant`, 6 limbi). Meniul apare și fără `onRemindLater` când există `onReport`.
- Tokeni: neschimbați.

### Componente noi (1.0.0)
- **BookingClients** — `/booking/clients`: căutare, filtre cu număr (Toți, Cu programări viitoare, Risc ridicat, Blocați, Fără vizite de 6 luni), sortare, paginare; nume, telefon, ultima vizită, următoarea programare, vizite, nota; clic → BookingClientCard; „Client nou” și „Importă clienți”; membrul vede doar clienții lui; goală (proprietar / membru), fără rezultat, se încarcă, eroare.

### Componente schimbate
- **BookingPublic** (1.3.0) — clasa la pasul de timp: sesiuni cu ora, cine o ține și sala, „{n} locuri” sau „Plin” (dezactivată); fără pasul „Cu cine” (3 pași); nicio sesiune, toate pline (lista de așteptare), locul ocupat între timp.
- **BookingPayments** (1.1.0) — bara de taburi a Setărilor, cu cele 8 taburi din S127.
- **RecommendationCard** (1.1.0) — previzualizarea: meniul, confirmarea cu motiv opțional (max. 200), eroare, mulțumirea, membrul fără opțiune.
- **GrowthOfferEditor** (1.1.0) — „Bugetul ofertei”: opțional (gol = fără limită), consumul „142 din 200 folosite”, ce se întâmplă la limită, oprită la buget cu „Mărește bugetul”, erori.
- **FounderNotifications** (1.2.0) — „Repornește” blocat 24 h după a doua oprire automată în 7 zile, cu „Poți reporni după {time}” și motivul.
- **BookingClientCard** (1.0.1) — README: legătura cu lista BookingClients.

### `manifest.json`
- Adăugată BookingClients după BookingClientCard (172 de componente).

### Chei i18n (toate în cele 6 limbi, aceleași chei și aceiași parametri `{…}`; 81 noi, 0 schimbate, 0 șterse)
#### `i18n/booking.json` — 49 chei noi

- `booking.clients.*` (17): `booking.clients.title`, `booking.clients.lead`, `booking.clients.leadMember`, `booking.clients.new`, `booking.clients.import`, `booking.clients.search`, `booking.clients.never`, `booking.clients.noNext`, `booking.clients.blocked`, `booking.clients.count`, `booking.clients.sort`, `booking.clients.memberNote`, `booking.clients.noResults`, `booking.clients.noResultsBody`, `booking.clients.clearFilters`, `booking.clients.retry`, `booking.clients.open`
- `booking.clients.f.*` (4): `booking.clients.f.all`, `booking.clients.f.upcoming`, `booking.clients.f.blocked`, `booking.clients.f.inactive`
- `booking.clients.col.*` (6): `booking.clients.col.name`, `booking.clients.col.phone`, `booking.clients.col.last`, `booking.clients.col.next`, `booking.clients.col.visits`, `booking.clients.col.note`
- `booking.clients.sort.*` (2): `booking.clients.sort.name`, `booking.clients.sort.visits`
- `booking.clients.empty.*` (2): `booking.clients.empty.title`, `booking.clients.empty.body`
- `booking.clients.emptyMember.*` (2): `booking.clients.emptyMember.title`, `booking.clients.emptyMember.body`
- `booking.clients.error.*` (2): `booking.clients.error.title`, `booking.clients.error.body`
- `booking.public.class.*` (14): `booking.public.class.title`, `booking.public.class.sessions`, `booking.public.class.with`, `booking.public.class.spotsOne`, `booking.public.class.spotsFew`, `booking.public.class.spotsMany`, `booking.public.class.full`, `booking.public.class.noneTitle`, `booking.public.class.noneBody`, `booking.public.class.allFullTitle`, `booking.public.class.allFullBody`, `booking.public.class.waitlist`, `booking.public.class.takenTitle`, `booking.public.class.takenBody`

#### `i18n/commercial.json` — 12 chei noi

- `reco.report.*` (12): `reco.report.menu`, `reco.report.title`, `reco.report.body`, `reco.report.reason`, `reco.report.placeholder`, `reco.report.help`, `reco.report.count`, `reco.report.tooLong`, `reco.report.submit`, `reco.report.thanks`, `reco.report.thanksBody`, `reco.report.error`

#### `i18n/founder-growth.json` — 14 chei noi

- `founder.growth.offerEditor.budget.*` (14): `founder.growth.offerEditor.budget.title`, `founder.growth.offerEditor.budget.label`, `founder.growth.offerEditor.budget.help`, `founder.growth.offerEditor.budget.unit`, `founder.growth.offerEditor.budget.used`, `founder.growth.offerEditor.budget.usedNoLimit`, `founder.growth.offerEditor.budget.near`, `founder.growth.offerEditor.budget.atLimit`, `founder.growth.offerEditor.budget.reachedTitle`, `founder.growth.offerEditor.budget.reachedBody`, `founder.growth.offerEditor.budget.raise`, `founder.growth.offerEditor.budget.stopped`, `founder.growth.offerEditor.budget.errBelow`, `founder.growth.offerEditor.budget.errZero`

#### `i18n/founder.json` — 6 chei noi

- `founder.notifications.restartBlocked.*` (6): `founder.notifications.restartBlocked.title`, `founder.notifications.restartBlocked.body`, `founder.notifications.restartBlocked.until`, `founder.notifications.restartBlocked.reason`, `founder.notifications.restartBlocked.meanwhile`, `founder.notifications.restartBlocked.badge`

## 2026-11-13 · S148 — Brand kit, BookingStatuses, limba textului în mesaje, „Vezi toate” în Founder

### Biblioteca (bundle.js, bundle.css, index.d.ts)
- **NotificationsPanel** (1.1.0) — `onSeeAll` / `seeAllHref`: linkul „Vezi toate” jos în panou (`.v-notifs__foot`, text în 6 limbi).
- Tokeni: neschimbați. Brandul afacerii suprascrie `--primary*`, `--on-primary`, `--font-sans`, `--font-display` doar pe suprafețele pentru clienți.

### Componente noi (1.0.0)
- **HubBrand** — Hub › Afacerea › Brand (proprietar / admin): logo pe fundal deschis și închis, culoarea principală și de accent cu verificarea contrastului și nuanța propusă, fontul (listă scurtă, cu previzualizare), tonul vocii (formal / prietenos / scurt, cu exemplu), semnătura de e-mail; previzualizare live a paginii de programări și a unui e-mail; fără brand, aspectul Ventora; membru doar citire.

### Componente scoase
- **HubBusinessProfile** (S147) — logo-ul se încarcă acum doar în HubBrand; numele afacerii (doar citire) e tot acolo. README-ul și previzualizarea, scoase; scoasă și din `manifest.json`.

### Componente schimbate
- **BookingPublic** (1.2.0), **BookingClientManage** (1.2.0) — secțiunea S148: aceleași ecrane cu brand complet (logo deschis / închis, culoare, accent, font) și fără brand; test DE / IT.
- **BookingClientEmails** (1.1.0) — e-mailurile cu brand: antetul cu logo-ul salonului, culoarea butonului, accentul, fontul, semnătura; fără brand, aspectul Ventora.
- **BookingStatuses** (1.0.2) — „În desfășurare”: fără „Corectează starea…” (corectarea e doar pentru stările finale); rămâne „Încasează”.
- **BookingMessageTemplates** (1.1.0) — „Limba textului” în editor: cele 6 limbi cu starea (principală, scris, lipsește), Notice-ul pentru textul lipsă și „Pornește de la textul în Română”.
- **FounderNotifications** (1.1.0) și toate ecranele Founder — clopoțelul are „Vezi toate”, spre pagina Notificări.
- **CampaignKitEmailEditor** (1.0.1) — antetul și culoarea vin din Hub › Brand („Deschide Brand”).
- **HubAccount** (1.1.1), **HubLauncher** (1.2.1), **OrgSwitcher** (README) — „Brand” în locul „Profilului afacerii”.

### `manifest.json`
- Adăugată HubBrand, scoasă HubBusinessProfile (tot 171 de componente). Fără câmp de versiune; versiunile sunt cele de mai sus.

### Chei i18n (toate în cele 6 limbi, aceleași chei și aceiași parametri `{…}`; 65 noi, 3 schimbate, 11 șterse)
#### `i18n/team.json` — 57 chei noi, 11 șterse

- `hub.nav.*` (1): `hub.nav.brand`
- `hub.nav.brand.*` (1): `hub.nav.brand.short`
- `hub.brand.*` (6): `hub.brand.lead`, `hub.brand.save`, `hub.brand.saved`, `hub.brand.reset`, `hub.brand.default`, `hub.brand.ownerOnly`
- `hub.brand.logo.*` (8): `hub.brand.logo.title`, `hub.brand.logo.lead`, `hub.brand.logo.light`, `hub.brand.logo.dark`, `hub.brand.logo.darkHelp`, `hub.brand.logo.rules`, `hub.brand.logo.errSmall`, `hub.brand.logo.removeBody`
- `hub.brand.color.*` (10): `hub.brand.color.title`, `hub.brand.color.lead`, `hub.brand.color.primary`, `hub.brand.color.accent`, `hub.brand.color.ok`, `hub.brand.color.lowTitle`, `hub.brand.color.low`, `hub.brand.color.fix`, `hub.brand.color.accentNote`, `hub.brand.color.default`
- `hub.brand.font.*` (7): `hub.brand.font.title`, `hub.brand.font.lead`, `hub.brand.font.sans`, `hub.brand.font.display`, `hub.brand.font.serif`, `hub.brand.font.rounded`, `hub.brand.font.sample`
- `hub.brand.tone.*` (10): `hub.brand.tone.title`, `hub.brand.tone.lead`, `hub.brand.tone.formal`, `hub.brand.tone.friendly`, `hub.brand.tone.short`, `hub.brand.tone.example`, `hub.brand.tone.formalEx`, `hub.brand.tone.friendlyEx`, `hub.brand.tone.shortEx`, `hub.brand.tone.note`
- `hub.brand.sig.*` (5): `hub.brand.sig.title`, `hub.brand.sig.lead`, `hub.brand.sig.label`, `hub.brand.sig.help`, `hub.brand.sig.none`
- `hub.brand.preview.*` (5): `hub.brand.preview.title`, `hub.brand.preview.page`, `hub.brand.preview.email`, `hub.brand.preview.live`, `hub.brand.preview.show`
- `hub.brand.pv.*` (4): `hub.brand.pv.cta`, `hub.brand.pv.services`, `hub.brand.pv.emailTitle`, `hub.brand.pv.emailCta`

Șterse (erau ale HubBusinessProfile, S147; nu le mai folosește nimic): `hub.nav.businessProfile`, `hub.nav.businessProfile.short`, `hub.business.lead`, `hub.business.logo.title`, `hub.business.logo.lead`, `hub.business.logo.rules`, `hub.business.logo.none`, `hub.business.logo.saved`, `hub.business.logo.errSmall`, `hub.business.logo.removeBody`, `hub.business.logo.ownerOnly`

#### `i18n/booking.json` — 7 chei noi

- `booking.msg.lang.*` (7): `booking.msg.lang.label`, `booking.msg.lang.help`, `booking.msg.lang.written`, `booking.msg.lang.missing`, `booking.msg.lang.default`, `booking.msg.lang.missingNote`, `booking.msg.lang.copyFrom`

#### `i18n/marketing.json` — 3 schimbate


Schimbate (textul nou în toate cele 6 limbi): `marketing.ed.p.headHelp`, `marketing.ed.p.colorV`, `marketing.ed.p.brandAction`

#### `i18n/founder.json` — 1 chei noi

- `founder.notifications.*` (1): `founder.notifications.seeAll`
