# VENTORA SOURCE OF TRUTH — Index central

**Scop:** Index unic al surselor de adevăr ale ecosistemului Ventora. Trimite la surse, nu copiază conținut.
**Regula anti-drift:** o regulă se scrie într-un singur loc. Dacă două surse se contrazic → `NECESITĂ DECIZIE FONDATORI`.

---

## Ierarhia autorității

1. **Decizii aprobate ale fondatorilor + `docs/checklists/`** — CE construim. Prioritate maximă.
2. **`docs/VENTORA_MASTER_BRIEF.md`** — viziunea și regulile de produs.
3. **`docs/ARCHITECTURE.md`** v0.3.1 — CUM construim: structuri, principii, decizii tehnice.
4. **`docs/DESIGN_RULES.md`** + exportul din `docs/design/system/` — regulile vizuale.
5. **Acest document** — indexul central.
6. **`docs/adr/`** — deciziile arhitecturale individuale.
7. **`CLAUDE.md`** (rădăcină) — regulile operaționale pentru Claude Code.

---

## 1. Cerințe funcționale

| Document | Locație | Scop |
|---|---|---|
| Checklisturile (15 aplicații, 1.465 funcționalități) | `docs/checklists/` | Cerințele confirmate. Sursa primară. |
| Index checkliste | `docs/checklists/README.md` | Tabel sumar + diferențe față de brief |
| Master Brief | `docs/VENTORA_MASTER_BRIEF.md` | Viziunea, regulile de produs, criteriile de acceptare |

---

## 2. Arhitectura tehnică

| Document | Locație | Scop |
|---|---|---|
| Architecture v0.3.1 | `docs/ARCHITECTURE.md` | Structuri, principii, decizii, status CONFIRMAT/PROPUS/NECESITĂ DECIZIE |
| Growth Engine | `docs/GROWTH_ENGINE.md` | Specificația completă a serviciului Core `core/growth` |
| SMS de pe numărul propriu | `docs/SMS_NUMAR_PROPRIU.md` | `core/messaging`, adaptoarele SMS, experimentul E-SMS-1 — aprobat condiționat (D-SMS-1…9) |
| Planul Faza 0 ✅ ÎNCHIS 25.10.2026 | `docs/plans/FAZA-0.md` | Pașii 0.1–0.4, experimente, criterii de ieșire — toate bifate |
| Planul Faza 2 | `docs/plans/FAZA-2.md` | Identitate și acces: Better Auth, organizații, membership, invitații, authorize(), 2FA, audit |
| Audit recoltare | `docs/audit-recoltare.md` | Inventarul `ventora_hub` (read-only) — sursa de lecții |

---

## 3. Design

| Document | Locație | Scop |
|---|---|---|
| Design Rules | `docs/DESIGN_RULES.md` | Regulile vizuale obligatorii pentru tot ecosistemul |
| **Sursa unică a designului** | `docs/design/system/README.md` | Registrul celor 52 de decizii aprobate (Claude Design) |
| Tokens | `docs/design/system/tokens.json` | Valorile vizuale. `packages/tokens` se generează din el. |
| Glosar vizual | `docs/design/system/glossary.md` | Termeni aprobați (RO + alte limbi); sursa pentru UX writing |
| Pattern-uri | `docs/design/system/patterns.md` | Pattern-uri de ecran și interacțiune |
| Componente | `docs/design/system/components/` | README (anatomie, variante, stări) + `preview.html` pentru fiecare |
| Fonturi | `docs/design/system/fonts/` | Syne și DM Sans (variabile, woff2) — se copiază în `packages/ui` |
| Logo oficial | `docs/design/logo/` | SVG-uri oficiale (light + dark = varianta B). Nu se recolorează. |
| Iconuri aplicații | `docs/design/app-icons/` | 15 aplicații × 4 variante (default / dark / inactive / inactive-dark) |
| Fișe review Product Experience | `docs/design/reviews/` | Decizii P1–P27 și D1–D14 aprobate |
| Spec componente comerciale | `docs/design/SPEC_COMPONENTE_COMERCIALE.md` | GrowthSlot, RecommendationCard, UpgradeDialog etc. |
| Spec ecrane SMS | `docs/design/SPEC_ECRANE_SMS.md` | Ecranele „SMS de pe numărul propriu" pentru Claude Design — sursa pentru Booking (9 secțiuni, toate stările) |
| Șablon fișă review ecran | `docs/design/SCREEN_REVIEW_TEMPLATE.md` | Obligatoriu pentru fiecare ecran nou (DESIGN_RULES §15) |

---

## 4. Instrucțiuni operaționale

| Document | Locație | Scop |
|---|---|---|
| Reguli Claude Code | `CLAUDE.md` | Regulile operaționale pentru sesiunile de dezvoltare |

---

## 5. Decizii arhitecturale (ADR-uri)

| Locație | Format |
|---|---|
| `docs/adr/` | `NNNN-titlu-kebab-case.md` — șablonul în `docs/adr/0000-template.md` |

Fiecare ADR înregistrează o decizie cu status CONFIRMAT/PROPUS/NECESITĂ DECIZIE/DE VALIDAT TEHNIC.
Indexul deciziilor principale: `docs/ARCHITECTURE.md §17.1`.
