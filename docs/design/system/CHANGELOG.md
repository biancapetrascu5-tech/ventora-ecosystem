# CHANGELOG — Ventora design system

Fiecare intrare spune ce s-a schimbat pe componentă (structură, tokeni, texte, stări) și de ce, cu trimitere la registrul de decizii din `README.md` (S…, D-UX-4, R-…, PASUL 2).

**Versiuni.** Exportul din 25 octombrie 2026 e baza: fiecare componentă de acolo are versiunea 1.0.0. `manifest.json` dă versiunea de acum: **2.0.0** când se schimbă ce vede omul fără să schimbi codul (AttentionList); **1.1.0** când componenta are structură, proprietăți sau stiluri noi, compatibile; **1.0.1** când se schimbă doar textele, README-ul sau preview-ul; **1.0.0** pentru componentele noi și pentru cele neschimbate.

## 2026-10-28 — față de exportul din 25 octombrie 2026

### Pe scurt
- **13 componente noi:** AuthLayout, ecranele SMS (§1–§9) și cele ale autentificării în doi pași.
- **Tokeni:** niciun token adăugat sau schimbat (`tokens.json` identic). `tokens.css` e nou în export, generat din `tokens.json`.
- **D-UX-4:** numele afișate ale celor 13 module (EasyBook, ClientDesk, TeamSpace, MoneyDesk, TaskBoard, ShiftPlan, DocSpace, StockDesk, DataView, CampaignKit, EventSpace, AssetDesk, ContractDesk) în `APPS` și deci în AppIcon, AppTile, AppDock, AppLaunch, Spine, AccessBadge, invitație („Vei avea acces la”), launcher, catalog, Founder și Growth.
- **Autentificare:** P5 și D10 înlocuite de S58–S63 (autentificare în doi pași fără grație, cod la fiecare intrare, coduri de rezervă, blocare 15 minute după 5 coduri greșite). Cheile de traducere sunt în `i18n/two-factor.json`.
- **PASUL 2:** AttentionList e neutru implicit (b), UsageMeter la limită pentru proprietar și ceilalți (c), antetul Hub pe telefon (d), iconița `grid` (e), toate preview-urile complete (f).
- **Preview-uri (PASUL 2 f):** toate cardurile au stările din README, diacritice, DE/IT și frame-uri Light/Dark cu `data-theme` pe frame. Founder și Growth rămân doar în română (S57).

### Biblioteca (bundle.js, bundle.css) — schimbări care ating mai multe componente
- **Liste și meniuri care se deschid deasupra paginii** (Menu, Select, Combobox, DatePicker, Tooltip, LanguageSwitcher, NotificationsPanel, OrgSwitcher, AccountMenu, CommandPalette): păstrează tema locului din care se deschid. Într-un frame Dark sunt închise la culoare și pe o pagină luminoasă; zona de brand nu-și impune tema. Clasa `.v-portal-theme` nu adaugă niciun element vizibil.
- **Numere** (UsageMeter, Pagination, Stat, grafice): separatorul de mii apare mereu, și la patru cifre: „1.284”, nu „1284” (glosar, Cifre). Înainte, română, italiană și spaniolă grupau doar de la cinci cifre.
- **Texte noi (`S`):** `notif_operational`, `notif_activity` (S2); `auth_line1`, `auth_line2`, `auth_founder_product`, `auth_founder_tagline` (AuthLayout), în 6 limbi.
- **Iconițe noi:** `grid`, `grid-3x3`, `battery`, `battery-low`, `battery-charging`, `signal`, `qr-code`.
- **`APPS`:** numele celor 13 module (D-UX-4). Cheile (`booking`, `crm`…) și iconițele nu se schimbă.

### Componente noi

- **AuthLayout** (1.0.0) — pagina de autentificare ca componentă (R-2F9, S63), același nume și aceleași zone ca în packages/ui: panoul de brand, foaia cu formularul, banda cu logo pe telefon; în plus `brand="founder"`, `statement`, `wide`; fraza panoului tradusă în 6 limbi (chei `auth_line1/2`).
- **BookingSmsConnect** (1.0.0) — conectarea telefonului afacerii, 7 pași (SMS §2).
- **BookingSmsExtraPhone** (1.0.0) — telefonul în plus (SMS §6, R-T1, D-SMS-11).
- **BookingSmsList** (1.0.0) — lista mesajelor către clienți (SMS §5).
- **BookingSmsMessages** (1.0.0) — mesajele către client pe detaliul programării (SMS §3, S38: fără diacritice, cel mult 160 de caractere).
- **BookingSmsNotifications** (1.0.0) — notificările și e-mailul operațional (SMS §7, S55).
- **BookingSmsSettings** (1.0.0) — Setări · Trimitere SMS: SMS-urile pleacă de pe telefonul afacerii (SMS §1, S25–S33).
- **BookingSmsToday** (1.0.0) — alertele SMS din „Au nevoie de tine” (SMS §4; doar „telefonul e deconectat și are mesaje care așteaptă” e peach).
- **FounderBusinessSms** (1.0.0) — secțiunea SMS a unei afaceri în Founder (SMS §8, S56, S57).
- **FounderTwoFactor** (1.0.0) — autentificarea în doi pași în Founder, obligatorie pentru toți (S58, S63).
- **HubTwoFactorSetup** (1.0.0) — activarea autentificării în doi pași, 3 pași (S58, S60, S61).
- **HubTwoFactorVerify** (1.0.0) — verificarea după parolă și „Nu mai am acces” (S59, S61, S62).
- **SmsAppDownload** (1.0.0) — pagina publică de descărcare a aplicației pentru telefon (SMS §9, S68).

### Componente schimbate

#### AccessBadge — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### AccountMenu — 1.1.0
- Structură: prop nou `orgsInMenu`: „Afacerile tale” în meniu pe telefon, după lățimea layoutului (S66, PASUL 2 d); meniul păstrează tema locului din care se deschide (PASUL 2 f)
- Texte: README: selectorul de afacere pe telefon, `orgsInMenu`
- Preview: desktop și telefon, Light/Dark, DE/IT, fiecare meniu deschis

#### AddonPurchase — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### Agenda — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### AnalyticsDashboard — 1.0.1
- Texte: numele noi ale modulelor în README (D-UX-4)
- Preview: test de etichete DE (1280) și IT (390), cu textele ecranului traduse, în Light și Dark (PASUL 2 f)

#### AppDock — 1.1.0
- Structură: eticheta folosește toată lățimea aplicației (`100cqw`), ca numele noi să nu se taie (D-UX-4)
- Texte: numele afișate noi ale modulelor (D-UX-4)
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f); test cu toate cele 13 nume

#### AppIcon — 1.0.1
- Texte: numele noi ale modulelor în README (D-UX-4)
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### AppIconContext — 1.0.1
- Preview: test de etichete DE (1280) și IT (390), cu textele ecranului traduse, în Light și Dark (PASUL 2 f)

#### AppIconGrid — 1.0.1
- Preview: înălțimea cardului corectată

#### AppLaunch — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### AppShell — 1.0.1
- Texte: README corectat: varianta de telefon (bara de jos) începe sub 768px, cum face biblioteca, nu sub 640px
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### AppStates — 1.0.1
- Texte: numele noi ale modulelor în README (D-UX-4)
- Preview: test de etichete DE (1280) și IT (390), cu textele ecranului traduse, în Light și Dark (PASUL 2 f)

#### AppTile — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### AttentionList — 2.0.0
- Structură: tonul implicit e acum neutru; `tone: "attention"` (nou) dă peach, `tone: "danger"` roșu. Elementele fără `tone` care erau peach devin neutre — schimbare vizuală (S64, PASUL 2 b; înlocuiește regula din S1)
- Stări: neutru · attention · danger · cu acțiuni · cu oră · gol
- Texte: README rescris pentru cele trei tonuri
- Preview: cele trei tonuri, o zi reală în EasyBook, starea goală, Light/Dark, DE/IT

#### Avatar — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### Badge — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### BarChart — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### BookingCalendar — 1.0.1
- Texte: numele noi ale modulelor în README (D-UX-4)
- Preview: test de etichete DE (1280) și IT (390), cu textele ecranului traduse, în Light și Dark (PASUL 2 f)

#### BookingDetail — 1.0.1
- Texte: numele noi ale modulelor în README (D-UX-4)
- Preview: test de etichete DE (1280) și IT (390), cu textele ecranului traduse, în Light și Dark (PASUL 2 f)

#### BookingLimit — 1.0.1
- Texte: numele noi ale modulelor în README (D-UX-4)
- Preview: test de etichete DE (1280) și IT (390), cu textele ecranului traduse, în Light și Dark (PASUL 2 f)

#### BookingList — 1.0.1
- Texte: numele noi ale modulelor în README (D-UX-4)
- Preview: test de etichete DE (1280) și IT (390), cu textele ecranului traduse, în Light și Dark (PASUL 2 f)

#### BookingNew — 1.0.1
- Texte: numele noi ale modulelor în README (D-UX-4)
- Preview: test de etichete DE (1280) și IT (390), cu textele ecranului traduse, în Light și Dark (PASUL 2 f)

#### BookingSettings — 1.0.1
- Texte: numele noi ale modulelor în README (D-UX-4)
- Preview: test de etichete DE (1280) și IT (390), cu textele ecranului traduse, în Light și Dark (PASUL 2 f)

#### BookingStates — 1.0.1
- Texte: numele noi ale modulelor în README (D-UX-4)
- Preview: test de etichete DE (1280) și IT (390), cu textele ecranului traduse, în Light și Dark (PASUL 2 f)

#### BookingToday — 1.0.1
- Structură: pe telefon „Azi” începe cu „Următoarea programare” (corecția din §4)
- Texte: numele noi ale modulelor (D-UX-4)
- Preview: test de etichete DE (1280) și IT (390), cu textele ecranului traduse, în Light și Dark (PASUL 2 f)

#### BrandZone — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### Button — 1.1.0
- Structură: `href` (link) cu `block` nu mai iese din părinte (`box-sizing`)
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### CatalogRecommendation — 1.0.1
- Texte: numele noi ale modulelor în README (D-UX-4)
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### Checkbox — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### Combobox — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### CommandPalette — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### CommercialPreferences — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### CommercialStates — 1.0.1
- Preview: test de etichete DE (1280) și IT (390), cu textele ecranului traduse, în Light și Dark (PASUL 2 f)

#### ContextBar — 1.1.0
- Structură: pe telefon, când pagina are titlu, bara arată doar semnul Ventora (D-UX-4, `.v-cb-logo--mark`)
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### Cover — 1.0.1
- Preview: doar lățimea cardului (1200) scrisă explicit

#### CrmPipeline — 1.0.1
- Texte: numele noi ale modulelor în README (D-UX-4)
- Preview: test de etichete DE (1280) și IT (390), cu textele ecranului traduse, în Light și Dark (PASUL 2 f)

#### DataTable — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### DatePicker — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### Dialog — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### DiscoveryTooltip — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### Drawer — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### EmptyState — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### FileUpload — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### FinanceDue — 1.0.1
- Texte: numele noi ale modulelor în README (D-UX-4)
- Preview: test de etichete DE (1280) și IT (390), cu textele ecranului traduse, în Light și Dark (PASUL 2 f)

#### FormField — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### FounderBusiness — 1.0.1
- Texte: numele noi ale modulelor în ecrane (D-UX-4)

#### FounderBusinesses — 1.0.1
- Texte: numele noi ale modulelor în ecrane (D-UX-4)

#### FounderNewBusiness — 1.0.1
- Texte: numele noi ale modulelor în ecrane (D-UX-4)

#### FounderPacks — 1.0.1
- Texte: numele noi ale modulelor în ecrane (D-UX-4)

#### FounderPlanEditor — 1.0.1
- Texte: numele noi ale modulelor în ecrane (D-UX-4)

#### FounderPlans — 1.0.1
- Texte: numele noi ale modulelor în ecrane (D-UX-4)

#### FounderStates — 1.0.1
- Texte: numele noi ale modulelor în ecrane (D-UX-4)

#### FounderUsage — 1.0.1
- Texte: numele noi ale modulelor în ecrane (D-UX-4)

#### Glosar — 1.0.1
- Texte: secțiunile „SMS și telefonul afacerii” (S38, S47, S48) și „Cont și securitate” (autentificare în doi pași, aplicație de autentificare, cod de rezervă, cont blocat temporar, Ține-mă minte; S58–S61), în 6 limbi

#### GrowthAudiences — 1.0.1
- Texte: numele noi ale modulelor în ecrane (D-UX-4); valorile lungi din Select pe două rânduri (S40)

#### GrowthCampaignEditor — 1.0.1
- Texte: numele noi ale modulelor în ecrane (D-UX-4); valorile lungi din Select pe două rânduri (S40)

#### GrowthCampaigns — 1.0.1
- Texte: numele noi ale modulelor în ecrane (D-UX-4); valorile lungi din Select pe două rânduri (S40)

#### GrowthControl — 1.0.1
- Texte: numele noi ale modulelor în ecrane (D-UX-4); valorile lungi din Select pe două rânduri (S40)

#### GrowthOfferEditor — 1.0.1
- Texte: numele noi ale modulelor în ecrane (D-UX-4); valorile lungi din Select pe două rânduri (S40)

#### GrowthOffers — 1.0.1
- Texte: numele noi ale modulelor în ecrane (D-UX-4); valorile lungi din Select pe două rânduri (S40)

#### GrowthResults — 1.0.1
- Texte: numele noi ale modulelor în ecrane (D-UX-4); valorile lungi din Select pe două rânduri (S40)

#### GrowthSlot — 1.0.1
- Texte: numele noi ale modulelor în README (D-UX-4)
- Texte: numele noi ale modulelor în ecrane (D-UX-4); valorile lungi din Select pe două rânduri (S40)
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### HrAttendance — 1.0.1
- Texte: numele noi ale modulelor în README (D-UX-4)
- Preview: test de etichete DE (1280) și IT (390), cu textele ecranului traduse, în Light și Dark (PASUL 2 f)

#### HubAccount — 1.0.1
- Stări: proprietarul vede starea autentificării în doi pași („Activă · obligatorie pentru proprietar”), nu un comutator (S58); codul se cere la fiecare intrare cu parola (S59)
- Texte: „Coduri de rezervă” în loc de „Coduri de recuperare”; „Generează coduri noi” în loc de „Vezi codurile” (codurile se văd o singură dată) (S60)

