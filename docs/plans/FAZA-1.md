# FAZA 1 — Design System în Cod

**Branch:** `f1-design-system`
**Data:** 24.10.2026
**Status:** ÎN DESFĂȘURARE — Lotul 1 finalizat și commitat
**Referință plan original:** artefact `YGkmsLytT9Z8f4bfakSpGp` (arhivat, sursa de adevăr e acest fișier)
**Comparație primitive:** artefact `YWL5Qve7NWiuqU3GkRffod` (arhivat)

---

## Decizii confirmate de fondatoare

| Decizie | Valoare | ADR / referință |
|---|---|---|
| **D-UI-2** Primitiva headless | React Aria Components 1.x (GA) | `docs/adr/0002-react-aria-components-primitive-headless.md` |
| **Modul stilizare** | CSS Modules + variabile CSS custom (fără Tailwind) | DESIGN_RULES §6, ARCHITECTURE §10 |
| **Lucide React** | `1.61.0` (ultima stabilă, non-breaking față de 0.460.0) | Comparație primitive — 19 iconuri eliminate sunt brand/social, niciunul în UI Ventora |
| **Fonturile** | Găzduite de noi în `packages/tokens/fonts/` — nu din Google Fonts | DESIGN_RULES §8 |
| **Ruta `/design`** | Disponibilă doar în development; returnează 404 în build-ul de producție | ARCHITECTURE §10.5 |

---

## Scopul Fazei 1

Pachetul `packages/ui` cu toate cele 74 de componente ale design system-ului Ventora Business (Hub + Founder Control Center + 13 aplicații B2B). Portal și Network au identitate vizuală proprie; ecranele (HubLauncher, BookingToday etc.) nu intră în F1.

**Criteriu de acceptare per lot:** grila de previzualizare funcțională la `/design` înainte ca lotul următor să înceapă.

---

## Loturile

### Lot 1 — Fundație invizibilă ✅ FINALIZAT (commit `fc4b1d5`)

Nu produce componente vizibile; pune fundația pe care toate celelalte se construiesc.

| # | Livrabil | Status |
|---|---|---|
| 1 | `packages/tokens` — script generate.mjs, `business/tokens.css` (light+dark), `business/types.ts`; placeholder-uri `portal/` și `network/` | ✅ |
| 2 | Font loading — `@font-face` DM Sans Variable + Italic + Syne Variable, copiate în `packages/tokens/fonts/` | ✅ |
| 3 | Logo-uri SVG — ventora-logo.svg/dark, ventora-mark.svg/dark, favicon.svg în `packages/tokens/logos/` | ✅ |
| 4 | Pagina `/design` în `apps/platform/app/design/` — dev-only (404 în producție), preview tokens | ✅ |
| 5 | ADR 0002 — React Aria Components confirmat ca bibliotecă primitive headless | ✅ |

**Rămâne de implementat din Lot 1 original** (conform planului — vor intra în Lot 2 sau separat):
- `VentoraProvider` (context React: limbă, temă, toast queue)
- `useTheme`, `useToast`, `useHotkey`
- `Icon` (wrapper lucide-react: aria-hidden implicit, strokeWidth 1.75, dimensiuni din tokens)

---

### Lot 2 — Primitive de acțiuni și formulare

Controale standalone. Ordinea respectă dependințele interne (FormField învelește Input etc.).

| # | Componentă | Primitivă | Note |
|---|---|---|---|
| 7 | **Button** | `react-aria-components` Button + asChild pattern | Variante: primary · secondary · quiet · danger; size sm/md/lg; loading; href |
| 8 | **IconButton** | idem | Tooltip obligatoriu când e folosit fără text vizibil |
| 9 | **Input** | input nativ (stilizat) | type text/email/password/tel/number; icon; prefix/suffix; clearable; invalid; readOnly |
| 10 | **Textarea** | textarea nativ | Auto-resize sau fix; invalid |
| 11 | **Select** | `react-aria-components` Select | **Niciodată** `<select>` nativ; placeholder implicit „Alege" localizat |
| 12 | **Checkbox** | `react-aria-components` Checkbox | Zonă de atingere 44px; indeterminate |
| 13 | **Radio / RadioGroup** | `react-aria-components` RadioGroup | Zonă de atingere 44px |
| 14 | **Toggle** | `react-aria-components` Switch | Localizat: „pornit/oprit" din i18n |
| 15 | **FormField** | — | Înveliș label + helper + error; conectează Input/Select/Checkbox la mesajul de eroare via `aria-describedby` |
| 16 | **SegmentedControl** | `react-aria-components` TabList (role=group) | |
| 17 | **FileUpload** | input[type=file] + zonă drag&drop | |
| 18 | **Combobox** | `react-aria-components` ComboBox | Pentru liste >10 elemente sau căutare liberă |

