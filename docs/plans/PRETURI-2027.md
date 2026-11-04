# D3-1 — Prețuri aprobate de fondatoare (03.11.2026, 13:35)

Prețuri fără TVA (Ventora Systems SRL e neplătitoare de TVA). Lei și euro introduse manual (conversie comercială 1 € = 5 lei). Anual = 12 × lunar × 0,85.
Model: fără cod nou. Locurile în echipă și locațiile sunt pe cont: 3 locuri + 1 locație incluse în orice cont; în plus doar prin bundle sau pachet.

## Aplicații (implementare o singură dată + mentenanță lunară)
| Aplicație | Lunar | Implementare | Limite care se pun acum (chei existente) | Limite pentru când se construiește aplicația |
|---|---|---|---|---|
| EasyBook | 195 lei / 39 € | 495 lei / 99 € | booking.appointments 1.000/lună | — |
| ClientDesk | 195 lei / 39 € | 495 lei / 99 € | — | 3.000 contacte, 2 pipeline-uri |
| MoneyDesk | 225 lei / 45 € | 495 lei / 99 € | — | 500 documente/lună |
| TeamSpace | 245 lei / 49 € | 745 lei / 149 € | — | 50 profiluri angajați |
| ShiftPlan | 145 lei / 29 € | 395 lei / 79 € | — | 50 angajați planificați |
| TaskBoard | 145 lei / 29 € | 395 lei / 79 € | — | 10 proiecte active, 2.000 taskuri |
| StockDesk | 195 lei / 39 € | 495 lei / 99 € | — | 2.000 produse, 5.000 mișcări/lună |
| DocSpace | 145 lei / 29 € | 395 lei / 79 € | documents.storage 20 GB | 5.000 documente |
| ContractDesk | 195 lei / 39 € | 495 lei / 99 € | — | 500 contracte active |
| EventSpace | 195 lei / 39 € | 495 lei / 99 € | events.active 20 | 2.000 înscrieri/lună |
| AssetDesk | 195 lei / 39 € | 495 lei / 99 € | — | 1.000 active |
| CampaignKit | 175 lei / 35 € | 395 lei / 79 € | marketing.campaigns 20 active; messaging.email 2.000/lună | — |
| DataView | 175 lei / 35 € | 395 lei / 79 € | ai.analyses 20/lună | 20 dashboarduri |
Portal și Network: în afara listei (gratuite la lansare / Faza 7).

## Bundle-uri
| Bundle | Aplicații | Lunar | Implementare | Locuri în echipă în plus |
|---|---|---|---|---|
| Programări | EasyBook, ClientDesk | 369 lei / 74 € | 890 lei / 178 € | +2 |
| Echipă | TeamSpace, ShiftPlan, TaskBoard | 479 lei / 96 € | 1.380 lei / 276 € | +7 |
| Operațiuni | StockDesk, AssetDesk, ContractDesk, DocSpace | 655 lei / 131 € | 1.595 lei / 319 € | +2 |
| Complet | toate cele 13 | 1.940 lei / 388 € | 5.340 lei / 1.068 € | +7 |

## Pachete în plus
- +1 loc în echipă: 35 lei / 7 € pe lună
- +1 locație: 125 lei / 25 € pe lună
- +500 SMS: 75 lei / 15 € (de verificat la alegerea furnizorului SMS)
- +1.000 e-mailuri: 25 lei / 5 € pe lună
- +20 analize AI: 50 lei / 10 € pe lună
- +500 programări: 49 lei / 10 € pe lună
- +10 GB spațiu: 25 lei / 5 € pe lună
- Funnel realizat de echipă: 2.500 lei / 500 €, o singură dată, „La cerere”

## Alte decizii legate
- Vânzarea: „Direct” sau „La cerere” per aplicație, din Founder (D3-24); fără reduceri automate după numărul de aplicații — reducerile sunt bundle-urile și reducerile individuale din Founder.
- De validat cu primii 5–10 clienți; o versiune nouă de preț nu atinge clienții existenți.

---

_Mai sus: textul aprobat, copiat neschimbat din `docs/design/_incoming/PRETURI_D3-1_2026-11-03.md` (worktree-ul UI). Mai jos: cum se aplică în model (lotul D3-1, `scripts/seed-pricing.ts`)._

## Cum se aplică

`scripts/seed-pricing.ts`, prin contractele Founder din `core/commercial`, fără cod nou în modelul comercial:

- **Aplicațiile:**
  - prețurile prin `setApplicationPrices`: lunar, anual (12 × lunar × 0,85, rotunjit la leu și la euro întreg) și implementare, în lei și în euro;
  - „La cerere” prin `setApplicationActivationMode`;
  - limitele pe cheile existente prin `setApplicationQuotas`.
- **Bundle-urile:** `createPlan`, `createPlanVersion`, `updateDraftVersion` (aplicațiile, prețurile, limitele), `setOfferPeriod` (deschisă, fără date) și `publishVersion`.
- **Pachetele:** `createAddon`, pe „La cerere”.
- **`included_members`:** rămâne 3. Scriptul doar verifică valoarea, nu o scrie.

Rotunjirile anuale (12 × lunar × 0,85):

| | Lunar | Anual |
|---|---|---|
| EasyBook, ClientDesk, StockDesk, ContractDesk, EventSpace, AssetDesk | 195 lei / 39 € | 1.989 lei / 398 € |
| MoneyDesk | 225 lei / 45 € | 2.295 lei / 459 € |
| TeamSpace | 245 lei / 49 € | 2.499 lei / 500 € |
| ShiftPlan, TaskBoard, DocSpace | 145 lei / 29 € | 1.479 lei / 296 € |
| CampaignKit, DataView | 175 lei / 35 € | 1.785 lei / 357 € |
| Bundle Programări | 369 lei / 74 € | 3.764 lei / 755 € |
| Bundle Echipă | 479 lei / 96 € | 4.886 lei / 979 € |
| Bundle Operațiuni | 655 lei / 131 € | 6.681 lei / 1.336 € |
| Bundle Complet | 1.940 lei / 388 € | 19.788 lei / 3.958 € |

**Limitele bundle-urilor (DE VALIDAT).** O aplicație dintr-un bundle nu aduce limitele pe care le are la bucată: acelea contează doar pentru liniile la bucată. Fiecare bundle poartă deci:

- limitele aplicațiilor lui (de exemplu, Programări: 1.000 de programări pe lună);
- locurile în plus (`platform.members`), peste cele 3 incluse;
- o locație (`platform.locations` = 1).

Lista aprobată nu dă bundle-urilor limite proprii.

## De pus când se construiește aplicația

Limitele aprobate care nu au încă o cheie în registru. Nu s-au creat chei noi; fiecare intră cu manifestul aplicației ei:

| Aplicație | Limita |
|---|---|
| ClientDesk | 3.000 contacte; 2 pipeline-uri |
| MoneyDesk | 500 documente pe lună |
| TeamSpace | 50 profiluri de angajați |
| ShiftPlan | 50 de angajați planificați |
| TaskBoard | 10 proiecte active; 2.000 de taskuri |
| StockDesk | 2.000 de produse; 5.000 de mișcări pe lună |
| DocSpace | 5.000 de documente (spațiul, 20 GB, e pus acum) |
| ContractDesk | 500 de contracte active |
| EventSpace | 2.000 de înscrieri pe lună (evenimentele active, 20, sunt puse acum) |
| AssetDesk | 1.000 de active |
| DataView | 20 de dashboarduri (analizele AI, 20 pe lună, sunt puse acum) |

## Ce nu se poate exprima acum (fără cod nou)

- **„Funnel realizat de echipă”** (2.500 lei / 500 €, o singură dată, „La cerere”).
  - Un pachet are o cheie de limită și o cantitate; un serviciu făcut de echipă nu are cheie.
  - `funnel.pages.published` numără paginile publicate, iar un pachet „o singură dată” ar ține doar luna curentă.
  - Nu s-a creat.
- **1 locație inclusă în orice cont.**
  - Nu există o setare „locații incluse”, ca `included_members`.
  - Locația e pusă doar în bundle-uri; conturile doar cu aplicații la bucată au 0 locații.
  - `platform.locations` e azi doar declarată: nimic nu o consumă.
- **Motivul „D3-1, prețurile de lansare 2027” în audit.** Contractele Founder nu primesc un motiv. Rândurile de audit se scriu normal (acțiunea, ținta, valorile), fără el.
- **O singură tranzacție.** Fiecare contract își deschide tranzacția lui. Scriptul citește și verifică tot înainte de prima scriere: o valoare deja pusă altfel îl oprește fără nicio scriere. E și idempotent, deci o rulare întreruptă se reia.