#### HubAddonPurchase — 1.0.1
- Preview: test de etichete DE (1280) și IT (390), cu textele ecranului traduse, în Light și Dark (PASUL 2 f)

#### HubAdminAccess — 1.0.1
- Texte: numele noi ale modulelor în README (D-UX-4)
- Preview: test de etichete DE (1280) și IT (390), cu textele ecranului traduse, în Light și Dark (PASUL 2 f)

#### HubAdminPlan — 1.0.1
- Preview: test de etichete DE (1280) și IT (390), cu textele ecranului traduse, în Light și Dark (PASUL 2 f)

#### HubAdminTeam — 1.0.1
- Preview: test de etichete DE (1280) și IT (390), cu textele ecranului traduse, în Light și Dark (PASUL 2 f)

#### HubCatalog — 1.0.1
- Preview: test de etichete DE (1280) și IT (390), cu textele ecranului traduse, în Light și Dark (PASUL 2 f)

#### HubCatalogApp — 1.0.1
- Preview: test de etichete DE (1280) și IT (390), cu textele ecranului traduse, în Light și Dark (PASUL 2 f)

#### HubChooseBusiness — 1.0.1
- Preview: test de etichete DE (1280) și IT (390), cu textele ecranului traduse, în Light și Dark (PASUL 2 f)

#### HubEmpty — 1.0.1
- Preview: test de etichete DE (1280) și IT (390), cu textele ecranului traduse, în Light și Dark (PASUL 2 f)

#### HubInvite — 1.0.1
- Structură: pagina e AuthLayout cu `wide` (S63)
- Texte: README

#### HubLauncher — 1.0.1
- Stări: secțiune nouă: antetul pe telefon (logo, căutare, clopoțel, avatar) cu meniul contului deschis și „Afacerile tale” (S66, PASUL 2 d)
- Texte: README; numele noi ale modulelor (D-UX-4)

#### HubRecommendation — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### HubSignIn — 1.0.1
- Structură: pagina e AuthLayout (S63)
- Texte: README

#### HubStates — 1.0.1
- Stări: scoasă starea „Autentificarea în doi pași e oprită” (proprietar, 14 zile de grație), fiindcă P5 a fost înlocuit (S58)

#### HubSupport — 1.0.1
- Preview: test de etichete DE (1280) și IT (390), cu textele ecranului traduse, în Light și Dark (PASUL 2 f)

#### Icon — 1.1.0
- Structură: iconițe noi în registru: `grid`, `grid-3x3` (S67, PASUL 2 e), `battery`, `battery-low`, `battery-charging`, `signal`, `qr-code` (SMS); `Icon.names` include acum și iconițele adăugate
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f); setul cerut wrench, lock, globe, store, grid, arrow-right

#### IconButton — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### Input — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### InventoryStock — 1.0.1
- Texte: numele noi ale modulelor în README (D-UX-4)
- Preview: test de etichete DE (1280) și IT (390), cu textele ecranului traduse, în Light și Dark (PASUL 2 f)

#### Kanban — 1.0.1
- Texte: numele noi ale modulelor în README (D-UX-4)
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### Kbd — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### LanguageSwitcher — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### LineChart — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### Logo — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### Menu — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### Notice — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### NotificationsPanel — 1.1.0
- Structură: grupuri „Despre cont și funcționare” / „Activitate” după `category` (S2); antetul trece pe două rânduri când „Marchează tot ca citit” e lung (DE), în loc să împingă setările afară
- Texte: README: S2, `category?: "operational" | "activity"`
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### OrgSwitcher — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### PageHeader — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### Pagination — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### PortalPresence — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### ProgressBar — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### ProjectsBoard — 1.0.1
- Texte: numele noi ale modulelor în README (D-UX-4)
- Preview: test de etichete DE (1280) și IT (390), cu textele ecranului traduse, în Light și Dark (PASUL 2 f)

#### ProjectsTimeline — 1.0.1
- Texte: numele noi ale modulelor în README (D-UX-4)
- Preview: test de etichete DE (1280) și IT (390), cu textele ecranului traduse, în Light și Dark (PASUL 2 f)

#### Radio — 1.1.0
- Structură: un `RadioGroup` dezactivat estompează toate opțiunile
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### RecommendationCard — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### RecommendationLabel — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### RuleBuilder — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### Schedule — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### SegmentedControl — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### Select — 1.1.0
- Structură: `className="v-select--wrap"`: valoarea lungă trece pe două rânduri (S40, Founder Growth)
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### Sheet — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### Skeleton — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### SlotPicker — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### Spine — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### Stat — 1.0.1
- Texte: numele noi ale modulelor în README (D-UX-4)
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### StatusDot — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### StatusPill — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### Tabs — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### Textarea — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### ThemeSwitcher — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### Timeline — 1.0.1
- Texte: numele noi ale modulelor în README (D-UX-4)
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### Toast — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### Toggle — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### Tooltip — 1.0.1
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### UpgradeDialog — 1.1.0
- Structură: contorul înainte/după de după plată e mereu neutru: fără peach și fără mesajul de limită (R-T1, regulă în componentă)
- Texte: README: R-T1, `success.hint`
- Preview: toate stările din README, exemple cu diacritice, variantele DE/IT și frame-uri Light/Dark cu `data-theme` pe frame (PASUL 2 f)

#### UsageMeter — 1.0.1
- Texte: README aliniat cu bundle-ul și glosarul: „abonament”, nu „plan”; „Te apropii de limita abonamentului · Mai ai 138”, „Ai atins limita abonamentului. Nu se pierde nimic din ce ai…”, „Cere alt abonament”; documentate `onBuy`, `buyLabel`, `owner`, `onNotifyOwner` (S65, PASUL 2 c)
- Stări: sub prag · aproape (proprietar / ceilalți) · la limită proprietar („Cumpără pachet · 49 lei” + „Cere alt abonament”) · la limită ceilalți („…doar Bianca Petrașcu (proprietar).” + „Anunță proprietarul”) · nelimitat · cu unitate · compact
- Preview: toate stările, Light/Dark, DE, IT · Dark
- Numere: „1.000”, nu „1000”: separatorul de mii apare mereu (glosar, Cifre)

### Neschimbate
- **Italiano** (1.0.0).

### Găsite la testul DE/IT și încă nerezolvate
- Bara de jos pe telefon taie etichetele italiene lungi („Appuntam…”, „Abbonam…”). Ecranele trebuie să dea o etichetă scurtă (`short`) pentru fiecare element de navigare.
- Titlul din bara de sus pe telefon taie „Impostazioni”; eticheta „Oggi” de pe linia de azi din Timeline se taie.
- În meniul din stânga, la 1280, „Abonnement und Verbrauch” (DE) se termină cu „…”.
- Pe barele de servicii din DataView, pe telefon, numele lungi în germană se termină cu „…” (așa e făcută componenta).
- Tastatura nu poate fi arătată într-o imagine statică: mutarea cu săgețile în grila HubAdminAccess și în calendar e descrisă în README și în `api/`.

## 2026-10-28 · al doilea export (design system v55) — față de primul export din 28.10 (v49)

### HubTwoFactorVerify — 1.0.1 · FounderTwoFactor — 1.0.1
- Texte: adresa pentru recuperarea accesului e **support@ventorasystems.com** (R-2F7, S62), în locul exemplului ajutor@ventora-hub.com, pe ecranul „Nu mai am acces la telefon și nici la coduri”, în Hub și în Founder. Butonul „Scrie-ne pe e-mail” deschide aceeași adresă.
- i18n/two-factor.json: cheie nouă `auth.2fa.recovery.email` = support@ventorasystems.com; `auth.2fa.recovery.address` conține adresa direct, în toate cele 6 limbi (fără variabila `{email}`).

### Glosar — 1.0.2 · etichete scurte în bara de jos (aprobat, S70)
- Texte: secțiune nouă în glosar, „Etichete scurte în bara de jos pe telefon”. Forma scurtă (`short`) apare doar în bara de jos pe telefon; în rest se folosește forma lungă. Bara de jos lasă cel mult 70px pentru o etichetă (DM Sans 12px, 500, la 390px).

| Element | Formă lungă | Formă scurtă (`short`) | Lățime |
| --- | --- | --- | --- |
| Programări | IT „Appuntamenti” (82px) | **„Agenda”** | 44px |
| Programări | FR „Rendez-vous” (75px) | **„Agenda”** | 44px |
| Abonament | IT „Abbonamento” (82px) | **„Utilizzo”** | 41px |
| Abonament | FR „Abonnement” (74px) | **„Usage”** | 35px |
| Abonament | DE „Abonnement” (74px) | **„Abo”** | 23px |

- Ecranele care folosesc bara de jos (EasyBook și setările Hub) primesc `short` cu aceste valori, odată cu Lotul 2.4b.

### Glosar — EN în etichetele scurte (aprobat, S70)
- EN „Appointments” (82px) → **„Bookings”** (52px). Nu „Agenda”, care în engleză înseamnă ordinea de zi a unei ședințe.
- EN „Subscription” (73px) → **„Plan”** (24px). În glosar, EN pentru „abonament” e chiar „plan”; D1 interzice „plan” doar în română.

### ContextBar — 1.2.0 (P-1, S71, aprobat)
- Structură (stil): pe telefon, când bara are titlu, titlul ia tot locul liber până la iconițe; spațiul gol dinaintea iconițelor dispare. Ce nu încape se termină cu „…”, iar titlul întreg rămâne în PageHeader. Titlul are acum vreo 184px în loc de 90px, așa că „Impostazioni” (98px) și „Einstellungen” încap.
- Preview: secțiune nouă la 390px: italiană Light, germană Dark, un titlu foarte lung care se termină cu „…”, română Dark.
- Texte: README.

### Timeline — 1.1.0 (P-2, S71, aprobat)
- Structură: când perioadele nu încap toate, Timeline se deschide derulat astfel încât ziua de azi să stea la aproximativ o treime din lățimea vizibilă. Eticheta „azi” rămâne mereu pe ecran: centrată pe linie când încape, altfel mutată spre interior, inclusiv când linia iese din zona vizibilă la derulare. Eticheta se repoziționează la derulare și la redimensionare.
- Preview: secțiune nouă la 360px: română Light (se deschide derulat la azi), italiană Dark („Oggi” întreg), germană cu azi în ultima perioadă și română cu azi în prima perioadă (eticheta mutată spre interior).
- Texte: README.
- Folosită și în ProjectsTimeline, care primește comportamentul fără nicio schimbare în ecran.

## 2026-10-28 · al treilea export — față de al doilea export (v55/v56)

### Pe scurt
- **Lotul 2.4b, parola nouă:** două ecrane noi, HubPasswordReset și FounderPasswordReset (S72–S79). Cheile de traducere sunt într-un fișier nou, `i18n/password-reset.json` (40 de chei, 6 limbi).
- **Fișa 2FA închisă:** R-2F4, R-2F6, R-2F8 aprobate (S80); R-2F10 desenat (S81).
- **Tokeni, bundle.js, bundle.css:** neschimbate. Ecranele folosesc doar componente existente; „Arată parola” e butonul din `Input type="password"`.

### Componente noi
- **HubPasswordReset** (1.0.0) — „Ai uitat parola?”, „Verifică-ți e-mailul”, „Alege o parolă nouă”, „Parola e schimbată”, pe AuthLayout; 16 stări, DE/IT (S55, S72–S79).
- **FounderPasswordReset** (1.0.0) — aceleași ecrane cu `brand="founder"`, doar în română, cu rândul despre cod mereu vizibil (S57, S58, S72).

### Componente schimbate

#### HubTwoFactorVerify — 1.0.2
- Preview: secțiune nouă, „După intrarea cu un cod de rezervă”: toastul pe launcher (1280 și 390, Light/Dark), cele patru cazuri (7, 2, 1, 0 coduri) și testul DE/IT (R-2F10, S81).
- Texte: README.

#### FounderTwoFactor — 1.0.2
- Preview: toastul după intrarea cu un cod de rezervă, cele patru cazuri, Light/Dark (S81).
- Texte: README.

#### HubTwoFactorSetup — 1.0.2
- Preview: aceleași chei de traducere ca celelalte ecrane 2FA (fără schimbări vizibile).

#### AuthLayout — 1.0.1 · HubSignIn — 1.0.1
- Texte: README — AuthLayout e folosit și de HubPasswordReset și FounderPasswordReset; „Ai uitat parola?” din HubSignIn deschide HubPasswordReset cu adresa completată.

#### Glosar — 1.0.3
- Termen nou în „Cont și securitate”: **link pentru o parolă nouă** (nu „link de resetare”), în cele 6 limbi.

### i18n
- `i18n/password-reset.json` — nou, chei `auth.reset.*`.
- `i18n/two-factor.json` — chei noi `auth.2fa.backupLeft.title`, `.many`, `.few`, `.one`, `.none`, `.action`, în cele 6 limbi.

### Registru și documentație
- README: S72–S81; rândul nou din „Ecosistemul și regulile de produs” → Autentificare; inventarul (Ecrane Hub, Founder); tabelul de fișiere (`i18n/password-reset.json`).
- patterns.md → Intrarea: parola nouă.
- „D17” din cerere nu exista în registru (D1–D14); regula e acum S72.

### Încă deschis
- Textele e-mailului „Parola contului tău a fost schimbată” (S78) așteaptă aprobarea; după aprobare intră în BookingSmsNotifications, lângă celelalte e-mailuri din șablon.
- În Founder nu există încă o pagină de cont: unde duce „Generează coduri noi” din toast (S81) rămâne de stabilit.

## 2026-10-28 · al patrulea export — față de al treilea (v58)

### Pe scurt
- **FounderBackupCodes** (1.0.0) — nou: pagina „Coduri de rezervă” din Founder, la care duce „Generează coduri noi” (S84). Rezolvă punctul deschis din v58.
- **Registru:** S82 (e-mailul de securitate pleacă la orice schimbare de parolă, R-PR9), S83 (e-mailul nu se poate opri, R-PR10), S84; S78 reformulat după cerințele pentru textele e-mailului.
- **i18n/two-factor.json:** chei noi `auth.2fa.codes.title`, `.lead`, `.left`, `.oldStop`, `.confirmTitle`, `.confirmLead`, `.confirm`, `.cancel`, `.newDone`, în cele 6 limbi. Preview-urile 2FA au aceleași chei (fără schimbări vizibile).
- **Texte:** README — HubPasswordReset (S82, S83), HubAccount (rândul informativ despre e-mailurile de securitate, S83), FounderTwoFactor (toastul duce la FounderBackupCodes).
- **Tokeni, bundle.js, bundle.css:** neschimbate.