---

### Lot 3 — Navigație, overlay și shell

| # | Componentă | Note |
|---|---|---|
| 19 | **Tabs** | `react-aria-components` Tabs; scroll orizontal pe mobil |
| 20 | **Pagination** | Localizat; formatare număr prin Intl |
| 21 | **Menu** | `react-aria-components` MenuTrigger + Menu; min/max-width din tokens |
| 22 | **Tooltip** | `react-aria-components` Tooltip; shadow-2; z-popover |
| 23 | **Dialog** | `react-aria-components` Dialog; bottom sheet <640px; focus trap + Esc; tone default/danger/attention |
| 24 | **Drawer** | Idem, animat lateral; full-screen <640px; width din tokens |
| 25 | **CommandPalette** | Dialog + Combobox; shortcut Cmd/Ctrl+K; z-overlay |
| 26 | **Sheet / SheetSection** | Suprafața de lucru principală; separat de canvas printr-o linie, nu umbră |
| 27 | **PageHeader** | Titlul paginii + acțiunile principale; sticky top |
| 28 | **ContextBar** | Bara de sus a aplicației; înălțime din token `contextbar-height` (56px) |
| 29 | **Spine** | Navigația laterală; bottom nav <640px; expanded/collapsed din tokens; container queries |
| 30 | **AppShell** | Frame: Spine + ContextBar + content; responsive prin container queries proprii |

---

### Lot 4 — Stare, feedback și utilitar

| # | Componentă | Note |
|---|---|---|
| 31 | **Toast** + `useToast` | z-toast; slide-in; auto-dismiss; localizat |
| 32 | **StatusPill** | Stările din glosar (confirmat/anulat/ciornă etc.); nu inventezi stări noi |
| 33 | **StatusDot** | Dimensiunea dot-size (6px); culori attention-mark / done-mark / danger |
| 34 | **Badge** | Counter necitite; attention fill |
| 35 | **Avatar / AvatarGroup** | Inițiale pe avatar-bg; fallback la icon User; stivă cu +N |
| 36 | **Notice** | Banner inline: info/warn/danger/done; niciodată decorativ |
| 37 | **AttentionList** | Lista de atenționări din ContextBar |
| 38 | **EmptyState** | Titlu + propoziție + CTA; niciodată fără pasul următor |
| 39 | **Skeleton** | Shimmer pe skeleton/skeleton-highlight; la prefers-reduced-motion dispare shimmer-ul |
| 40 | **ProgressBar** | Bara liniară de progres |
| 41 | **UsageMeter** | Consumul față de limita abonamentului; peach la >80% |
| 42 | **Kbd** | Taste de scurtătură; radius-xs; sunken background |

---

### Lot 5 — Date, timp și tabele

| # | Componentă | Note |
|---|---|---|
| 43 | **DatePicker** | `react-aria-components` DatePicker; Intl pentru formatare; săptămâna începe luni; localizat complet |
| 44 | **SlotPicker** | Grid de sloturi orare pentru Booking |
| 45 | **DataTable** | Coloane declarative, sortare, filtre, paginare server, selecție, acțiuni în masă, densitate, skeleton, empty state, responsive (devine listă <768px), container queries; fără `if(app==='booking')` |
| 46 | **Agenda** | Lista de evenimente pe zi |
| 47 | **Schedule** | Calendarul zi/săptămână/resurse; `schedule-hour-height` (64px); linia „acum" în peach |
| 48 | **Kanban + KanbanCard** | Board cu coloane și drag&drop |
| 49 | **Timeline** | Linie temporală verticală |

---

### Lot 6 — Grafice și cifre

| # | Componentă | Note |
|---|---|---|
| 50 | **Stat** | Cifra KPI (numeric 28px, tabular-nums) + etichetă + delta; deltele procentuale scriu „+3 pp" pe ecran și „3 puncte procentuale" pentru screen reader |
| 51 | **LineChart** | SVG sau Canvas; culorile din tokens (chart-1…5); linia „acum" chart-now; comparație chart-compare; height din `chart-height` (240px) |
| 52 | **BarChart** | Idem; bar-max 24px; gap chart-gap (2px) |

---

### Lot 7 — Componente Hub și preferințe

