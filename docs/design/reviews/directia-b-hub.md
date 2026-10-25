# Direcția B — fișe pentru ecranele refăcute

**Data:** 25.10.2026 · Bianca Petrascu
**Sursa:** documentul „Ventora — fișe de review (Product Experience)”, tabul „Direcția B · Hub” — https://claude.ai/artifact/FF5kdhUWkp9i9tRjjFWFHt

Direcția B e aplicată în design system: launcher-ul, autentificarea și starea goală, plus componentele noi BrandZone, AppDock, PortalPresence și AppLaunch v2. Fișele de mai jos le trec prin cele 10 întrebări și prin etapele A–E. Funcțiile aprobate nu se schimbă; ce s-a propus în plus e marcat R-B; decizia e în §6.

## 1. Launcher

Launcher-ul devine centrul de comandă: banda de brand spune ce te așteaptă azi, iar rândul de iconuri te duce în aplicație dintr-un click. Ce era aprobat (fraza zilei cu scurtături, ordinea, slotul comercial) rămâne.

| Întrebare | Răspuns |
|---|---|
| Obiectivul utilizatorului | Să vadă dintr-o privire ce are de făcut azi și să deschidă aplicația potrivită dintr-un click. |
| Obiectivul de business și alinierea | Folosire zilnică (retenție), pagina din Portal ținută la zi, descoperirea aplicațiilor prin slotul existent. Aliniate: nimic comercial nu urcă peste aplicațiile tale. |
| Primele secunde | Banda navy cu data, salutul și fraza zilei, apoi rândul de iconuri cu badge-urile. |
| Acțiunea principală | Click pe un icon sau pe un jeton din fraza zilei. |
| Esențial | Iconurile cu badge-urile; jetoanele cu punct peach (ce te așteaptă). |
| Bariere | Descrierea și linia de azi apar doar la hover sau focus, deci pe ecranele tactile nu se văd. Fișa deschisă acoperă pe moment o parte din iconurile vecine. |
| Încredere | Fiecare aplicație blocată spune de ce. La Portal e clar ce se deschide în platformă și ce se deschide public (iconul de link extern). |
| Formulări | Texte noi: data, liniile de azi, cardul Portal. Vezi §4 Microcopy. |
| Oportunități | Activare: „Nu e publicată încă” e peach și duce la „Termină pagina”. Retenție: linia de azi din fișă. Descoperire: neschimbată, un singur slot. |
| Măsurare | Timpul până la prima aplicație deschisă; câte fișe deschise duc la o aplicație deschisă; clicuri pe „Gestionează pagina” și „Vezi cum arată în Portal”; câte pagini Portal ajung publicate. |

| Etapă | Modificare | De ce |
|---|---|---|
| A | Clicul deschide doar aplicația de sub cursor: zona fișei care iese peste vecini nu mai e clicabilă, iar mutarea mouse-ului pe vecin îl deschide pe el (R-B1). | Azi, un click pe marginea iconului vecin poate deschide aplicația din fișă. |
| B | Fișa se deschide după 120 ms de oprire a cursorului; se închide imediat (R-B2). | Când treci repede peste rând, fișele nu mai clipesc una după alta. |
| C | Nimic nou: cardul Portal nu vinde nimic, doar arată starea paginii. | Recomandarea comercială rămâne singurul slot, cu plafoanele. |
| D | Trei texte de reformulat (R-B3–R-B5), restul aprobate. | Detalii în §4 Microcopy. |
| E | Fișa se deschide și la focus de tastatură, cu inel de focus; ordinea tab: aplicațiile tale, Portal, apoi „Alte aplicații” și slotul. La reduced motion nu se mișcă nimic. | Navigarea cu tastatura ajunge la aceleași informații ca mouse-ul. |

## 2. Autentificare

Panoul de brand dă autentificării greutate fără să adauge pași: formularul e același, cu aceleași texte și aceleași stări.