### Încă deschis (rezolvat în exportul următor)
- Textele e-mailului „Parola contului tău a fost schimbată” (S78) așteptau aprobarea.

## 2026-10-28 · al cincilea export — față de al patrulea

- **BookingSmsNotifications — 1.0.1:** e-mailul „Parola contului tău a fost schimbată” desenat în ambele variante (din „Ai uitat parola?” și din Contul tău · Securitate), pe telefon, în germană și italiană; rândul informativ „E-mailuri de securitate”, fără comutator, în preferințe (S83). README.
- **Registru:** S78 — textele e-mailului aprobate, cu cele 4 corecturi: expeditor noreply@ventora-hub.com, ora în fusul fix al e-mailurilor cu abreviere („10:32 EET”), fraza în două variante după sursă, „Nu ai fost tu?” doar text.
- **i18n/password-reset.json:** chei noi `auth.reset.email.*` (subject, pre, eyebrow, title, leadReset, leadAccount, ifYou, notYou, cta, why, from, securityRow), în cele 6 limbi.
- **HubPasswordReset:** README (trimitere la e-mailul desenat).
- **Încă deschis (rezolvat mai jos):** celelalte e-mailuri din preview (invitația, parola nouă, alertele SMS) folosesc încă expeditorii cont@ și notificari@; în cod toate pleacă de pe noreply@ventora-hub.com.

## 2026-10-28 · după al cincilea export (v62) — intră în exportul următor

- **BookingSmsNotifications — 1.0.2:** toate e-mailurile din preview pleacă de la Ventora <noreply@ventora-hub.com>, ca în cod: alertele SMS (înainte notificari@, și în testul DE/IT), invitația și parola nouă (înainte cont@). S3 spune expeditorul. README.

## 2026-10-28 · Lotul 2.5c — sesiunea de suport și recuperarea proprietarului (închide Faza 2)

### Componente noi
- **HubSupportSession** (1.0.0) — bannerul sesiunii de suport în launcher și în aplicații, închiderea (proprietar și admin), sesiunile în Administrare · Roluri și acces (S85; R-SS1–R-SS3 în review).
- **FounderSupportSession** (1.0.0) — deschiderea din pagina afacerii, eroarea „există deja o sesiune”, bannerul, închiderea și expirarea (S86; R-SS2, R-SS4 în review).
- **FounderOwnerRecovery** (1.0.0) — recuperarea accesului proprietarului, cu regula verificărilor și cele 11 stări (S87; R-SS5 în review).

### Altele
- **i18n:** `support-session.json` (6 limbi; RO aprobat, celelalte de verificat cu codul) și `founder-support.json` (RO).
- **assets/Logos:** `ventora-logo-email-2x.png` pentru antetul e-mailurilor (S88).
- **FounderBusiness:** în preview-urile noi, meniul „Mai multe” are „Deschide o sesiune de suport” și „Recuperează accesul proprietarului”. Cardul FounderBusiness rămâne neschimbat.
- **Încă deschis:** e-mailul E-6 către proprietari la deschiderea sesiunii — lipsesc textele.

## 2026-10-28 · Lotul 2.5c — deciziile R-SS1–R-SS8 și e-mailul E-6

- **Registru:** S89–S96 (R-SS1–R-SS8) și S97 (E-6). S86 și S87 spun acum durata și limitele.
- **FounderSupportSession — 1.0.1:** durata 30 de minute / 1 oră / 2 ore / 4 ore, implicit 1 oră (S92); motivul 10–1.000 de caractere, cu contor; referința cel mult 255 (S93). Texte de ajutor actualizate (propuneri). README.
- **FounderOwnerRecovery — 1.0.1:** motivul 10–1.000 de caractere, cu contor; referința cel mult 255 (S93). README.
- **HubSupportSession — 1.0.1:** EN/FR/ES/DE/IT pentru `support.session.banner.*` din cod (S96); dialogul de închidere cu titlul `close`, fără `closeTitle` (S94); propunerile FR/IT folosesc „support/supporto”. README.
- **BookingSmsNotifications — 1.1.0:** e-mailul E-6 (S97), cardurile 11–12; șablonul primește salut, paragraf îngroșat și semnătură, iar rândul de după buton apare doar când are text. README.
- **i18n:** `support-session.json` (traducerile din cod), `founder-support.json` (textele de ajutor pentru durată și limite).

## 2026-10-28 · Lotul 2.5c — texte aprobate, E-6 aliniat cu codul (lotul e închis)

- **Registru:** S98 (cele 71 de texte noi aprobate în română, cu corectura la `founder.recovery.check.emailHelp`) și S99 (E-6 după review). S97 trimite la cheile din cod.
- **BookingSmsNotifications — 1.1.1:** E-6 folosește cheile din cod `email.supportSession.*`; rânduri noi `reason` („Motivul: {reason}”) și `footer` („Primești acest e-mail pentru că ești proprietarul afacerii {businessName} în Ventora.”); ora „pe 28 octombrie, la 18:30 EET”. README.
- **FounderOwnerRecovery — 1.0.2:** textul nou pentru verificarea prin e-mail (S98). README.
- **HubSupportSession, FounderSupportSession — 1.0.2:** textele noi nu mai sunt propuneri (S98). README.
- **i18n:** `founder-support.json` (corectura `founder.recovery.check.emailHelp`).

## 2026-10-29 · Închiderea Fazei 2 — securitatea contului, intrarea în Founder, corecturi

### Componente noi
- **HubAccountSecurity** (1.0.0) — Contul tău · Securitate: „Schimbă parola” cu cerințele live și cele 7 stări (S100); autentificarea în doi pași pentru un membru care nu o are activă: rândul, cei 3 pași de activare, starea activă și propunerea „Dezactivează” (S108). Chei în `i18n/account-security.json`, 6 limbi; test DE/IT.
- **FounderSignIn** (1.0.0) — intrarea în Founder pe AuthLayout `brand="founder"`, doar în română; eroare, se verifică, prea multe încercări (15 minute, cu ora) (S101, S102). Chei în `i18n/founder-auth.json`.

### Componente schimbate
- **FounderPasswordReset — 1.0.1:** „Cel puțin 12 caractere” (`auth.reset.req.lengthFounder`), verificarea la 12 (S103).
- **HubTwoFactorVerify — 1.0.2, FounderTwoFactor — 1.0.2, HubTwoFactorSetup — 1.0.1, FounderBackupCodes — 1.0.1:** cod de rezervă greșit sau folosit = un singur mesaj (`auth.2fa.error.backupWrong`, text nou propus); `auth.2fa.error.backupUsed` scos; starea separată scoasă din HubTwoFactorVerify (S105). README.
- **HubStates — 1.0.1:** „Mai încearcă peste 15 minute…” (era 5, S102).
- **HubSupportSession — 1.0.3:** starea „Închisă automat” în lista sesiunilor (S106); traducerile revizuite (S109).
- **HubAccount, HubSignIn, AuthLayout — README:** trimiteri la ecranele noi; 15 minute.

### Tokeni și bibliotecă
- **tokens.json:** stilurile `display-hub-phone` (32/36) și `lead-phone` (15/30) (S107).
- **bundle.css:** sub 768px, `.display-hub` și `.lead` iau mărimile de telefon (S107).

### i18n
- `two-factor.json`: `auth.2fa.error.backupWrong` nou, `auth.2fa.error.backupUsed` scos, `auth.2fa.setup.s1.leadMember` nou.
- `password-reset.json`: `auth.reset.req.lengthFounder` (RO).
- `support-session.json`: `support.sessions.status.closedAuto` (6 limbi); EN–IT revizuite (S109).
- Noi: `account-security.json`, `founder-auth.json`.

### Încă deschis
- Traducerile din cod pentru `hub.chooseBusiness.*`, `auth.signIn.*`, `invite.requested/revoked/used.*`, `account.lead`, `account.notifications.lead`, `account.security.*`, `roles.*`: nu sunt în design system; se verifică după lista din cod.

## 2026-10-30 · S110 — parola la activarea doi pași, dispozitive fără oraș

- **HubAccountSecurity — 1.1.0:** la „Activează” (membru), pasul 1 cere întâi parola actuală, cu „Ai uitat parola?” și „Confirmă parola”; codul QR și cheia apar doar după confirmare; starea „Parola actuală nu e corectă.” (desktop și foaia de jos pe telefon). „Dispozitive conectate”: sistem · browser · oră, fără oraș; „Acest dispozitiv” pentru dispozitivul curent. Ora: „Activ acum”, „Azi, 14:32”, „Ieri, 21:40”, „28 oct., 09:15”; la fel „Schimbată: …” pentru parolă. Test DE/IT/FR. README.
- **HubAccount — 1.0.2:** aceleași rânduri de dispozitiv și același format de oră în preview. README.
- **i18n `account-security.json`:** noi `account.security.when.now/today/yesterday/date`, `account.security.devices.thisDevice`, `account.security.twoStep.passwordLead`, `account.security.twoStep.confirmPassword`, `account.security.twoStep.error.password` (6 limbi); `account.security.password.changed` devine „Schimbată: {when}”; `account.security.devices.current` scos.

## 2026-10-30 · S111 — Fazele 3 și 4: comercial și suport

### Componente noi
- **FounderBusinessBilling** (1.0.0) — tabul „Plăți și facturi”: abonamentul și cum se plătește, istoricul cumpărărilor cu factura, rambursarea (confirmare, motiv, stornare; refuz de la Stripe), confirmarea încasării prin transfer (data, suma, suma diferită). Doar RO.
- **FounderRequests** (1.0.0) — „Cereri din Hub”: noi / toate, rezolvare, refuz cu motiv, listă goală. Doar RO.
- **HubSupportThread** (1.0.0) — pagina unei solicitări: firul, răspunsul cu atașamente și erorile lor, se trimite, trimis, rezolvat, redeschidere; istoricul stării; test DE/IT.

### Componente schimbate
- **AddonPurchase — 1.1.0:** `invoice: { pending: true }` — plata a reușit, factura vine pe e-mail; texte noi `paySuccessHintPending`, `invoicePending` (6 limbi); clasa `.v-payinvoice--pending`. UpgradeDialog o primește la fel. `index.d.ts`.
- **HubAddonPurchase — 1.0.1:** ecranul „plata a reușit, factura vine în curând”.
- **HubAdminPlan — 1.1.0:** varianta fără Growth Engine (prop `growth`), nota de consum la pachetul potrivit, rândul „Factura se emite”.
- **BookingSmsNotifications — 1.2.0:** e-mailul E-7, cardurile 13–16.
- **Spine Founder:** „Cereri” după „Consum”, în toate preview-urile Founder și Growth (și HubSupportSession, care folosește același preambul).
- **README:** FounderBusiness, HubAddonPurchase, AddonPurchase, HubAdminPlan, HubSupport, NotificationsPanel, BookingSmsNotifications.

### i18n
- Noi: `founder-commercial.json` (RO), `commercial.json`, `support.json`, `notifications.json` (6 limbi). Textele din HubSupport și HubStates (suport) și cele ale panoului de notificări erau până acum doar în preview-uri sau în bibliotecă.


## 2026-10-31 · S112 — completări după Lotul 2.8

### Componente noi
- **HubBusinessSuspended** (1.0.0) — afacerea suspendată în Hub: ecranul care înlocuiește alegerea afacerii când e singura (fără motiv, neutru, adresa de suport ca link, „Scrie-ne la suport”, „Ieși din cont”); rândul „Acces oprit” în alegerea afacerii, cu nota de sub listă; OrgSwitcher cu rândul oprit (pe telefon, în meniul contului); test DE/IT.
- **HubTeamInvite** (1.0.0) — „Invită o persoană”: adresa, rolul Membru / Admin, aplicațiile; adresă greșită, deja în echipă, invitație deja trimisă (cu „Retrimite invitația”), nicio aplicație, se trimite, trimisă; foaie de jos pe telefon; test DE/IT.
- **FounderBusinessActions** (1.0.0) — o afacere în Founder: acțiunile din antet pe telefon (aceeași pereche ca pe desktop), „Mai multe acțiuni” deschis, afacerea suspendată, confirmarea „Reactivează afacerea”, toastul și „Ultimele modificări”; pluralul din dialogul de suspendare. Doar RO.

### Componente schimbate
- **OrgSwitcher — 1.1.0:** `suspended` pe o afacere din `orgs`: rândul arată „{rol} · Acces oprit” și un lacăt, e `disabled` / `aria-disabled` și nu se poate alege. Text nou în bibliotecă: `accessStopped` (6 limbi). `index.d.ts` (`Org.suspended`). AccountMenu îl moștenește.
- **FounderBusiness — 1.0.1:** pe telefon apar acțiunile din antet („Adaugă o excepție” și „Mai multe acțiuni”); meniul are și „Deschide o sesiune de suport” și „Recuperează accesul proprietarului”. La fel în preview-urile care folosesc același antet (FounderOwnerRecovery, FounderSupportSession, FounderBusinessSms, FounderBusinessBilling, FounderRequests, HubSupportSession).
- **„Angajați” → „membri” / „locuri în echipă”** (limita `platform.members`): FounderPlans, FounderPlanEditor, FounderPacks, FounderUsage, FounderBusiness, FounderStates („Limită de membri”), HubAdminPlan (și DE „Teamplätze”, IT „Posti nel team”), UsageMeter (preview), HubAdminTeam („4 din 10 locuri în echipă”, „Ai ocupat toate cele 10 locuri din echipă”, „5 locuri în echipă în plus”), rolul „Angajat” → „Membru” (HubAdminTeam, HubChooseBusiness; DE „Mitglied”, IT „Membro”). Datele comune din toate preview-urile Founder și Growth (limitele abonamentelor, excepția „12 membri în loc de 10”).
- **Rămâne „Angajați”** (personalul afacerii): meniul EasyBook din Spine, descrierea din PageHeader („pe angajați și pe servicii”), coloana „Angajat” din BookingSmsNotifications, textul DataView din GrowthOfferEditor. FounderBusinessSms nu are „Angajați” al lui, doar datele comune, schimbate mai sus.
- **README:** OrgSwitcher, HubChooseBusiness, HubAdminTeam, FounderBusiness, FounderPlans, FounderPlanEditor, FounderPacks, FounderUsage, HubAdminPlan, UsageMeter, PageHeader. **Glosar:** „angajat” restrâns la personal; rânduri noi „membru” și „loc în echipă”.

