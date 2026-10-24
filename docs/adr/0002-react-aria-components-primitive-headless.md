# ADR 0002 — React Aria Components ca bibliotecă primitive headless (D-UI-2)

**Status:** CONFIRMAT
**Data:** 2026-10-24
**Aprobat de:** Fondatori (sesiunea F1 design system)
**Referință:** docs/ARCHITECTURE.md §10.8 (D-UI-2)

---

## Context

Sistemul de design Ventora (F1) necesită o bibliotecă de primitive headless UI pentru componentele
cu comportament complex și cerințe stricte de accesibilitate: Dialog, Select, Combobox, Menu,
Tooltip, Tabs, Popover, DatePicker. Cerințele sunt:

- Zero stiluri impuse — toate valorile vizuale vin exclusiv din tokenuri CSS
- Suport React 19.x (versiunea curentă a monorepo-ului)
- Acoperire nativă pentru toate cele 8 tipuri de componente
- API stabil, nu pre-release
- Accesibilitate WAI-ARIA completă

Au fost evaluate trei biblioteci pe baza datelor `npm view` din 24 octombrie 2026.

## Decizie

Folosim **React Aria Components** (`react-aria-components@1.22.1`) ca singur strat de primitive
headless pentru `packages/ui-primitives` și `packages/ui`.

## Justificare

React Aria Components este singura bibliotecă din cele trei evaluate care acoperă nativ toate
cele 8 tipuri de componente, inclusiv Combobox și DatePicker — care în Radix nu există și în
Base UI nu există (DatePicker). Este menținută de echipa Adobe care redactează spec-ul WAI-ARIA,
testele interne acoperă NVDA, JAWS, VoiceOver și TalkBack. API-ul este stabil (v1 GA din 2024)
cu 12 release-uri stabile în ultimele 12 luni.

## Alternativele evaluate

| Opțiune | Argumente pro | Argumente contra |
|---|---|---|
| **React Aria Components** (ales) | 8/8 componente acoperite nativ; 12 release-uri stabile/an; best-in-class ARIA (echipa Adobe); React 19 via `^16.8 \|\| ^19` | API mai verbos decât Radix; curba de învățare pentru DatePicker |
| Radix Primitives | Standard comunitate; ecosistem mare (shadcn); 11 release-uri stabile/an | Lipsesc Combobox și DatePicker — ar necesita implementare custom sau o a doua bibliotecă | 
| Base UI (`@base-ui-components/react`) | Acoperă Combobox; mono-pachet simplu | Status RC activ (`1.0.0-rc.0`) — API instabil; 4 release-uri în ultimele 12 luni, toate pre-release; lipsește DatePicker |

Date verificate prin `npm view` la 24 octombrie 2026:
- `react-aria-components`: `1.22.1` · modificat 2026-10-09
- `@base-ui-components/react`: `1.0.0-rc.0` · modificat 2026-07-15
- `@radix-ui/react-dialog`: `1.3.1` · modificat 2026-10-14

## Consecințe

- `packages/ui-primitives` importă `react-aria-components` ca singură dependență de primitive
- Fiecare componentă Ventora wrapper-ează un component React Aria corespunzător
- Nu se importă Radix, shadcn, Base UI sau orice altă bibliotecă headless în paralel
- DatePicker și Combobox sunt disponibile nativ — fără implementare custom
- `packages/ui` nu importă `react-aria-components` direct; accesul este prin `packages/ui-primitives`
- Dacă Adobe face breaking changes majore, migrarea este izolată în `packages/ui-primitives`

## Referințe

- `docs/ARCHITECTURE.md` §10.8 (D-UI-2 PROPUS → CONFIRMAT prin această decizie)
- Comparație completă: https://claude.ai/artifact/YWL5Qve7NWiuqU3GkRffod
- ADR 0001 (TypeScript 6.x — versiunile toolchain-ului)