| Întrebare | Răspuns |
|---|---|
| Obiectivul utilizatorului | Să intre repede în cont. |
| Obiectivul de business și alinierea | Prima impresie de produs premium. Aliniate: panoul nu cere nimic și nu încetinește intrarea. |
| Primele secunde | „Bine ai revenit” și câmpul de e-mail; panoul e citit ca fundal. |
| Acțiunea principală | „Intră în cont”. |
| Esențial | Formularul și „Ai uitat parola?”. |
| Bariere | Niciuna nouă. Pe telefon panoul devine o bandă îngustă cu logo-ul și limba, iar formularul începe imediat sub ea. |
| Încredere | Logo-ul oficial, „© 2026 Ventora Systems”, linkurile Termeni și Confidențialitate. |
| Formulări | Nou: „Afacerea ta. Într-un singur loc.” și © mutat în panou. |
| Oportunități | Niciuna comercială, și așa e corect pe acest ecran. |
| Măsurare | Timpul până la intrare; rata de erori; clicuri pe „Ai uitat parola?”. |

| Etapă | Modificare | De ce |
|---|---|---|
| A | Acceptarea invitației (HubInvite) primește același panou de brand (R-B6). | Primul ecran pe care îl vede un om nou e invitația; azi arată încă vechi, iar autentificarea de a doua zi arată altfel. |
| B | Nimic nou. | Un singur lucru de făcut pe ecran. |
| C | Nimic nou. | Fără conținut comercial la intrare. |
| D | Subsolul păstrează doar „Termeni · Confidențialitate · Ajutor” pe desktop; pe telefon rămâne rândul întreg. | © nu mai apare de două ori. |
| E | Panoul e `aside`; afirmația e text, nu imagine; chevronii sunt ascunși pentru cititoare. Contrastul pe panou e în §5. | Cititorul de ecran ajunge direct la formular. |

## 3. Starea goală

Starea goală păstrează banda, iar foaia cu „Cere acces” urcă peste marginea ei, ca dock-ul. Textele sunt cele aprobate.

| Etapă | Modificare | De ce |
|---|---|---|
| A | Nimic nou: „Cere acces” devine „Cerere trimisă · {data}”, ca până acum. | Comportamentul aprobat rămâne. |
| B | Fraza zilei e înlocuită de mesajul de bun venit, deci banda nu promite lucruri care nu există încă. | Fără jetoane goale. |
| C | Nimic comercial pentru un om fără aplicații. | Nu e momentul. |
| D | Nimic nou. | Text aprobat. |
| E | Ordinea de citire: salutul, mesajul, apoi „Cere acces”. | Acțiunea vine după ce omul înțelege de ce e gol. |

## 4. Microcopy

Fiecare text nou a fost verificat cu glosarul și în cele 6 limbi. Trei merită reformulate: „programează” înseamnă în glosar butonul afacerii, nota pentru membri uită managerul aplicației, iar o linie de azi nu spune ce e.

| Text | Unde | Verdict | Propunere |
|---|---|---|---|
| Duminică, 25 octombrie · Salon Aurora | Banda launcher-ului, deasupra salutului | Bun | — |
| Afacerea ta. Într-un singur loc. | Panoul de autentificare | Bun, cald și scurt | — |
| © 2026 Ventora Systems | Panoul de autentificare | Bun | — |
| Portal · pentru clienții tăi | Cardul Portal | Bun | — |
| Pagina afacerii în Portal | Cardul Portal | Bun, la fel ca în glosar | — |
| Clienții te găsesc și programează din Portal. Aici schimbi ce văd ei. | Cardul Portal | De reformulat (R-B3) | „Clienții te găsesc în Portal și își fac programări acolo. De aici schimbi ce văd ei.” |
| Doar proprietarul și adminii pot schimba pagina. | Cardul Portal, pentru membri | De corectat (R-B4) | „Pagina o pot schimba proprietarul, adminii și managerul aplicației Portal.” |
| Gestionează pagina · Termină pagina · Vezi cum arată în Portal | Cardul Portal | Bune, verb la început | — |
| Publicată · Ascunsă · Nu e publicată încă | Starea paginii | Bune | — |
| Următoarea: 09:30 · Ana Popescu | Fișa Booking | Bun | — |
| 4 clienți noi săptămâna asta · 3 termene săptămâna asta · Azi lucrează 4 colegi · 1 cerere de aprobat | Fișele CRM, Projects, Shifts, HR | Bune, cu plural ICU | „20 de clienți noi”, „Azi lucrează un coleg”, „2 cereri de aprobat” |
| 2 facturi scadente · 2.480 lei | Fișa Finance | Bun | — |
| Contract Salon Aurora · ieri | Fișa Documents | Neclar (R-B5) | „Ultimul deschis: Contract Salon Aurora · ieri” |
| Se deschide Booking | Anunțul pentru cititorul de ecran | Bun | — |
| Termeni · Confidențialitate · Ajutor | Subsolul autentificării pe desktop | Bun | — |