### i18n
- Noi: `business-access.json`, `team.json` (6 limbi), `founder-business.json` (RO). Textele scrise de agent fără design (Hub: „A cerut o invitație nouă”, meniul Hub și pagina Echipă în EN/FR/ES; Founder: „Suspendată”, „Reactivează afacerea”, „Ultimele modificări”, pluralul din suspendare, eroarea la crearea afacerii) sunt aici, corectate, ca chei.

## 2026-10-31 · S113 — completări pentru Faza 3: lunar sau anual, lei și euro, reduceri, direct sau la cerere, proporțional

### Componente noi
- **FounderApps** (1.0.0) — „Aplicații”: prețul lunar în lei și în euro, costul de implementare, comutatorul „Direct / La cerere” (blocat când există cost de implementare). Intrare nouă în Spine. Doar RO.
- **FounderDiscounts** (1.0.0) — reducerile unei afaceri în „Plăți și facturi”: lista, „Adaugă o reducere” (abonament sau linie, procent sau sumă fixă, o dată / N luni / permanent, motiv), 100% = gratuit, erorile, „Încheie reducerea”; pagina „Reduceri” cu toate reducerile permanente, intrare nouă în Spine. Doar RO.
- **HubPlanBilling** (1.0.0) — cum plătește afacerea: lunar sau anual, următoarea plată, limitele lunare pe anual, reducerile ca linii separate, factura, pachetul lunar plătit proporțional; test DE (afacere în euro) / IT.
- **HubAppActivation** (1.0.0) — activarea unei aplicații: directă, cu plata de azi proporțională și apoi lunară; la cerere, cu cererea trimisă; test DE/IT.

### Componente schimbate
- **AddonPurchase — 1.2.0:** `prorate: { today, until, monthly? }`; texte noi `prorateToday`, `prorateThen` (6 limbi); `addon.max === 1` ascunde cantitatea; suma de plată nu se mai rupe pe două rânduri (`.v-payline--total > .numeric`). `index.d.ts`.
- **Icon:** iconița nouă `percent` (intrarea „Reduceri”).
- **FounderPlans — 1.1.0, FounderPlanEditor — 1.1.0, FounderPacks — 1.1.0:** preț lunar și anual, în lei și în euro; erorile de preț în editor; dialogul de editare a unui pachet.
- **FounderNewBusiness — 1.1.0:** „Moneda afacerii” și „Plata” (lunar / anual); prețul în invitație.
- **FounderBusiness — 1.0.2:** cardul abonamentului: cum plătește, moneda, reînnoirea pe 17, consumul de la 17; „Consum: 17 oct. – 16 nov.” (și în preview-urile cu același antet).
- **HubAdminPlan — 1.1.1:** „Plătești lunar: 349 lei · următoarea plată pe 17 noiembrie 2026”; „Consumul pornește de la zero pe 17 noiembrie.”; perioada reală pe facturi și pe pachete (RO/DE/IT).
- **HubCatalogApp — 1.1.0:** varianta „La cerere” (costul de implementare, nota, „Cere activare”, fără probă); test DE.
- **CommercialStates — 1.0.1:** testul DE/IT păstrează „lei”; prețurile rămân în moneda afacerii.
- **Spine Founder:** „Aplicații” și „Reduceri” sub „Model comercial”, în toate preview-urile Founder și Growth (și HubSupportSession).
- **README:** cele de mai sus, plus FounderBusinessBilling. **Glosar:** plată lunară, plată anuală, monedă, reducere, la cerere, proporțional.

### i18n
- Noi: `pricing.json` (6 limbi), `founder-pricing.json` (RO).

## 2026-10-31 · S114 — meniul unui membru și textele agentului

### Componente noi
- **HubTeamMemberActions** (1.0.0) — meniul unui membru în HubAdminTeam: „Schimbă rolul”, „Acces la aplicații”, „Oprește accesul / Redă accesul”, „Elimină din afacere” (confirmare, „Se salvează…”, salvat, eroare la salvare, eroare „doar proprietarul”); vederea proprietarului și a unui admin; pagina principală Hub până la launcher; test DE/IT.

### Componente schimbate
- **README:** HubAdminTeam (regula admin / proprietar și dialogurile).

### i18n
- `team.json`: chei noi `hub.team.*` (inclusiv `hub.team.save`, `hub.team.actionError`, validate) și `hub.home.*` (`hub.home.soon`, validat), 6 limbi.
- `founder-business.json`: `founder.business.suspended.noticeNoName` (RO), pentru nota fără numele celui care a suspendat.

## 2026-10-31 · S114b — notificările din Contul tău și logo-ul varianta B

### Componente schimbate
- **HubAccount — 1.1.0:** „Notificări” refăcute (D4-6, D4-7): „În aplicație” informativ („Mereu”), comutator pe e-mail pe fiecare categorie, securitatea „Nu se pot opri”, fără coloana SMS, „Recomandări Ventora” și „Noutăți de la Ventora” separat (Noutăți: e-mail oprit implicit); pe telefon, pagina „Notificări” cu comutatoare; test DE/IT.
- **Logo — 2.0.0:** pe fundal închis, varianta B (fețe separate prin tăieturi transparente, mască SVG), cu id de mască unic pe instanță (`ventora-logo-dark-cut-{id}`; în bibliotecă de la versiunea publicată înaintea acestei intrări); se vede în Logo, BrandZone, AuthLayout și ecranele de autentificare. `assets/Logos/favicon.svg`: varianta B în modul închis.
- **Sincronizarea Lotului 3.4:** `assets/Logos/ventora-logo-dark.svg`, `ventora-mark-dark.svg`, `favicon.svg` și componenta Logo se iau din design system (excepție, doar pentru ele).

### i18n
- `notifications.json`: `notifications.prefs.*` (6 limbi).

## 2026-10-31 · S115 — notificările Fazei 3

### Componente noi
- **BillingNotifications** (1.0.0) — notificările în aplicație (proprietar și ceilalți, light și dark, telefon) și e-mailurile pentru factură, plată, limite, anunțul de 30 de zile, perioada de probă, costul de implementare și neplata; test DE/IT.

### Componente schimbate
- **NotificationsPanel — 1.2.0:** `action` pe o notificare (rândul „Vezi factura →” sub text). `index.d.ts`.
- **README:** NotificationsPanel, BookingSmsNotifications.

### i18n
- `notifications.json`: `notifications.billing.*`, `email.billing.*` (6 limbi).

## 2026-10-31 · S117 — modelul comercial: aplicații la bucată și bundle-uri

Decizia fondatoarei din 31.10: afacerile cumpără aplicații la bucată și bundle-uri. „Abonament” rămâne doar pentru ce plătește afacerea în total.

### Componente noi
- **HubCatalogBundles** (1.0.0) — catalogul din Hub: bundle-urile disponibile acum („Ofertă valabilă până pe 30 noiembrie”), prețul lunar și anual, „Separat: 366 lei pe lună” și „Economisești 47 lei pe lună”, limitele și locurile incluse, implementarea; bundle-ul pe care afacerea îl are („Ai acest bundle”, îl păstrează la prețul ei); „Cere acest bundle” și confirmarea; dedesubt, aplicațiile la bucată (mentenanță, implementare). 6 limbi (EN/FR/ES în testul de limbă), test DE/IT.

### Componente schimbate
- **AddonPurchase — 1.3.0:** `setup` (implementarea, o singură dată, plătită azi peste mentenanță: rândul „Implementare, o singură dată”, nota „Mentenanța: {amount}, proporțional până pe {date}”, butonul cu totalul de azi) și `addon.includes` (lista „Include”). Texte noi `setupOnce`, `prorateMaint`, `addonIncludes` (6 limbi). `index.d.ts`, `bundle.css` (`.v-addon__inc`, `.v-addon__inclist`).
- **FounderApps — 1.1.0:** mentenanța lunară și anuală, în lei și în euro; implementarea; „Limite incluse”; „Direct / La cerere” nu mai e blocat de implementare; panoul „Editează EasyBook”.
- **FounderPlans — 2.0.0:** devine „Bundle-uri”: aplicațiile, prețul față de aplicațiile luate separat (economia), limitele și locurile incluse, implementarea, perioada de vânzare și starea („În vânzare”, „Programat”, „Vânzare oprită”), versiunile cu perioada lor și numărul de afaceri; „Oprește vânzarea” (confirmare, toast), „Ofertă nouă”. Numele componentei rămâne deocamdată (vezi „Ce ai de decis”).
- **FounderPlanEditor — 2.0.0:** „Ofertă nouă” pentru un bundle: aplicațiile (cu prețul la bucată și totalul separat), patru prețuri, implementarea, limitele, locurile în echipă din bundle, perioada de vânzare; erori: prețul nu e mai mic decât aplicațiile separat, perioada se suprapune cu oferta de acum; „Programează oferta”.
- **FounderNewBusiness — 1.2.0:** „Ce cumpără”: bundle (doar cele în vânzare) și/sau aplicații la bucată (cele din bundle sunt deja incluse), moneda, lunar / anual; rezumatul cu fiecare linie, totalul, implementarea și locurile; invitația spune ce primește și cât plătește.
- **FounderPacks — 1.1.1:** coloana „Planuri” devine „Disponibil pentru” (aplicația de care ține pachetul).
- **HubCatalogApp — 1.2.0:** „Mentenanță · 49 lei pe lună”, „Cost de implementare · 150 lei, o singură dată”, „Ce include” (RO/DE/IT).
- **HubAppActivation — 1.1.0:** activarea unei aplicații la bucată: implementarea, mentenanța proporțională, totalul de azi (172,13 lei), apoi 49 lei pe lună; ce include.
- **HubPlanBilling — 1.1.0:** „Ce plătești”: Bundle Business (300 lei, prețul păstrat), CampaignKit · aplicație la bucată, locurile în echipă (3 + 7, incluse), pachetele, totalul; reducerile pe bundle și pe aplicație; factura; o stare nouă cu pachetul de 5 locuri (15 locuri, 409 lei).
- **HubAdminPlan — 1.2.0:** „Bundle Business” și „Ce plătești” în „Abonamentul tău”; aplicațiile afișate sunt cele ale afacerii; pe facturi „Abonament · 17 oct. – 16 nov.” (RO/DE/IT).
- **HubAdminTeam — 1.1.1:** de unde vin locurile („Din cele 10 locuri: 3 sunt incluse în orice cont, 7 vin din bundle-ul Business.”); în UpgradeDialog, opțiunea „Bundle Business Plus” în locul abonamentului Business Plus.
- **Spine Founder:** „Model comercial” — „Aplicații”, „Bundle-uri”, „Pachete în plus”, „Reduceri”, în toate preview-urile Founder și Growth; căutarea: „Caută o afacere, un bundle sau o campanie”.
- **README:** cele de mai sus, AddonPurchase. **Glosar:** bundle, aplicație la bucată, mentenanță, implementare, versiune (de bundle); „abonament” doar pentru totalul afacerii; nota la „ofertă”.

### i18n
- `pricing.json`: `catalog.bundles.*`, `catalog.alaCarte.*`, `catalog.setup`, `catalog.noSetup`, `catalog.app.*` (mentenanța, implementarea, ce include), `billing.have.*`, `seats.*`, `limits.*` (6 limbi).
- `founder-pricing.json`: `founder.apps.*` (noi), `founder.bundles.*`, `founder.bundleEditor.*`, `founder.new.*` (noi) — RO.

## 2026-11-01 · S117 — FounderPlans devine FounderBundles

Decizia ta la P-S117-6: ecranul gestionează bundle-uri, iar după S117 nu mai avem „planuri”.

### Componente schimbate
- **FounderBundles — 2.0.1** (fostul FounderPlans): componenta și preview-ul au numele nou; `FounderPlans` nu mai există. Titlul ecranului rămâne „Bundle-uri”. Conținutul nu se schimbă.
- **Spine Founder:** intrarea „Bundle-uri” are id-ul `bundles` (era `planuri`), în toate preview-urile Founder și Growth. FounderPlanEditor deschide tot „Bundle-uri” în Spine.
- **HubSupportSession:** Spine-ul Founder din preview avea încă ordinea de dinainte de S117 („Planuri” primul). Acum e la fel ca în celelalte: „Aplicații”, „Bundle-uri”, „Pachete în plus”, „Reduceri”.
- **README:** registrul S117, lista componentelor Founder și descrierea au numele FounderBundles. Intrările mai vechi din CHANGELOG și din registru păstrează numele de atunci.

## 2026-11-01 · Marca: „Ventora Systems” (MARCA-1)

Decizia fondatoarei: numele vizibil e „Ventora Systems”, peste tot; „Ventora” singur nu mai apare în interfață, texte sau e-mailuri (marca „Ventora” e înregistrată de altcineva la EUIPO).

### Logo
- `assets/Logos/ventora-logo.svg`, `ventora-logo-dark.svg`: wordmark-ul „VENTORA SYSTEMS” pe un rând (Montserrat ExtraBold, ca vechiul „VENTORA”, aceeași spațiere), 415 × 68. Nou: `ventora-logo-stacked.svg`, `ventora-logo-stacked-dark.svg` — pe două rânduri, 250 × 68, pentru spații înguste. `ventora-logo-email-2x.png`: 537 × 88, afișat la 268 × 44. Semnul (`ventora-mark*.svg`, `favicon.svg`) rămâne; doar numele accesibil devine „Ventora Systems”.
- **Logo — 3.0.0:** `variant="stacked"`; `full` are proporțiile noi; titlul implicit „Ventora Systems”; id-ul de mască unic și pentru varianta pe două rânduri. `index.d.ts`.
- **AuthLayout — 1.1.0:** logo-ul pe un rând pe desktop, pe două rânduri sub 1024px și pe banda de pe telefon (`bundle.css`).
- **Spine — 1.1.0:** Spine-ul Hub-ului desfășurat arată logo-ul pe două rânduri; numele accesibil al Hub-ului e „Hub” (nu „Ventora”).
- **Cover:** logo-ul pe două rânduri, în locul vechiului wordmark.
- **README:** Logo, BrandZone, `assets/Logos/README.md`.

