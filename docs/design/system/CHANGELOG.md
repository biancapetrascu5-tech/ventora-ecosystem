

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
