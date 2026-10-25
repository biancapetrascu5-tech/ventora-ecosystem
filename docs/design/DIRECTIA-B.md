# Direcția B „Navy de comandă” — ce s-a schimbat în design system

**Data:** 25.10.2026 · **Stare:** aplicată în Claude Design (V1–V11), plus recomandările R-B1…R-B7 aprobate și aplicate pe 25.10.2026 (V12–V18).
**Sursa:** artefactul „Ventora” — https://claude.ai/artifact/7cKaNW6635S7vQavjgY8zH (export din 25.10.2026, după V18; 259 de fișiere, înlocuiește integral `system/`).

## Pe scurt

- Direcția B atinge **doar Hub-ul**: banda launcher-ului, autentificarea, starea goală. Interiorul celor 13 aplicații, Founder și setările Hub-ului **nu se schimbă**, cu excepția valorilor de token globale de mai jos (`canvas`, `radius-xl`, `shadow-2`, `display-xl`), care se văd peste tot. `display-l` rămâne 30/36 (V18); mărimea mare a Hub-ului e tokenul nou `display-hub`.
- Navy (`brand-surface`) e suprafață **numai** în `BrandZone`, numai în Hub (V2). Niciodată în aplicații, dialoguri sau carduri.
- Funcțiile, ordinea, slotul comercial și textele aprobate rămân. Textele noi sunt cele din V10.

## Deciziile V1–V18 (din `system/README.md`, registrul deciziilor)

| # | Decizie |
|---|---|
| V1 | Zone de brand în Hub: antetul și banda launcher-ului (salut, fraza zilei, „Aplicațiile tale”) și panoul de autentificare. Navy în light, negru rece în dark. |
| V2 | Navy e suprafață doar în zonele de brand ale Hub-ului (`BrandZone`). |
| V3 | Pe zona de brand, logo-ul folosește varianta B. |
| V4 | „Aplicațiile tale” = rând de iconuri de 64px (`AppDock`) pe o foaie ridicată peste marginea benzii; la hover/focus, fișa aplicației (icon 48px, nume, descriere, linia de azi). Pe telefon: grilă de 56px, fără fișă. |
| V5 | Linia piersică de sub fișă = „ești aici”: doar la hover și focus. |
| V6 | Portal are cardul lui (`PortalPresence`) sub aplicații. „Gestionează pagina” → gestionarea prezenței în platforma de business, același tab; „Vezi cum arată în Portal” → pagina publică, tab nou. Gestionează: proprietar, admin, managerul aplicației Portal; membrii doar văd; colaboratorii externi nu văd cardul. |
| V7 | `AppLaunch` v2: iconul crește la 112%, aplicația crește din cardul apăsat, iconul trece prin centru și se așază în bara aplicației (~850 ms). Ecranul vechi rămâne starea de încărcare. |
| V8 | Mișcarea cu rebound (`ease-spring`) există doar în Hub. |
| V9 | „Alte aplicații Ventora”: rânduri compacte, numele 16/24 semibold, explicații 14/20 `ink-secondary`. |
| V10 | Texte noi: data + afacerea deasupra salutului; „Afacerea ta. Într-un singur loc.” și „© 2026 Ventora Systems” în panoul de autentificare; textele cardului Portal; liniile de azi din fișe. |
| V11 | Tokenii de mai jos. |
| V12 (R-B1) | În AppDock, clicul deschide doar aplicația de sub cursor; partea fișei care trece peste vecini nu e clicabilă. |
| V13 (R-B2) | Fișa din AppDock se deschide după 120 ms de oprire a cursorului (`duration-intent`) și se închide imediat; la focus de tastatură se deschide fără așteptare. |
| V14 (R-B3) | Cardul Portal: „Clienții te găsesc în Portal și își fac programări acolo. De aici schimbi ce văd ei.” |
| V15 (R-B4) | Pentru membri: „Pagina o pot schimba proprietarul, adminii și managerul aplicației Portal.” |
| V16 (R-B5) | Linia de azi din Documents: „Ultimul deschis: {document} · {când}”. |
| V17 (R-B6) | Acceptarea invitației (`HubInvite`) folosește panoul de brand al autentificării. |
| V18 (R-B7) | În aplicații, salutul din „Azi” rămâne `display-l` 30/36; `display-hub` 40/46 doar în launcher și la autentificare. |

## Componente

**Noi:** `AppDock`, `BrandZone`, `PortalPresence`.
**Modificate (README și/sau preview):** `AppLaunch` (v2), `AppTile`, `ContextBar`, `HubLauncher`, `HubSignIn`, `HubEmpty`, `HubInvite` (V17), `Logo`; plus `bundle.css`, `bundle.js`, `index.d.ts`, `design-system.json`, `README.md`, `glossary.md`, `patterns.md`, `tokens.json`.
**Neschimbate:** toate celelalte (120 de foldere de componente identice cu exportul din 24.10), fonturile, logo-urile, glifele iconurilor de aplicații. SVG-urile din `app-icons/` rămân valabile, nu trebuie regenerate.