### Texte
- „Ventora” → „Ventora Systems” în toate componentele (preview-uri, README-uri), în bibliotecă (`allApps`, `auth_founder_tagline`, 6 limbi), în `README.md` și `patterns.md` și în i18n; în germană, cuvintele compuse cu cratimă („Ventora-Systems-Team”). Titlul filei fără context: „Hub · Ventora Systems”. Intrările mai vechi din registru și din CHANGELOG rămân cum erau.
- Nu se schimbă: domeniile și adresele (ventora-hub.com, noreply@…), numele fișierelor, identificatorii din cod (`window.Ventora`, `VentoraProvider`).
- **Glosar:** secțiunea nouă „Marca”.
- Numele sistemului: „Ventora Systems” (`design-system.json` `title`, `tokens.json` `name`); spațiul de nume din cod rămâne `Ventora`.

### i18n
- `business-access.json`: `hub.suspended.body` (6 limbi)
- `founder-pricing.json`: `founder.apps.onRequestHelp` — scos: `founder.apps.setupLocked` (RO)
- `notifications.json`: `email.billing.setup.accepted.lead`, `email.billing.why`, `notifications.prefs.cat.supportSession`, `notifications.prefs.news.desc`, `notifications.prefs.news.title`, `notifications.prefs.reco.title`, `notifications.support.reply.body` (6 limbi)
- `password-reset.json`: `auth.reset.email.eyebrow`, `auth.reset.email.from`, `auth.reset.email.subject`, `auth.reset.email.why`, `auth.reset.sent.body` (6 limbi)
- `pricing.json`: `catalog.app.onRequestNote`, `catalog.app.requestSentBody`, `catalog.bundles.requestNote`, `catalog.bundles.requestSentBody` (6 limbi)
- `support-session.json`: `support.session.banner.closeConfirm`, `support.session.banner.message`, `support.sessions.col.who`, `support.sessions.lead` (6 limbi)
- `support.json`: `email.supportReply.body`, `email.supportReply.lead`, `email.supportReply.preheader`, `email.supportReply.why`, `support.thread.team` (6 limbi)
- `team.json`: `hub.team.remove.account` (6 limbi)
- `two-factor.json`: `auth.2fa.founder.tagline`, `auth.2fa.setup.s2.lead` (6 limbi)

### Curățenie după FounderBundles
- `manifest.json` și `api/components/*.md` sunt generate de pagina design system-ului la salvare; nu le scriem de aici. Vor pierde FounderPlans la următoarea salvare din pagină.

## 2026-11-03 · Logo: S-ul din „SYSTEMS” peach

