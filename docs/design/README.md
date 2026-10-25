# docs/design — designul aprobat al ecosistemului Ventora

**Stare:** CONFIRMAT, 24.10.2026 (D-UI-5). Claude Design, etapele 1–5 aprobate. Actualizat 25.10.2026 cu direcția B „Navy de comandă” (V1–V18, doar Hub) — vezi `DIRECTIA-B.md`.
**Artefactul sursă:** „Ventora” — https://claude.ai/artifact/7cKaNW6635S7vQavjgY8zH
**Acoperire:** Hub, Founder Control Center, cele 13 aplicații de business, componentele comerciale (Growth Engine). Portal și Network se proiectează separat (DESIGN_RULES §2.1, ARCHITECTURE §10.8).

| Folder / fișier | Ce conține | Cum se folosește |
|---|---|---|
| `system/README.md` | **Sursa unică**: regulile designului și registrul deciziilor (inclusiv V1–V18, direcția B) | Se citește primul. La orice conflict cu alt fișier din `docs/design/`, câștigă acesta. |
| `system/tokens.json` | Toți tokenii (culori pe teme, tipografie, spațiere, raze, umbre, iconuri de aplicații) | Singura sursă de valori. `packages/tokens` se generează din el, nu se rescrie de mână. |
| `system/glossary.md` | Glosarul de termeni aprobați (RO + celelalte limbi) | Sursa pentru UX writing (DESIGN_RULES §13.1). |
| `system/patterns.md` | Pattern-urile de ecran și de interacțiune | Referință pentru ecranele noi. |
| `system/components/<Nume>/` | README (anatomie, variante, stări, reguli) + `preview.html` pentru fiecare componentă și ecran | Contractul vizual; `packages/ui` le implementează. |
| `system/components/bundle.*` | Implementarea de referință din Claude Design (React, CSS) | **Referință, nu cod de produs.** Se evaluează înainte de a construi echivalentul în `packages/ui` (DESIGN_RULES §1). |
| `system/fonts/` | Syne și DM Sans (variabile, woff2) | Se copiază în `packages/ui`. |
| `system/assets/Logos/` | Logo-ul oficial (light + dark), semnul, favicon-ul | Identice cu `logo/`. |
| `logo/` | Logo-ul și semnul oficial, SVG; dark = varianta B | Singurele variante permise. Nu se recolorează. |
| `app-icons/` | Cele 15 iconuri de aplicații, SVG standalone, câte 4 variante: `<app>`, `-dark`, `-inactive`, `-inactive-dark` | Pentru favicon-uri, manifeste, emailuri. În aplicații se folosește componenta `AppIcon`. Generate exact din glifele componentei `AppIcon` și din culorile documentate în `system/assets/App icons/README.md`. |
| `reviews/` | Fișele Product Experience (Hub, Booking, Founder + Growth, Direcția B · Hub), rezumatul și revizuirea de microcopy | Deciziile P1–P27 și D1–D14 sunt aprobate; cele care ating arhitectura sunt în ARCHITECTURE §17.14. R-B1…R-B7 (`reviews/directia-b-hub.md`) aprobate, aplicate ca V12–V18. |
| `DIRECTIA-B.md` | Ce s-a schimbat în design system cu direcția B: deciziile V1–V18, componentele noi (AppDock, BrandZone, PortalPresence), diferența de tokeni, pașii pentru agentul UI | Se citește înainte de a ajusta Hub-ul la direcția B. |
| `SPEC_COMPONENTE_COMERCIALE.md` | Specificația componentelor Growth Engine dată lui Claude Design | Context pentru GrowthSlot, RecommendationCard, UpgradeDialog etc. |
| `SPEC_ECRANE_SMS.md` | Cerințele pentru ecranele „SMS de pe numărul propriu” (Booking), de trimis la Claude Design | Neproiectate încă; specificația funcțională: `docs/SMS_NUMAR_PROPRIU.md`. |
| `SCREEN_REVIEW_TEMPLATE.md` | Șablonul fișei de review (DESIGN_RULES §15) | Pentru fiecare ecran nou. |

**Reguli:** nicio valoare vizuală inventată în cod; dacă lipsește ceva din export, se marchează „NECESITĂ DECIZIE FONDATORI” și se cere în Claude Design, nu se improvizează. Exporturile vechi („Ventora Hub”, launcher-ul, schițele de iconuri) au fost scoase și nu se mai folosesc.