| # | Componentă | Note |
|---|---|---|
| 53 | **Logo** | SVG inline; light/dark B automat după `data-theme`; variant full/mark; minimum 16px semn |
| 54 | **AppIcon** | 15 pictograme; muted pentru acces oprit; plăcuță navy în ambele teme; minimum 16px |
| 55 | **AppTile** | Tile în launcher (`app-tile-width` 168px, min-height 156px); hover shadow-1; tot tile-ul e butonul |
| 56 | **AppLaunch** | Animația de deschidere; `duration-slow` (360ms) |
| 57 | **AccessBadge** | Stările de acces: activ/suspendat/oprit/fără aplicație |
| 58 | **OrgSwitcher** | Popover cu lista afacerilor; `popover-width` (300px) |
| 59 | **NotificationsPanel** | Panel glisant; `panel-width` (400px); `panel-max-height` (560px) |
| 60 | **AccountMenu** | Meniu cont; include ThemeSwitcher și LanguageSwitcher |
| 61 | **ThemeSwitcher** | Light / Dark / Automată (D-UI-11) |
| 62 | **LanguageSwitcher** | RO / EN / FR / ES / DE / IT |
| 63 | **AddonPurchase** | Fluxul de cumpărare add-on cu card (Stripe); PaymentCard; StripeSlot |

---

### Lot 8 — Comercial (Growth Engine)

Ultimele în F1; depind de toate primitivele. Funcționează și fără Growth Engine activ (slotul rămâne gol).

| # | Componentă | Note |
|---|---|---|
| 64 | **GrowthSlot** | Containerul slot; afișează recomandarea sau nimic; niciodată desenat fix în ecran |
| 65 | **RecommendationLabel** | Eticheta discretă |
| 66 | **RecommendationCard** | Cardul de recomandare; „Nu mă interesează" obligatoriu |
| 67 | **DiscoveryTooltip** | Tooltip de descoperire (prima afișare) |
| 68 | **UpgradeDialog** | Dialogul de upgrade; „Perioadă de probă", fără card |
| 69 | **HubRecommendation** | Recomandarea din launcher |
| 70 | **CatalogRecommendation** | Recomandarea din catalog |
| 71 | **CommercialPreferences** | Preferințele utilizatorului față de recomandări |
| 72 | **HubCatalog / HubCatalogApp** | Catalogul de aplicații (deschis din launcher, comandă, cont) |
| 73 | **RuleBuilder** | Doar Founder Control Center; constructorul de reguli pentru campanii |
| 74 | **CommercialStates** | Stările componentelor comerciale (în așteptare/activat/nu acum) |

---

## Criterii de verificare per componentă

O componentă e **gată** când trece toate criteriile de mai jos.

### Contractul componentei

Fiecare componentă primește un fișier `<Componentă>.contract.md` cu secțiunile:
- **Scop** — o frază + când nu se folosește
- **Props** — toate, tipizate, cu valori implicite
- **Variante** — lista închisă
- **Dimensiuni** — sm | md | lg, legate de tokens
- **Stări** — default, hover, focus-visible, pressed, disabled, error, loading
- **Accesibilitate** — rol ARIA, navigare tastatură, etichete obligatorii
- **Comportament** — interacțiuni, animații (durată din tokens), prefers-reduced-motion
- **Responsive** — touch target 44px unde e cazul
- **Teme** — verificat Light și Dark
- **Localizare** — fără texte proprii; suportă texte cu ~30% mai lungi (DE/IT)
- **Extensibilitate** — ce se poate extinde și ce nu
- **Teste** — unitare + vizuale (light/dark × RO/DE)
- **Exemple** — utilizarea corectă + anti-exemple

### Checklist obligatoriu

| Criteriu | Cum se verifică |
|---|---|
| Light + Dark | Pagina `/design` cu toggle temă; Playwright screenshot |
| Contrast ≥4.5:1 text, ≥3:1 borduri/focus | Script automat pe valorile din tokens.css |
| Navigare tastatură | Playwright: Tab, săgeți, Esc, focus revine la trigger |
| ARIA corect | `@axe-core/playwright` fără erori |
| 6 limbi — nicio cheie brută | Playwright cu `locale` setat; eticheta în DE/IT nu taie layout-ul |
| Responsive 360–2560px | Playwright la: 360, 390, 430, 768, 820, 1024, 1280, 1440, 1920, 2560 |
| prefers-reduced-motion | Playwright cu reducedMotion; durate → 0ms |
| Nicio valoare vizuală hardcodată | Regula ESLint custom: blochează hex/rgb în `.tsx` și `.module.css` |
| Export corect din `@ventora/ui` | Import în aplicație test; typecheck trece |

### Tooling

- **Playwright** — teste vizuale, funcționale, responsive
- **@axe-core/playwright** — accesibilitate automată
- **Vitest** — unitare pentru hooks (useTheme, useToast, cva variants)
- **Script contrast** — verifică valorile generate din tokens.json; rulează în CI

---

## Ce nu intră în F1

- Ecranele (HubSignIn, HubLauncher, BookingToday, BookingCalendar etc.)
- Ecranele Founder (FounderBusinesses, GrowthOffers etc.)
- Portal și Network (identitate vizuală proprie, proiectată separat)

Acestea intră în fazele ulterioare, construite din componentele de mai sus.