- `assets/Logos/ventora-logo.svg`, `ventora-logo-dark.svg`, `ventora-logo-stacked.svg`, `ventora-logo-stacked-dark.svg`: primul S din „SYSTEMS” e peach (#FFAA75), ca V-ul din „VENTORA”, în toate variantele, light și dark. Restul wordmark-ului nu se schimbă.
- **Logo — 3.0.1** (în bibliotecă, aceleași patru desene), **Cover**, `ventora-logo-email-2x.png` (537 × 88, refăcut din `ventora-logo.svg`).
- **README:** Logo, `assets/Logos/README.md`, README („Logo”).

## 2026-11-03 · Logo pe două rânduri: „SYSTEMS” mai mic, centrat

- `assets/Logos/ventora-logo-stacked.svg`, `ventora-logo-stacked-dark.svg`: „SYSTEMS” are 62% din mărimea lui „VENTORA” și stă centrat sub el (varianta C, aleasă de fondatoare). Inițialele V și S rămân peach.
- Nou: `ventora-logo-stacked-small.svg`, `-dark.svg` — varianta de până acum („SYSTEMS” la mărime întreagă, aliniat la stânga), pentru mărimi mici, unde „SYSTEMS” mai mic nu s-ar citi.
- **Logo — 3.1.0:** `variant="stacked"` alege singur varianta mică sub 32px înălțimea semnului (Spine-ul Hub-ului, 28px); de la 32px în sus, „SYSTEMS” centrat (panoul de autentificare sub 1024px, banda de pe telefon, coperta). `index.d.ts`.
- **Cover:** logo-ul cu „SYSTEMS” centrat.
- **README:** Logo, `assets/Logos/README.md`, README („Logo”).


## 2026-11-04 · S116 — pilotul Booking, suportul în Founder, automatizările, textele aplicațiilor

### Componente noi (1.0.0)
- **BookingPublic** — pagina publică de rezervare: serviciu, cu cine, ziua și ora, datele cu verificarea anti-robot, codul din e-mail; fără loc liber, nimic liber în 30 de zile, ora luată între timp, erori, confirmată / cerere trimisă. Câmpurile medicale opționale (cadrele 8b–8c).
- **BookingDeposit** — avansul prin Stripe: suma și politica înainte de plată, 3-D Secure, eșuat, plătit, „Așteaptă plata”, expirat.
- **BookingStatuses** — cele 7 stări D-B-11, StatusPill pentru fiecare, BookingDetail în fiecare stare, cu tranzițiile permise.
- **BookingClientCard** — fișa clientului: istoricul, nota „Risc ridicat”, vederea membrului, ștergerea notei cu motiv.
- **BookingPayments** — Setări · Plăți și avans: Stripe Connect (neconectat, în verificare, activ, cu probleme), avansul, rambursarea, deconectarea.
- **BookingHealthFields** — câmpurile medicale: setările, fișa, retragerea consimțământului (de salon sau de client), cine le vede.
- **BookingClientEmails** — codul de verificare, confirmarea, reminderul, anularea (client / salon), modificarea, avansul primit, avansul rambursat.
- **FounderSupportInbox** — Founder · Suport: lista cu filtre, firul, răspunsul echipei cu atașamente, stările goale. Doar RO.
- **FounderAutomations** — constructorul din lista albă, pornirea per afacere cu audit, jurnalul execuțiilor. Doar RO.
- **HubAutomations** — automatizările afacerii, fără pornire/oprire, cu UsageMeter.
- **HubAppTexts** — numele și descrierile celor 15 aplicații, în 6 limbi.

### Componente schimbate
- **AppTile — 1.1.0:** `onDetails` pe un card blocat arată „Vezi detaliile” și fără recomandare (decizia 3.7); acțiunea de acces trece lângă el, discret (`.v-apptile__act2`). `bundle.js`, `bundle.css`, `index.d.ts`, preview, README.
- **HubSupportThread — 1.0.1:** „Îți răspundem aici și pe e-mail.” sub butonul de trimitere.
- **StatusPill, BookingDetail — 1.0.1:** README: maparea celor 7 stări, trimitere la BookingStatuses.
- **Spine Founder** (în ecranele noi): „Suport” după „Cereri”, „Automatizări” în „Sistem”. **Spine Hub:** „Automatizări” în „Afacerea”. Celelalte preview-uri le primesc la import.
- **Glosar:** avans, așteaptă plata, politica salonului pentru avans, risc ridicat, cod de verificare, câmpuri medicale, consimțământ; secțiunea nouă „Automatizări și suport”.
- **Logo e-mail:** `ventora-logo-email-2x.png` refăcut din `ventora-logo.svg` (V și S peach), id nou în `design-system.json`.

### i18n
- Noi: `booking.json`, `automations.json`, `apps.json` (6 limbi), `founder-automations.json` (RO).
- `founder-support.json`: `founder.inbox.*` (RO). `support.json`: `support.thread.replyNote` (6 limbi).

### Curățenie
- `manifest.json` refăcut după starea de acum (165 de componente; FounderPlans scos, 45 adăugate) și `api/components/FounderPlans.md` scos. Pagina le regenerează oricum la următoarea salvare.

## 2026-11-04 · S116 — deciziile fondatoarei

- **README (registrul de decizii):** rândul nou S116-D, cu deciziile D1–D22, toate ca recomandările din ecrane, și cele trei puncte de confirmat cu avocatul (accesul la nota „Risc ridicat”, avansul nerambursabil, termenul de păstrare a câmpurilor medicale).
- **README-urile componentelor — 1.0.1:** BookingPublic, BookingDeposit, BookingStatuses, BookingClientCard, BookingPayments, BookingHealthFields, BookingClientEmails, FounderSupportInbox, FounderAutomations, HubAutomations: „DE DECIS” devine „Decided (S116, 4 Nov. 2026)”, cu id-ul fiecărei decizii; StatusPill trimite la S116-D8. Ecranele nu se schimbă.

## 2026-11-04 · S118 — Founder · Prezentare și „Restrânge meniul” jos

### Componente noi
- **FounderOverview** (1.0.0) — Founder · „Prezentare”: cifrele, „Au nevoie de tine”, afacerile aproape de limite, afacerile create recent; totul în regulă, prima zi, eroare la încărcare. Doar RO.

### Componente schimbate
- **Spine — 1.2.0:** controlul de restrângere nu mai e cerculețul de pe marginea antetului; e un element jos, sub footer: chevron-left + „Restrânge meniul” (cheia existentă `collapseMenu`). Restrâns, doar chevron-right, cu numele „Extinde meniul” (`expandMenu`). Iconița grid din antet rămâne. Între 768 și 1023px controlul rămâne ascuns. `bundle.js`, `bundle.css` (`.v-spine__bottom`; regulile vechi `.v-spine__collapse` cu poziționare absolută, scoase), preview, README.
- **AppShell — 1.0.1:** README și etichetele din preview.

### i18n
- Nou: `founder-overview.json` (RO).

## 2026-11-04 · S119 — FounderBundles și FounderNewBusiness, aliniere

- **FounderBundles — 2.0.2:** cardul are padding de SheetSection (space-6; space-4 pe telefon); rândul de sus și tabelul de versiuni au aceeași grilă (cele trei blocuri încep la „Versiune”, „Lunar” și „Afaceri”); între titlu și „{n} afaceri îl au”, space-2. Preview, README.
- **FounderNewBusiness — 1.0.2:** „Începe cu 14 zile de probă” centrat pe căsuța „Bundle”. Preview, README.

## 2026-11-04 · S120 — Spine-ul la zi în preview-uri

- **Founder și Growth — preview 1.0.x+1:** „Suport” (badge 3) după „Cereri”; „Automatizări” primul în „Sistem”: FounderApps, FounderBackupCodes, FounderBundles, FounderBusiness, FounderBusinessActions, FounderBusinessBilling, FounderBusinessSms, FounderBusinesses, FounderDiscounts, FounderNewBusiness, FounderOwnerRecovery, FounderPacks, FounderPlanEditor, FounderRequests, FounderSupportSession, FounderUsage, GrowthAudiences, GrowthCampaignEditor, GrowthCampaigns, GrowthControl, GrowthOfferEditor, GrowthOffers, GrowthResults.
- **Hub — preview 1.0.x+1:** „Automatizări” după „Abonament și consum” (RO, DE, IT): HubAccount, HubAccountSecurity, HubAddonPurchase, HubAdminAccess, HubAdminPlan, HubAdminTeam, HubPlanBilling, HubSupport, HubSupportSession, HubSupportThread, HubTeamInvite, HubTeamMemberActions.
- Fără alte schimbări; ecranele S116 și S118 aveau deja intrările.

## 2026-11-04 · S121 — datele de facturare, factura neemisă, cererile cu implementare, texte validate

### Componente noi (1.0.0)
- **FounderBillingProfile** — datele de facturare ale afacerii în „Plăți și facturi” (D-3.6-1): cardul „Factura se emite pe”, schimbarea cerută din Hub, editarea (juridică / fizică, firmă din afara României), erorile CUI și Nr. Reg. Com., salvat. Doar RO.
- **FounderInvoiceNotIssued** — factura care nu s-a emis (D-3.6-4/5): „Nu s-a emis”, „Reîncearcă” (se reîncearcă, nici a doua oară, a reușit), „Am emis-o manual…” cu Dialog și erori, „Emisă manual”. Doar RO.
- **FounderSetupRequests** — cererile cu implementare (3.8, propus): rândul în listă, detaliul pe fiecare stare, oferta, pornirea, anularea cu rambursare. Doar RO.
- **HubBillingProfile** — Abonament și consum · „Date de facturare”, doar citire, „Cere o schimbare”, vederea membrului. 6 limbi.
- **HubSetupRequest** — ce vede proprietarul la fiecare pas al cererii cu implementare, cu data de la care curge abonamentul. 6 limbi.

### Componente schimbate
- **FounderNewBusiness — 1.1.0:** secțiunea „Date de facturare” înaintea lui „Ce cumpără” (același formular ca în FounderBillingProfile); „CUI” mutat din „Afacerea” aici; al doilea board, cu o firmă din Germania; board nou cu erorile. Preview, README.
- **FounderOverview — 1.0.2:** rândul „Factura nu s-a emis · {afacere}” (peach) în „Au nevoie de tine”. Preview, README.
- **FounderBusinessBilling, FounderRequests, HubPlanBilling — 1.0.x+1:** README, cu trimitere la ecranele noi care le completează.

### Texte (`i18n/`)
- `founder-commercial.json` (RO): `founder.billingProfile.*`, `founder.billing.status.notIssued`, `founder.billing.status.manual`, `founder.billing.notIssued.*`, `founder.billing.manualIssue.*`, `founder.setup.*`.
- `founder-overview.json` (RO): `founder.overview.attention.invoiceFailed*`.
- `commercial.json` (6 limbi): `billing.profile.*`, `billing.issuer`, `billing.vatNote` (propunere, de confirmat cu contabilul), `billing.setup.*`.
- Textele scrise de agenți, validate: `support.json`, `team.json`, `notifications.json`, `automations.json` (6 limbi); `founder-support.json`, `founder-automations.json` (RO). Ce s-a schimbat față de textele agenților: „Mesajul nu a plecat” / „Răspunsul nu a plecat” / „Schimbarea nu s-a salvat” în locul lui „Nu am putut…”; „solicitare” în loc de „cerere” la suport; „Fără răspuns de peste o zi lucrătoare” în loc de „Peste termen”; „admin” ca în glosar; „pornite” în loc de „active” la automatizări; motivele din jurnalul automatizărilor reformulate; închiderea automată a solicitării („dacă nu ne răspunzi până atunci”, „răspunde-ne în Hub, la Suport”); DE: „Abonnement”, „hat die Anfrage gestellt”, „erneut geöffnet”; IT: ghilimele «».

## 2026-11-05 · S122 — FounderBillingProfile și FounderInvoiceNotIssued, aliniere

- **FounderBillingProfile, FounderInvoiceNotIssued — 1.0.1:** breadcrumb „Afaceri › Salon Aurora” (fără, pe telefon) și filele în PageHeader, ca în FounderBusiness și FounderDiscounts; contextul de pe telefon arată numele afacerii. Tabelul cumpărărilor: coloanele lui InvoiceHistorySection, lățimi automate. Fără „Vezi factura” și „Rambursează” pe rândurile plătite; acțiuni doar pe „Nu s-a emis”. Preview, README.
- Fără alte schimbări.

## 2026-11-06 · S123 — EasyBook · catalogul de servicii

### Componente noi (1.0.0)
- **BookingServices** — Setări · „Servicii”: lista pe categorii (în ordinea lor) și „Fără categorie”; formularul de serviciu (durată fixă sau variabilă, preț fix / „de la” / interval, lei sau euro, clienți în același timp, „Se poate rezerva online”); erorile (nume duplicat, durată invalidă); categorie nouă, redenumire, ordinea categoriilor; arhivare și restaurare, filtrul „Arhivate”, categoria cu servicii active care nu se poate arhiva; stările goale. 1280, 820 și 390, light și dark.

### Componente schimbate
- **BookingSettings — 1.0.x+1:** README, cu trimitere la BookingServices pentru tabul „Servicii”.

### Texte (`i18n/`)
- `booking.json`: `booking.services.*`, doar în română deocamdată (celelalte limbi vin la traducere).

## 2026-11-08 · S124 — EasyBook · programul echipei și resursele

### Componente noi (1.0.0)
- **BookingTeamSchedule** — Setări · „Programul echipei” (pilot): membrii din calendar și cine nu mai e în echipă; programul săptămânal (cel mult două intervale pe zi, pauza dintre ele, limitele programului afacerii și erorile); excepții pe o dată (zi liberă, alt program, în afara programului afacerii); concedii (cu programări în perioadă, erori); salvat; starea goală.
- **BookingResources** — Setări · „Resurse”: lista, resursă nouă, editare (serviciile care o cer, câte simultan), erori, arhivare, „Arhivate”, restaurare, starea goală.

### Componente schimbate
- **BookingServices — 1.0.1:** rândul de file are „Programul echipei”; iconițele care nu sunt în set (`archive`, `archive-restore`, `folder-plus`) au fost înlocuite: acțiunile de arhivare nu au iconiță, restaurarea folosește `rotate-ccw`, „Categorie nouă” folosește `folder`. Preview, README.
- **BookingSettings — 1.0.x+1:** README, cu trimitere la BookingTeamSchedule și BookingResources.

### Texte (`i18n/`)
- `booking.json`: `booking.team.*`, `booking.resources.*`, doar în română deocamdată.

## 2026-11-10 · S125 — EasyBook · trei goluri pentru pilot (B.11, B.7, B.8)

### Componente noi (1.0.0)
- **BookingClientManage** — pagina clientului pentru mutare / anulare, din linkul din e-mailul de confirmare, fără cont: rezumatul (cu și fără avans), mutarea cu ora ținută 10 minute și expirarea ei, anularea (gratuită, târzie cu avans, târzie cu taxă), stările (prea târziu online, deja anulată, link invalid, încheiată, rezervări online oprite), „Am mutat programarea” și „Am anulat programarea”.
- **BookingClientPayments** — fila „Încasări” din fișa clientului: pe programare data, serviciul, suma, metoda, avans / rest / integral, rambursat sau reținut, cu totalul; starea goală; membrul nu o vede.
- **BookingBlockedClients** — „Blochează clientul…” din fișă (ce înseamnă, motiv intern, eroare), fișa unui client blocat, lista „Blocați” cu „Deblochează”, starea goală, ce vede clientul blocat pe pagina de rezervare.
- **BookingHealthAccessLog** — jurnalul citirilor informațiilor medicale: cine, când, de unde, filtrul pe perioadă, starea goală; doar proprietarul și adminii.

### Componente schimbate
- **BookingClientCard, BookingHealthFields, BookingClientEmails — 1.0.x+1:** README, cu trimitere la ecranele noi.

### Texte (`i18n/`)
- `booking.json`: `booking.manage.*`, `booking.client.pay.*`, `booking.block.*`, `booking.health.log.*`, doar în română deocamdată.

## 2026-11-10 · S126 — EasyBook · programări complexe și locații (B.9, B.10)

### Componente noi (1.0.0)
- **BookingRecurring** — repetarea în programarea nouă (săptămânal, la 2 săptămâni, lunar; până la o dată sau de n ori), conflictele la creare cu ce facem pentru fiecare dată, seria în detaliu, „doar aceasta / aceasta și următoarele / toate” la modificare și anulare.
- **BookingMultiService** — mai multe servicii la rând pentru același client: pași cu membru, pauze, durata totală, conflictul cu prima oră la care merg toate, părțile în calendar, detaliul.
- **BookingWaitlist** — lista de așteptare: adăugare (zile, interval, serviciu), listă cu stări, loc eliberat, „Oferă locul” (valabilitate, SMS / e-mail), oferta expirată, pagina clientului, starea goală.
- **BookingClasses** — sesiuni cu locuri în calendar, participanți și stări, plin cu listă de așteptare, anulare pe participant, sesiune nouă.
- **BookingPackages** — pachetele salonului, pachet nou, vânzarea din fișă, ședințe folosite și rămase, „Din pachet” la programare, expirat, folosit.
- **BookingLocations** — alegerea locației în calendar și în programarea nouă, Setări · Locații, o locație cu programul și cine lucrează aici, „Alegeți salonul” pe pagina publică.

### Componente schimbate
- **BookingNew, BookingDetail, BookingCalendar, BookingPublic, BookingSettings, BookingClientCard — 1.0.x+1:** README, cu trimitere la ecranele noi.

### Texte (`i18n/`)
- `booking.json`: `booking.cx.*`, `booking.recurring.*`, `booking.multi.*`, `booking.waitlist.*`, `booking.classes.*`, `booking.packages.*`, `booking.locations.*`, doar în română deocamdată.

## 2026-11-10 · S127 — EasyBook · formulare, mesaje, încasări și promoții (B.12–B.16, B.21–B.23)

### Componente noi (1.0.0)
- **BookingCustomForms** — întrebările salonului, întrebarea nouă (cu variante), erorile, pe pagina publică (și răspuns obligatoriu lipsă), în detaliul programării.
- **BookingMessageTemplates** — mesajele către clienți și echipă (canal, când pleacă, pornit / oprit), editorul cu variabile și previzualizare e-mail, variabilă greșită, cererea de recenzie pe SMS, SMS peste 160 de caractere, notificarea pentru echipă, salvat.
- **BookingMoney** — plata în detaliul programării, „Încasează” (numerar parțial, link de plată), sold restant, achitat, rambursare pe card și în numerar, soldul în fișa clientului, taxele în Setări, „Nu a venit” cu taxa, cardul refuzat, cardul de garanție pe pagina publică.
- **BookingPromoCodes** — codurile salonului, cod nou, erorile, codul pe pagina publică (gol, aplicat, nevalabil), reducerea în Hub, raportul unui cod.

### Componente schimbate
- **BookingPublic, BookingDetail, BookingNew, BookingPayments, BookingSettings, BookingClientPayments, BookingClientEmails — 1.0.x+1:** README, cu trimitere la ecranele noi.

### Texte (`i18n/`)
- `booking.json`: `booking.set.*`, `booking.forms.*`, `booking.msg.*`, `booking.money.*`, `booking.promo.*`, doar în română deocamdată.

## 2026-11-10 · S128 — EasyBook · rapoarte, integrări, asistent, WhatsApp, casa de marcat

### Componente noi (1.0.0)
- **BookingReports** — ocupare (pe membru, pe zi), venituri, anulări și neprezentări, servicii, echipă; alt interval; exportul și exportul gata; perioadă fără programări.
- **BookingIntegrations** — lista integrărilor cu starea lor, Google Calendar pe membri (sens, ce se vede), legarea de către membru, deconectarea, integrare din alt abonament.
- **BookingAssistant** — rezumatul zilei, ore potrivite pentru lista de așteptare, propunere acceptată / respinsă, mesaj propus, „Întreabă asistentul”, setările.
- **BookingWhatsApp** — conectarea (pași, verificare Meta), conectat cu șabloanele, șablon nou, șablon respins, canalul fiecărui mesaj, starea livrării.
- **BookingFiscal** — EasyBook Punte (descărcare, așteptare), legarea casei de marcat, bonul de test, „Finalizează programarea” cu bon, bon emis, erorile (casa oprită, fără hârtie, puntea negăsită), „Bon de emis”.

### Componente schimbate
- **BookingSettings, BookingMessageTemplates, BookingMoney — 1.0.x+1:** README, cu trimitere la ecranele noi.

### Texte (`i18n/`)
- `booking.json`: `booking.set.tab.integrations`, `booking.reports.*`, `booking.integrations.*`, `booking.ai.*`, `booking.whatsapp.*`, `booking.fiscal.*`, doar în română deocamdată.

## 2026-11-10 · S129 — EasyBook · cine face fiecare serviciu (B.2b, D-B5-6)

### Componente schimbate
- **BookingServices — 1.1.0:** coloana „Cine îl face”, starea „Nu se poate rezerva”, avertismentul pentru un serviciu pe care nu-l face nimeni, câmpul „Cine îl face” din formular (toată echipa sau membrii bifați); ecrane noi: toată echipa, nimeni, programarea nouă filtrată, serviciu fără nimeni în programarea nouă, „Alegeți cu cine” pe pagina publică.
- **BookingTeamSchedule — 1.1.0:** coloana „Servicii”, secțiunea „Servicii” din programul membrului (bife pe categorii, „Toate serviciile”), membrul nou cu toate serviciile, serviciu rămas fără nimeni, membru fără servicii, salvat.
- **BookingNew, BookingPublic — 1.0.x+1:** README, cu trimitere la efectul desenat în BookingServices.

### Texte (`i18n/`)
- `booking.json`: `booking.services.col.members`, `booking.services.members.*`, `booking.services.online.blocked`, `booking.services.noMember.*`, `booking.services.form.members*`, `booking.cx.new.membersHint`, `booking.cx.new.noMember.*`, `booking.team.col.services`, `booking.team.services.*`; `booking.team.drawer.subtitle` include acum „servicii”. Doar în română deocamdată.

## 2026-11-10 · S130 — ClientDesk · primul set de ecrane (CR-UI.1–3)

### Componente noi (1.0.0)
- **ClientDeskHome** — shell-ul ClientDesk și pagina principală: KPI-urile, „Au nevoie de tine”, GrowthSlot; totul la zi; prima zi; ce vede un membru.
- **ClientDeskContacts** — lista contactelor: filtre, coloane, selecție și acțiuni în bloc (etichetă, responsabil, îmbinare, export), fără rezultate, fără contacte, aproape de limită, limita atinsă, ce vede un membru.
- **ClientDeskSegments** — salvează ca segment, lista segmentelor, „N-au mai venit de N zile”, editare, segment salvat, nimeni nu se potrivește.
- **ClientDeskCompanies** — lista, fișa companiei, leagă un contact, companie nouă, fără companii.
- **ClientDeskContact** — fișa contactului: istoricul, @mențiuni, atașament cu avertismentul, câmpurile afacerii, consimțământul (înregistrare, retragere), contactul din EasyBook (doar în citire, programări), ce vede un membru.

### Componente schimbate
- **BookingServices — 1.1.1:** preview; pe pagina publică (ecranul 20) alegerea „Ioana Pavel” apare și în frame-urile Light.

### Texte (`i18n/`)
- `crm.json` (nou): `crm.nav.*`, `crm.home.*`, `crm.contacts.*`, `crm.segments.*`, `crm.companies.*`, `crm.contact.*`, `crm.state.*`, `crm.src.*`, doar în română deocamdată.

## 2026-11-10 · S131 — ClientDesk · leaduri, dealuri, activități (CR-UI.4–6)

### Componente noi (1.0.0)
- **ClientDeskLeads** — căsuța de leaduri, fișa leadului, conversia, duplicatul la conversie, convertit, descalificarea, leadul descalificat, căsuța goală.
- **ClientDeskDeals** — pipeline-ul, Drawer-ul dealului (cu și fără EasyBook), dealul blocat, câștigat, pierdut, al doilea pipeline, limita de 2.
- **ClientDeskActivities** — „Activitățile mele”, activitate nouă, calendarul pe zi și pe săptămână, apel și întâlnire înregistrate, notificarea la termen, sarcină făcută, nimic de făcut.

### Componente schimbate
- **ClientDeskHome, ClientDeskContacts, ClientDeskSegments, ClientDeskCompanies, ClientDeskContact — 1.0.1:** preview; clopoțelul din bara de sus are notificările ClientDesk (înainte folosea exemplele din EasyBook).
- **CrmPipeline — 1.0.1:** README, cu trimitere la ClientDeskDeals.

### Texte (`i18n/`)
- `crm.json`: `crm.leads.*`, `crm.deals.*`, `crm.activities.*`, `crm.notif.*`, doar în română deocamdată.

## 2026-11-10 · S132 — ClientDesk · duplicate, import și export, setări (CR-UI.7–9)

### Componente noi (1.0.0)
- **ClientDeskDuplicates** — perechile cu motivul, îmbinarea cu un contact din EasyBook, îmbinarea între două contacte ClientDesk, îmbinate, „Nu sunt duplicate”, niciun duplicat.
- **ClientDeskImport** — fișierul (ales, necitibil), coloanele, previzualizarea și duplicatele, confirmarea cu temeiul legal, peste limită, progresul, raportul; exportul și exportul gata.
- **ClientDeskSettings** — pipeline-uri și etape (ștergerea unei etape cu dealuri), câmpuri proprii (câmp nou), etichete și surse (unirea etichetelor), motive, scoring (pornit, oprit), legătura cu EasyBook (oprirea ei) și zilele.

### Componente schimbate
- **ClientDeskContacts — 1.0.2:** README, cu trimitere la import, export, duplicate și setări.

### Texte (`i18n/`)
- `crm.json`: `crm.dups.*`, `crm.import.*`, `crm.export.*`, `crm.settings.*`, doar în română deocamdată.

## 2026-11-10 · S133 — ClientDesk · automatizări, șabloane, e-mail, consimțământ, secvențe (CR.13–15)

### Componente noi (1.0.0)
- **ClientDeskAutomations** — automatizările predefinite, setările (rotația, e-mailul de confirmare), istoricul rulărilor, pornită, niciuna pornită.
- **ClientDeskTemplates** — lista, editorul cu părțile fixe și previzualizarea, variabilă necunoscută și contact fără prenume, șablon comercial, test trimis, versiuni.
- **ClientDeskEmail** — compunerea, șablon comercial fără consimțământ, aproape de limită, limita atinsă, e-mailurile în istoric, căsuța neconectată, trimis, e-mailul primit.
- **ClientDeskConsent** — consimțământul pe canal, înregistrarea (și fără dovadă), retragerea, pagina publică de dezabonare și confirmarea, lista de suprimare.
- **ClientDeskSequences** — lista, pașii cu statistici, înscrierea în masă, contactele din secvență, contact deja în altă secvență, pauză, fără pași.

### Componente schimbate
- **ClientDeskContact, ClientDeskSettings — 1.0.x+1:** README, cu trimitere la ecranele noi.

### Texte (`i18n/`)
- `crm.json`: `crm.auto.*`, `crm.tpl.*`, `crm.mail.*`, `crm.consent.*`, `crm.seq.*`, doar în română deocamdată.

## 2026-11-10 · S134 — ClientDesk · rapoarte și formulare publice (CR.16–17)

### Componente noi (1.0.0)
- **ClientDeskReports** — Vânzări, Leaduri, Activitate echipă, Contacte, E-mail; filtrele, exportul, ce vede un membru, perioadă fără activitate, fără date.
- **ClientDeskForms** — lista, editorul (câmpuri, după trimitere, consimțământ, publicare), pagina publică (formular, erori, trimis, oprit), spam, limita, niciun formular.

### Componente schimbate
- **ClientDeskEmail — 1.1.0:** domeniul afacerii, opțional (înregistrările SPF/DKIM/DMARC, neverificat, verificat, eșuat); README.
- **ClientDeskContact — 1.0.x+1:** decizia finală despre consimțământul din EasyBook (doar bifa separată, nebifată implicit); textul din fișă; README.

### Texte (`i18n/`)
- `crm.json`: `crm.reports.*`, `crm.forms.*`, `crm.mail.d.*`; `crm.contact.consent.ebMeta` schimbat. Doar în română deocamdată.

## 2026-11-10 · S135 — Hub · chei API și webhook-uri (C.3)

### Componente noi (1.0.0)
- **HubApiKeys** — cheile, cheie nouă (și erorile), cheia arătată o dată, revocare, rotire și perioada de grație, limita de chei, jurnalul cererilor, nicio cheie, abonament fără API, membru fără drept.
- **HubWebhooks** — webhook-urile, webhook nou (și URL fără https), secretul arătat o dată, testul, livrările și corpul unei livrări, dezactivarea automată, documentația, niciun webhook.

### Hub
- Spine-ul Hub are un grup nou, „Administrare”, cu „Integrări pentru dezvoltatori” (doar proprietar și admini).

### Texte (`i18n/`)
- `api.json` (nou): `api.keys.*`, `api.hooks.*`, doar în română deocamdată.

## 2026-11-10 · S136 — Faza 5 · texte Growth, Traduceri, clopoțelul Founder, Analytics, launcher-ul fără Portal, „Recomandările mele”

### Componente noi (1.0.0)
- **FounderTranslations** — textele pe limbi cu starea lor, filtrele, editarea cu originalul alături, „Propune cu AI” (propunere, aprobată de un om), pornirea ofertei doar în limbile cu texte aprobate, aprobat, toate aprobate.
- **FounderNotifications** — clopoțelul Founder, notificările necitite și toate, oprirea automată (ce s-a oprit și de ce), „Repornește” cu confirmare, repornită, nicio notificare.
- **FounderAnalytics** — produsul (afaceri active, aplicații, retenție pe cohortă, adopția funcționalităților), activarea (funnel-ul), sloturile Growth, grupuri sub 5 afaceri, fără date.
- **HubMyRecommendations** — recomandările membrului (în așteptare, activată, nu acum), din clopoțel, nicio recomandare.

### Componente schimbate
- **HubLauncher — 1.1.0:** starea „fără Portal” (PortalPresence lipsește, fără gol); fraza zilei fără chip-uri de date, doar „programări azi” cu EasyBook activ, altfel o propoziție simplă; două planșe noi; README.
- **GrowthOffers, GrowthOfferEditor, GrowthCampaigns, GrowthCampaignEditor, GrowthAudiences, GrowthControl, GrowthResults — 1.0.x+1:** README (cheile în `founder-growth.json`).
- **RecommendationCard, RecommendationLabel, CatalogRecommendation, GrowthSlot, CommercialStates, CommercialPreferences — 1.0.x+1:** README (cheile în `commercial.json`).

### Founder
- Spine-ul Founder are „Analytics” în primul grup și „Traduceri” sub Growth.

### Texte (`i18n/`)
- `founder-growth.json` (nou): `founder.growth.{common, offers, offerEditor, campaigns, campaignEditor, audiences, control, results}.*` și `founder.growth.translations.*`, doar în română.
- `founder.json` (nou): `founder.nav.*`, `founder.notifications.*`, `founder.analytics.*`, doar în română.
- `commercial.json`: textele componentelor comerciale, `states.*`, `prefs.*`, `mine.*`, în cele 6 limbi (cheile `billing.*` neschimbate).

## 2026-11-10 · S137 — EasyBook · durată și preț pe membru; CampaignKit · setul 1

### Componente noi (1.0.0)
- **CampaignKitDashboard** — shell-ul CampaignKit și pagina principală: cotele lunii, ultimele rezultate, ce trebuie făcut, slotul Growth; aproape de limită, membru, gol.
- **CampaignKitCampaigns** — campaniile (7 stări), filtrele, duplicare, pauză, oprire, aprobarea internă (aprobă / respinge cu motiv), membru, nimic găsit.
- **CampaignKitNewCampaign** — campania nouă în 5 pași; audiența cu excluși și de ce; conținutul e-mail și SMS (GSM-7, Unicode, cost din pachet); programarea (SMS 9:00–20:00); verificarea pentru membru și proprietar; trimiterile reale oprite.
- **CampaignKitEmailEditor** — editorul pe blocuri, ordonarea, stilurile din brand, variabilele cu text de rezervă, antetul și subsolul legal fixe, previzualizarea, testul, verificările, șabloanele.

### Componente schimbate
- **BookingServices — 1.1.0:** durată și preț pe membru în „Cine îl face”; „Diferă pe membru” în listă; prețul sub avans; efectul în programarea nouă și pe pagina publică (6 planșe noi); README.
- **BookingNew, BookingPublic — 1.0.x+1:** README.

### Texte (`i18n/`)
- `booking.json`: `booking.services.member.*` (doar română), `booking.public.anyoneRange` (6 limbi).
- `marketing.json` (nou): `marketing.*`, doar în română deocamdată.

## 2026-11-10 · S138 — CampaignKit · setul 2; corectură EasyBook

### Componente noi (1.0.0)
- **CampaignKitAudiences** — segmente și liste, editorul de segment (RuleBuilder, estimarea, unde e folosit), segment predefinit, segment gol, listă statică, listă nouă, segment folosit.
- **CampaignKitContacts** — registrul, contact legat (doar citire) și contact doar de marketing, importul cu temeiul legal, exportul, lista de suprimare comună, gol.
- **CampaignKitForms** — formularele, după trimitere (cu și fără ClientDesk), acordul și dublu opt-in, formularul public, eroare, confirmarea din e-mail, e-mailul de confirmare, abonat, gol.
- **CampaignKitAutomations** — cele 5 automatizări, setările (reactivare, ziua de naștere), istoricul rulărilor, pornită.
- **CampaignKitSocial** — luna, săptămâna, compunerea cu previzualizare Facebook / Instagram, postare eșuată, conturile, deconectare, neconectat, Meta încă neaprobat.

### Componente schimbate
- **BookingServices — 1.2.0:** durata și prețul pe membru ca la serviciu (variabilă; „De la”, „Interval”); 6 planșe noi; README.
- **CampaignKitNewCampaign — 1.1.0:** SMS prin SMSLink, de pe numărul scurt Ventora Systems (D-CK-5); textele și costul; README.
- **CampaignKitDashboard, CampaignKitEmailEditor, BookingNew, BookingPublic — 1.0.x+1:** README.

### Texte (`i18n/`)
- `booking.json`: `booking.services.member.edit`, `boxTitle`, `reset`, `finalNote`, `holdMax` (română), `booking.public.priceFrom`, `booking.public.priceFinal` (6 limbi); `member.own`, `member.same`, `member.pickHint`, `member.lead` schimbate.
- `marketing.json`: `marketing.aud.*`, `ct.*`, `fm.*`, `au.*`, `so.*`; `new.sms.*`, `new.ch.smsHelp`, `dash.q.smsHint` schimbate (D-CK-5). Doar în română.

## 2026-11-10 · S139 — CampaignKit · setul 3; RuleBuilder; EasyBook B.7

### Biblioteca (bundle.js)
- **RuleBuilder — 1.1.0:** prop `subject` (`business` implicit, `contact`); textul nou `matchLabelContact` („Contactul trebuie să îndeplinească”), în 6 limbi; `index.d.ts` actualizat.

### Componente noi (1.0.0)
- **CampaignKitReports** — campaniile, o campanie (cu A/B, linkuri, dispozitive), SMS, automatizări, postări (și fără Meta), exportul, membrul.
- **CampaignKitSettings** — trimiteri (comutatorul, plafonul și eroarea, orele, zilele, aprobarea), expeditorul și domeniul, pachetele și cumpărarea, rolurile, membrul.
- **CampaignKitUnsubscribe** — preferințele, dezabonarea dintr-un clic, „Mai rar”, dezabonat de la toate, „M-am răzgândit”, link expirat, STOP la SMS.
- **BookingClientMerge** — posibila dublură, alegerea, ce se păstrează, confirmarea, îmbinate, fișa arhivată.
- **BookingBehaviorNote** — oprită implicit, pornirea cu confirmare, pornită cu regula.

### Componente schimbate
- **CampaignKitNewCampaign — 1.2.0:** testul A/B pe subiect sau conținut; README.
- **CampaignKitAutomations — 1.1.0:** „Aniversarea primei vizite”, ziua de naștere și datele speciale; README.
- **CampaignKitAudiences, ClientDeskSegments — 1.0.x+1:** `subject="contact"` pe RuleBuilder; README.
- **BookingClientCard, BookingSettings — 1.0.x+1:** README.

### Texte (`i18n/`)
- `marketing.json`: `marketing.rp.*`, `new.ab.*`, `set.*`, `un.*`, `au.sp.*`, `au.a.anniv.*`. Doar în română.
- `booking.json`: `booking.merge.*`, `booking.behavior.*`. Doar în română.

## 2026-11-10 · S140 — Prima pornire: EasyBook + ClientDesk pentru un salon nou

### Componente noi (1.0.0)
- **BookingOnboarding** — ghidul de configurare pe „Azi”: cei 7 pași, fiecare pas, pasul sărit, „Felicitări”, după ghid.
- **BookingClientImport** — importul la început: din telefon, Excel, altă aplicație; coloanele, previzualizarea, confirmarea, rezultatul.
- **BookingDemo** — „Vezi cu date de exemplu”, Salon Demo cu bandă, ștergerea.
- **ClientDeskWelcome** — prima intrare: ce e diferit, cei 3 pași, pipeline din șablon, legătura cu EasyBook, deal-uri de exemplu.
- **AppHelp** — butonul „?”, panoul, un articol, turul în 3 pași.
- **PilotFeedback** — banda perioadei de test, formularul de părere.

### Componente schimbate
- **ClientDeskImport, HubLauncher — 1.0.x+1:** README.

### Texte (`i18n/`)
- `onboarding.json` (nou): `onboarding.guide.*`, `imp.*`, `demo.*`, `cd.*`, `help.*`, `pilot.*`, doar în română.

## 2026-11-10 · S141 — Traducerile ClientDesk

### Texte (`i18n/`)
- `crm.json`: cheile `crm.*` (1.684) traduse în en, fr, es, de, it, lângă ro; aceleași chei, aceiași parametri `{…}`. Termenii aleși și verificarea în DE / IT: registrul S141 din README.
- Scurtat după verificarea pe telefon: IT `crm.contact.history` „Storico” (și „storico” în textele care îl pomenesc); DE / IT `crm.import.e.*`.

### Componente
- Niciuna schimbată: ecranele ClientDesk citesc deja `crm.*`; previzualizările rămân în română.

## 2026-11-10 · S142 — Traducerile CampaignKit

### Texte (`i18n/`)
- `marketing.json`: cheile `marketing.*` (1.179) traduse în en, fr, es, de, it, lângă ro; aceleași chei, aceiași parametri `{…}`. Termenii aleși, regulile GSM-7 pentru SMS și verificarea în DE / IT: registrul S142 din README.
- Scurtat după verificare: DE / IT `marketing.new.em.edit`, DE `marketing.new.em.test`.

### Componente
- Niciuna schimbată: ecranele CampaignKit citesc deja `marketing.*`; previzualizările rămân în română.

## 2026-11-10 · S143 — Traduceri onboarding, API, Founder, booking

- `onboarding.json` (356), `api.json` (199), `founder.json` (138), `founder-growth.json` (217): traduse în en, fr, es, de, it, lângă ro; aceleași chei, aceiași parametri `{…}`.
- `booking.json`: cele 1.319 chei rămase doar în română (`booking.services.member.*`, `booking.merge.*`, `booking.behavior.*` și celelalte) traduse în cele 5 limbi; 1.587 de chei în fiecare limbă.
- `crm.json`, `marketing.json`: IT „Rischio elevato” → „Rischio alto”, ca în `booking.json`.
- HubApiKeys: DE „API” în bara de jos pe telefon (în loc de „Integrationen”, care nu încăpea). BookingOnboarding: nicio schimbare.
- Termenii aleși și verificarea în DE / IT: registrul S143 din README.

## 2026-11-10 · S144 — Conținutul ajutorului din aplicație

- `help.json` (nou, doar română, 260 de chei): 56 de articole pentru 16 ecrane EasyBook și ClientDesk (`help.<ecran>.<articol>.title` / `.steps` / `.note` / `.min`), 10 întrebări frecvente (`help.faq.*`), etichetele panoului (`help.ui.*`).
- **AppHelp**: articolele vin din `help.json`; vederea unui articol are întrebarea în corp, pașii numerotați, Notice „Bine de știut” și timpul de citire; secțiunea „Întrebări frecvente” în panou; frame-uri noi pentru „Cum mut o programare?” și „Cum cer avans la rezervarea online?”. Cheile vechi `onboarding.help.a1–a4` nu mai sunt folosite de preview.
- Detaliile și DE DECIS: registrul S144 din README și README-ul AppHelp.

## 2026-11-10 · S145 — Traducerile ajutorului din aplicație

- `help.json`: cele 260 de chei traduse în en, fr, es, de, it, lângă ro; aceiași pași, aceleași note, `{n}` identic; butoanele și ecranele cu textele exacte din interfață.
- **AppHelp**: verificat în DE și IT (panoul, două articole), fără depășiri; preview-ul publicat rămâne în română.
- Termenii aleși și nepotrivirile găsite între articole și interfață: registrul S145 din README.

## 2026-11-12 · S146 — Completări: Cere acces, Rezervări online, țara afacerii, pozele la întrebări, linkul clientului, CampaignKit §5.2

### Componente noi (1.0.0)
- **BookingOnlineSettings** — Setări › Rezervări online: pagina, serviciile online, avansul și garanția, mutarea și anularea, întrebările, clienții blocați și „Risc ridicat”, mesajul după rezervare; neconfigurat, pornit, oprit, doar citire.
- **CampaignKitCalendar** — calendarul campaniilor (lună, săptămână; agendă pe telefon), vedere în Campanii.
- **CampaignKitSeries** — campanii recurente și în mai mulți pași, seria pornită, oprirea.
- **CampaignKitSending** — progresul trimiterii și mesajele eșuate cu motivul.
- **CampaignKitMedia** — biblioteca media pentru postări și „Alege din bibliotecă”.

### Componente schimbate
- **HubEmpty** (1.1.0) — „Cere acces”: trimisă cu data, retrimiterea după 7 zile, se trimite, erori (rețea, afacere suspendată); ce vede proprietarul („Au nevoie de tine”, notificarea). Textele noi sunt chei (`team.json`, `notifications.json`).
- **FounderNewBusiness** (1.1.0) — câmpul „Țara” (Combobox cu căutare, implicit România, ISO alpha-2).
- **FounderBusiness** (1.1.0) — cardul „Afacerea”: țara lângă fusul orar.
- **BookingCustomForms** (1.1.0) — Notice-ul permanent despre sănătate; „Clientul poate adăuga o poză”; încărcarea pozei pe pagina publică și erorile.
- **BookingClientManage** (1.1.0) — programarea a început; linkul expirat la 30 de zile; linkul revocat.
- **CampaignKitForms** (1.1.0) — fila „Publicare”: linkul, QR-ul, codul de încorporare, domeniul.
- **CampaignKitNewCampaign** (1.1.0) — „Eșantion prea mic” sub 500 de contacte la testul A/B.
- **BookingPublic, BookingSettings, CampaignKitCampaigns, CampaignKitSocial, CampaignKitSettings** (1.0.1) — doar README: unde sunt desenate completările.

### Decizia MK.1 (11 nov.)
- Setările campaniilor nu au câmp de semnătură. Am verificat CampaignKitSettings și CampaignKitNewCampaign: nu exista niciun câmp de semnătură, deci nu s-a scos nimic; subsolul legal al e-mailului rămâne fix.

### `manifest.json`
- Adăugate cele 5 componente noi (nume, grup, rezumat) și README-urile lor. Fișierul nu are câmp de versiune și e regenerat de pagina design system-ului la salvare; versiunile de mai sus sunt cele valabile.

### Chei i18n noi (toate în cele 6 limbi; nicio cheie existentă schimbată)
#### `i18n/team.json` — 22 chei noi

- `hub.empty.*` (13): `hub.empty.title`, `hub.empty.desc`, `hub.empty.ask`, `hub.empty.write`, `hub.empty.sending`, `hub.empty.sent`, `hub.empty.sentDesc`, `hub.empty.resendOn`, `hub.empty.resendReady`, `hub.empty.resend`, `hub.empty.lastSent`, `hub.empty.meanwhile`, `hub.empty.retry`
- `hub.empty.error.*` (3): `hub.empty.error.title`, `hub.empty.error.body`, `hub.empty.error.suspended`
- `hub.attention.*` (1): `hub.attention.title`
- `team.accessRequest.*` (5): `team.accessRequest.title`, `team.accessRequest.meta`, `team.accessRequest.open`, `team.accessRequest.again`, `team.accessRequest.badge`

#### `i18n/notifications.json` — 3 chei noi

- `notifications.access.request.*` (3): `notifications.access.request.title`, `notifications.access.request.body`, `notifications.access.request.action`

#### `i18n/booking.json` — 99 chei noi

- `booking.online.*` (2): `booking.online.lead`, `booking.online.saved`
- `booking.online.st.*` (3): `booking.online.st.on`, `booking.online.st.off`, `booking.online.st.setup`
- `booking.online.setup.*` (5): `booking.online.setup.title`, `booking.online.setup.body`, `booking.online.setup.action`, `booking.online.setup.done`, `booking.online.setup.todo`
- `booking.online.page.*` (12): `booking.online.page.title`, `booking.online.page.toggle`, `booking.online.page.onHelp`, `booking.online.page.offHelp`, `booking.online.page.setupHelp`, `booking.online.page.offNotice`, `booking.online.page.link`, `booking.online.page.copy`, `booking.online.page.copied`, `booking.online.page.preview`, `booking.online.page.qr`, `booking.online.page.qrHelp`
- `booking.online.svc.*` (12): `booking.online.svc.title`, `booking.online.svc.lead`, `booking.online.svc.count`, `booking.online.svc.col.service`, `booking.online.svc.col.who`, `booking.online.svc.col.online`, `booking.online.svc.hidden`, `booking.online.svc.hiddenWhy`, `booking.online.svc.fix`, `booking.online.svc.off`, `booking.online.svc.nobody`, `booking.online.svc.all`
- `booking.online.dep.*` (13): `booking.online.dep.title`, `booking.online.dep.lead`, `booking.online.dep.services`, `booking.online.dep.servicesV`, `booking.online.dep.amount`, `booking.online.dep.amountV`, `booking.online.dep.card`, `booking.online.dep.cardV`, `booking.online.dep.fee`, `booking.online.dep.feeV`, `booking.online.dep.feeNever`, `booking.online.dep.edit`, `booking.online.dep.noStripe`
- `booking.online.chg.*` (9): `booking.online.chg.title`, `booking.online.chg.lead`, `booking.online.chg.until`, `booking.online.chg.untilHelp`, `booking.online.chg.hours`, `booking.online.chg.moves`, `booking.online.chg.movesV`, `booking.online.chg.free`, `booking.online.chg.freeV`
- `booking.online.q.*` (3): `booking.online.q.title`, `booking.online.q.lead`, `booking.online.q.open`
- `booking.online.blk.*` (8): `booking.online.blk.title`, `booking.online.blk.blocked`, `booking.online.blk.blockedHelp`, `booking.online.blk.count`, `booking.online.blk.list`, `booking.online.blk.risk`, `booking.online.blk.riskHelp`, `booking.online.blk.riskOff`
- `booking.online.msg.*` (6): `booking.online.msg.title`, `booking.online.msg.lead`, `booking.online.msg.label`, `booking.online.msg.help`, `booking.online.msg.sample`, `booking.online.msg.count`
- `booking.online.ro.*` (2): `booking.online.ro.title`, `booking.online.ro.body`
- `booking.forms.health.*` (3): `booking.forms.health.notice`, `booking.forms.health.link`, `booking.forms.health.off`
- `booking.forms.photo.*` (4): `booking.forms.photo.label`, `booking.forms.photo.help`, `booking.forms.photo.badge`, `booking.forms.photo.detail`
- `booking.public.photo.*` (11): `booking.public.photo.add`, `booking.public.photo.hint`, `booking.public.photo.uploading`, `booking.public.photo.done`, `booking.public.photo.remove`, `booking.public.photo.change`, `booking.public.photo.errType`, `booking.public.photo.errSize`, `booking.public.photo.errCount`, `booking.public.photo.retry`, `booking.public.photo.privacy`
- `booking.manage.started.*` (2): `booking.manage.started.title`, `booking.manage.started.body`
- `booking.manage.expired.*` (1): `booking.manage.expired.body`
- `booking.manage.revoked.*` (1): `booking.manage.revoked.body`
- `booking.manage.*` (2): `booking.manage.bookAgain`, `booking.manage.salonPhone`

#### `i18n/founder.json` — 8 chei noi

- `founder.country.*` (5): `founder.country.label`, `founder.country.help`, `founder.country.search`, `founder.country.empty`, `founder.country.code`
- `founder.business.*` (3): `founder.business.country`, `founder.business.timezone`, `founder.business.countryNoHub`

#### `i18n/marketing.json` — 135 chei noi

- `marketing.camp.*` (1): `marketing.camp.view`
- `marketing.camp.view.*` (2): `marketing.camp.view.list`, `marketing.camp.view.cal`
- `marketing.cal.*` (12): `marketing.cal.lead`, `marketing.cal.month`, `marketing.cal.week`, `marketing.cal.prev`, `marketing.cal.next`, `marketing.cal.today`, `marketing.cal.more`, `marketing.cal.offDay`, `marketing.cal.series`, `marketing.cal.capWarn`, `marketing.cal.empty`, `marketing.cal.emptyBody`
- `marketing.cal.legend.*` (2): `marketing.cal.legend.email`, `marketing.cal.legend.sms`
- `marketing.ser.*` (22): `marketing.ser.type`, `marketing.ser.every`, `marketing.ser.weekly`, `marketing.ser.monthly`, `marketing.ser.day`, `marketing.ser.dayMonthly`, `marketing.ser.time`, `marketing.ser.ends`, `marketing.ser.audienceNote`, `marketing.ser.nextSends`, `marketing.ser.steps`, `marketing.ser.stepsLead`, `marketing.ser.step`, `marketing.ser.wait`, `marketing.ser.onlyIf`, `marketing.ser.addStep`, `marketing.ser.addWait`, `marketing.ser.maxSteps`, `marketing.ser.stopTitle`, `marketing.ser.inProgress`, `marketing.ser.pause`, `marketing.ser.stopSeries`
- `marketing.ser.type.*` (6): `marketing.ser.type.once`, `marketing.ser.type.onceHelp`, `marketing.ser.type.recurring`, `marketing.ser.type.recurringHelp`, `marketing.ser.type.steps`, `marketing.ser.type.stepsHelp`
- `marketing.ser.ends.*` (3): `marketing.ser.ends.date`, `marketing.ser.ends.count`, `marketing.ser.ends.never`
- `marketing.ser.rule.*` (1): `marketing.ser.rule.weekly`
- `marketing.ser.stop.*` (7): `marketing.ser.stop.booked`, `marketing.ser.stop.clicked`, `marketing.ser.stop.unsub`, `marketing.ser.stop.title`, `marketing.ser.stop.body`, `marketing.ser.stop.submit`, `marketing.ser.stop.note`
- `marketing.ser.badge.*` (2): `marketing.ser.badge.recurring`, `marketing.ser.badge.steps`
- `marketing.snd.*` (12): `marketing.snd.title`, `marketing.snd.progress`, `marketing.snd.started`, `marketing.snd.window`, `marketing.snd.skippedHelp`, `marketing.snd.done`, `marketing.snd.hard`, `marketing.snd.soft`, `marketing.snd.export`, `marketing.snd.openContact`, `marketing.snd.noFailed`, `marketing.snd.see`
- `marketing.snd.k.*` (4): `marketing.snd.k.delivered`, `marketing.snd.k.pending`, `marketing.snd.k.failed`, `marketing.snd.k.skipped`
- `marketing.snd.failed.*` (2): `marketing.snd.failed.title`, `marketing.snd.failed.lead`
- `marketing.snd.col.*` (4): `marketing.snd.col.contact`, `marketing.snd.col.address`, `marketing.snd.col.reason`, `marketing.snd.col.when`
- `marketing.snd.f.*` (2): `marketing.snd.f.reason`, `marketing.snd.f.all`
- `marketing.snd.r.*` (5): `marketing.snd.r.noMailbox`, `marketing.snd.r.full`, `marketing.snd.r.spam`, `marketing.snd.r.noNumber`, `marketing.snd.r.off48`
- `marketing.med.*` (15): `marketing.med.title`, `marketing.med.lead`, `marketing.med.tab`, `marketing.med.upload`, `marketing.med.uploadHint`, `marketing.med.search`, `marketing.med.usedIn`, `marketing.med.notUsed`, `marketing.med.storage`, `marketing.med.errType`, `marketing.med.errSize`, `marketing.med.none`, `marketing.med.pick`, `marketing.med.pickTitle`, `marketing.med.pickN`
- `marketing.med.f.*` (3): `marketing.med.f.all`, `marketing.med.f.used`, `marketing.med.f.unused`
- `marketing.med.d.*` (10): `marketing.med.d.name`, `marketing.med.d.alt`, `marketing.med.d.altHelp`, `marketing.med.d.info`, `marketing.med.d.where`, `marketing.med.d.post`, `marketing.med.d.campaign`, `marketing.med.d.delete`, `marketing.med.d.deleteBlocked`, `marketing.med.d.save`
- `marketing.med.empty.*` (2): `marketing.med.empty.title`, `marketing.med.empty.body`
- `marketing.fm.pb.*` (14): `marketing.fm.pb.state`, `marketing.fm.pb.link`, `marketing.fm.pb.linkHelp`, `marketing.fm.pb.copyLink`, `marketing.fm.pb.qr`, `marketing.fm.pb.embed`, `marketing.fm.pb.embedLead`, `marketing.fm.pb.code`, `marketing.fm.pb.copyCode`, `marketing.fm.pb.copied`, `marketing.fm.pb.preview`, `marketing.fm.pb.domain`, `marketing.fm.pb.domainHelp`, `marketing.fm.pb.draft`
- `marketing.new.ab.*` (4): `marketing.new.ab.small.title`, `marketing.new.ab.small.body`, `marketing.new.ab.small.toggle`, `marketing.new.ab.small.change`

Detaliile și DE DECIS: registrul S146 din README și README-urile componentelor.