## Tokeni (diferența față de exportul din 24.10)

### Tokeni noi (21)

| Token | Valoare |
|---|---|
| `brand-surface` | `{"value": {"light": "#000C3F", "dark": "#1B1D23"}}` |
| `brand-raised` | `{"value": {"light": "#0D1A52", "dark": "#262930"}}` |
| `on-brand` | `{"value": {"light": "#F1EFEA", "dark": "#F1EFEA"}}` |
| `on-brand-muted` | `{"value": {"light": "#B5BAD0", "dark": "#A9A7A2"}}` |
| `brand-line` | `{"value": {"light": "rgba(241, 239, 234, 0.16)", "dark": "rgba(241, 239, 234, 0.12)"}}` |
| `brand-line-strong` | `{"value": {"light": "rgba(241, 239, 234, 0.32)", "dark": "rgba(241, 239, 234, 0.24)"}}` |
| `brand-control-border` | `{"value": {"light": "#6E7596", "dark": "#7A7D86"}}` |
| `hover-accent` | `{"value": "{attention}"}` |
| `display-hub` | `{"fontSize": "40px", "lineHeight": "46px", "fontWeight": 700, "letterSpacing": "-0.03em", "sample": "Bună dimi` |
| `lead` | `{"fontSize": "18px", "lineHeight": "34px", "fontWeight": 400, "sample": "Azi ai 8 programări, 2 facturi scaden` |
| `eyebrow` | `{"fontSize": "12px", "lineHeight": "16px", "fontWeight": 600, "letterSpacing": "0.08em", "sample": "DUMINICĂ, ` |
| `shadow-tile-hover` | `{"value": {"light": "0 2px 4px rgba(0, 12, 63, 0.08), 0 22px 40px -12px rgba(0, 12, 63, 0.28)", "dark": "0 0 0` |
| `dock-icon` | `{"value": "64px"}` |
| `dock-icon-compact` | `{"value": "48px"}` |
| `dock-icon-phone` | `{"value": "56px"}` |
| `dock-card-w` | `{"value": "264px"}` |
| `duration-intent` | `{"value": "120ms"}` |
| `duration-playful` | `{"value": "280ms"}` |
| `duration-morph` | `{"value": "340ms"}` |
| `duration-launch` | `{"value": "420ms"}` |
| `ease-spring` | `{"value": "cubic-bezier(0.34, 1.56, 0.64, 1)"}` |

### Tokeni cu valoare schimbată (4)

| Token | Înainte | Acum |
|---|---|---|
| `canvas` | `{"value": {"light": "#EFF0EE", "dark": "#0E0F11"}}` | `{"value": {"light": "#F2F3F0", "dark": "#0E0F11"}}` |
| `display-xl` | `{"fontSize": "40px", "lineHeight": "44px", "fontWeight": 700, "letterSpacing": "-0.02em", "sample": "Bine ai v` | `{"fontSize": "56px", "lineHeight": "58px", "fontWeight": 700, "letterSpacing": "-0.035em", "sample": "Afacerea` |
| `radius-xl` | `{"value": "16px"}` | `{"value": "18px"}` |
| `shadow-2` | `{"value": {"light": "0 1px 2px rgba(0, 12, 63, 0.06), 0 8px 24px rgba(0, 12, 63, 0.10)", "dark": "0 1px 2px rg` | `{"value": {"light": "0 1px 2px rgba(0, 12, 63, 0.08), 0 16px 32px -12px rgba(0, 12, 63, 0.22)", "dark": "0 1px` |

### Tokeni eliminați (0)

Niciunul.

## Ce are de făcut agentul UI

1. `git merge main` pe ramura UI, după ce docs-ul nou e pe main.
2. Regenerează `packages/tokens` din `docs/design/system/tokens.json` (nu de mână). Verifică că apar cele 21 roluri noi și cele 4 valori schimbate (`display-l` rămâne 30/36).
3. Implementează în `packages/ui`, cu React Aria și CSS Modules: `BrandZone`, `AppDock` (fișa după 120 ms de hover, clic doar sub cursor, focus de tastatură fără așteptare, grilă pe telefon), `PortalPresence`, `AppLaunch` v2 (cu `prefers-reduced-motion`: fără animație).
4. Ajustează ce e deja făcut în loturile 1–3 la noile valori (`canvas`, `radius-xl`, `shadow-2`, `display-xl`) și refă `/design/demo` după `HubLauncher`, `HubSignIn`, `HubEmpty` și `HubInvite` din preview-urile noi. Salutul Hub folosește `display-hub`, nu `display-l`. Pagina de comparație side-by-side trebuie să arate același lucru în stânga și în dreapta.
5. Navy doar în `BrandZone`: niciun `brand-*` folosit în afara Hub-ului (de adăugat ca regulă de lint sau test, dacă e simplu).
6. R-B1…R-B7 sunt aprobate și deja în design system (V12–V18); se implementează ca atare.
