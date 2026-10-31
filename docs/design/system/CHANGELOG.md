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

> Sincronizat în repo: S112 la Lotul 2.9b; S111, S113 și S117 la Lotul 3.4 (tokens.json și tokens.css rămân din repo; logo-urile se iau din design system, nota S114b). În `_incoming` rămân, nesincronizate: HubAccount, HubTeamMemberActions, BillingNotifications, README-urile NotificationsPanel / BookingSmsNotifications și i18n `notifications.json`, `team.json`, `founder-business.json` (S114, S114b, S115). În cod, FounderPlans se numește FounderBundles (decizia fondatoarei).