Traducerile pentru cardul Portal sunt în bundle în toate cele 6 limbi. Testul în germană trece: numele lungi se taie cu „…”, descrierile se opresc la 2 rânduri.

## 5. Contrast

Toate perechile de text trec de 4,5:1 în ambele teme, iar bordurile de control trec de 3:1. Singura pereche sub prag e linia piersică pe alb, care e decor: hover-ul îl arată ridicarea și umbra, iar focusul îl arată inelul.

| Pereche | Light | Dark | Minim |
|---|---|---|---|
| `on-brand` pe `brand-surface` | 16,25 | 14,66 | 4,5 |
| `on-brand` pe `brand-raised` (jetoane) | 14,20 | 12,67 | 4,5 |
| `on-brand-muted` pe `brand-surface` (data, fraza zilei) | 9,69 | 7,01 | 4,5 |
| `on-brand-muted` pe `brand-raised` | 8,47 | — | 4,5 |
| `brand-control-border` pe `brand-surface` (căutarea) | 4,13 | 4,10 | 3 |
| Punctul peach pe `brand-raised` | 8,75 | 7,81 | 3 |
| `ink` pe `raised` (numele din dock) | 18,68 | 14,20 | 4,5 |
| `ink-secondary` pe `raised` (descrierea și linia de azi) | 9,37 | 9,36 | 4,5 |
| `ink-secondary` pe `canvas` (intro-ul „Alte aplicații”) | 8,41 | 11,00 | 4,5 |
| `ink-muted` pe `canvas` #F2F3F0 | 5,11 | — | 4,5 |
| Inelul de focus pe `raised` / pe zona de brand | 18,68 | 14,66 | 3 |
| `hover-accent` pe `raised` (linia piersică) | 1,87 | 8,75 | decor |

## 6. Ce ai de decis

Toate șapte aprobate de fondatoare pe 25.10.2026 și aplicate în design system ca V12–V18 (registrul deciziilor din `system/README.md`).

| # | Recomandare | De ce | Decizia |
|---|---|---|---|
| R-B1 | Clicul deschide doar aplicația de sub cursor; zona fișei care trece peste vecini nu mai e clicabilă. | Un click pe marginea iconului vecin nu mai deschide aplicația greșită. | **Da** · aplicat ca V12 (25.10.2026) |
| R-B2 | Fișa se deschide după 120 ms de oprire a cursorului și se închide imediat. | Fără fișe care clipesc când treci peste rând. | **Da** · aplicat ca V13 (25.10.2026) |
| R-B3 | „Clienții te găsesc în Portal și își fac programări acolo. De aici schimbi ce văd ei.” | „Programează” e în glosar butonul afacerii; aici vorbim despre clienți. | **Da** · aplicat ca V14 (25.10.2026) |
| R-B4 | „Pagina o pot schimba proprietarul, adminii și managerul aplicației Portal.” | Textul aprobat îl lasă pe dinafară pe managerul aplicației, care are acces (V6). | **Da** · aplicat ca V15 (25.10.2026) |
| R-B5 | Linia din Documents devine „Ultimul deschis: Contract Salon Aurora · ieri”. | Singur, numele documentului nu spune de ce apare acolo. | **Da** · aplicat ca V16 (25.10.2026) |
| R-B6 | Acceptarea invitației (HubInvite) primește panoul de brand al autentificării. | Omul nou vede întâi invitația; azi arată altfel decât autentificarea de a doua zi. | **Da** · aplicat ca V17 (25.10.2026) |
| R-B7 | În aplicații, salutul din „Azi” rămâne la 30/36; 40/46 doar în launcher și la autentificare. | `display-l` mare apăsa ecranele dense (Booking · Azi); pe telefon e deja 32/36. | **Da** · aplicat ca V18 (25.10.2026) |
