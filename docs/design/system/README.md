Ventora e un singur produs, chiar dacă are un Hub și 15 aplicații (Booking, CRM, Documents, Contracts, Events, HR, Inventory, Shifts, Marketing, Analytics, Assets, Projects, Finance, Portal, Network): aceleași componente, aceeași navigație, aceleași reguli, în română, engleză, franceză, spaniolă, germană și italiană, în temă luminoasă și întunecată. Portal și Network fac parte din familie prin iconițe: apar în launcher, pe tile-uri, în favicon și în notificări exact ca celelalte. Doar interiorul lor are identitate vizuală proprie, proiectată separat; ecranele lor nu folosesc shell-ul și componentele de aici. Premium prin precizie, nu prin decor: ierarhie din tipografie, spațiu și linii fine, interfață ~90% neutră, culoare doar acolo unde înseamnă ceva.

## Cum citești acest document

Acest README e sursa unică pentru Ventora: principiile, regulile vizuale, regulile de produs și toate deciziile aprobate. Când ceva de aici contrazice un ecran, un mesaj sau o notă mai veche, are dreptate README-ul. Restul fișierelor îl detaliază, fără să-l contrazică:

| Fișier | Ce conține |
| --- | --- |
| `README.md` | Principii, ton, culoare, tipografie, spațiu, iconuri, logo, responsive, accesibilitate, regulile de produs, registrul deciziilor, inventarul |
| `patterns.md` | Cum se compun componentele în ecrane: navigație, acces, limite, liste, formulare, feedback, Hub, aplicații, date vizuale, scriere, comercial, Founder, review de produs, măsurare |
| `glossary.md` (cardul Glosar) | Un singur cuvânt pentru fiecare lucru, în cele 6 limbi, plus regulile de scriere |
| `tokens.json` | Toate valorile: culori light/dark, tipografie, spațiu, raze, borduri, umbre, dimensiuni, durate, straturi |
| `components/<Nume>/README.md` | Proprietățile și regulile fiecărei componente și fiecărui ecran |
| `components/index.d.ts` | Tipurile componentelor |
| `assets/Logos/`, `assets/App icons/` | Logo-ul oficial (light și dark varianta B) și cele 15 iconuri de aplicații |

**Cum se schimbă ceva.** Orice ecran nou trece prin trei pași înainte să fie gata: (1) revizuirea de microcopy (toate textele, în toate stările, cu glosarul); (2) fișa de review de produs (10 întrebări și cele 5 etape A–E, vezi `patterns.md`); (3) aprobarea deciziilor marcate. Abia apoi intră aici, în registrul deciziilor.

## Principii

1. **Culoarea are sens, nu decor.** Peach = acum / necesită atenția ta / ești aici. Lime = gata / confirmat. Navy = structură și acțiunea principală; ca suprafață, doar în zonele de brand ale Hub-ului (direcția B). Restul e neutru.
2. **Un singur sistem.** Nicio componentă nu există în două variante. Dacă o aplicație are nevoie de ceva nou, se adaugă aici, apoi se folosește peste tot.
3. **Totul din tokeni.** Culori, tipografie, spațiere, raze, borduri, umbre, dimensiuni, durate și z-index vin din `tokens.json`. Nimic hardcodat în aplicații.
4. **Ambele teme, din prima.** Fiecare token de culoare are valoare light și dark; fiecare ecran se verifică în amândouă.
5. **Calm.** Limitele, erorile și accesul lipsă se spun liniștit: ce s-a întâmplat, ce rămâne neatins, ce poți face.

## Ecosistemul și regulile de produs

- **Ce este.** Un Hub (autentificare, launcher, cont, echipă, abonament, suport, catalog) și 15 aplicații pe același shell. Portal și Network sunt în familie prin iconuri; doar interiorul lor are identitate proprie, proiectată separat. Founder Control Center e instrumentul intern al echipei Ventora.
- **Intrarea e doar prin invitație.** Echipa Ventora creează afacerea și trimite invitația proprietarului (Founder → Afacere nouă); proprietarul își invită echipa. Nu există „Creează cont” și nici „Adaugă afacere”.
- **Roluri:** proprietar, admin, membru. Doar proprietarul plătește și cumpără; schimbarea abonamentului e o cerere. Adminul gestionează echipa și accesul. Membrul lucrează în aplicațiile rolului lui.
- **Autentificare:** „Ține-mă minte” spune cât ține (30 de zile). La setarea parolei, „Arată parola” în loc de „Repetă parola”. Autentificarea în doi pași e obligatorie pentru proprietar, cu 14 zile de grație de la prima intrare și coduri de recuperare; codul se cere doar pe un dispozitiv nou.
- **După invitație:** un rol cu o singură aplicație intră direct în ea; un rol cu mai multe aplicații ajunge prima dată în launcher.
- **Launcher:** ordine fixă implicită, cu reordonare manuală per utilizator; iconurile nu se mută singure. Catalogul de aplicații se deschide din launcher, din paleta de comenzi și din meniul contului.
- **Echipă și acces:** invitațiile expirate dispar din listă, dar rămân în jurnalul de audit. „Vezi ca {rol}” arată ce vede un rol înainte să schimbi accesul. Starea unui om fără acces e „Acces oprit” (nu „Suspendat”).
- **Abonament și consum:** data estimată a atingerii unei limite apare doar când estimarea e de încredere (de la 50% consum și după primele 7 zile ale lunii). La limită: blocare controlată, nimic nu se pierde (vezi `patterns.md` → Limite de plan).
- **Suport:** „Solicitările mele”, „Solicitare nouă”, „Trimite”; promisiunea afișată e „Îți răspundem în cel mult o zi lucrătoare.” Sugestiile de articole de ajutor vin doar când există centrul de ajutor.
- **Temă:** Light, Dark sau „Automată” (urmează setarea dispozitivului), per utilizator.
- **Booking:**
  - „Azi” are pe telefon primul card „Următoarea programare”; lista se numește „Au nevoie de tine” și arată cel mult 5 lucruri.
  - Calendarul are „Primul loc liber”; vederea „Resurse” rămâne, explicată în setări ca „camere, echipamente sau spații pe care le rezervă clienții”.
  - Căutarea arată și rezultatele din afara perioadei filtrate, ca link separat.
  - Detaliul are „Programează din nou”. O programare nouă poate porni și de la client; ordinea implicită e serviciu → oră → client, cu „Oricine e liber”. Butonul este „Programează”.
  - Lângă reamintiri apare estimarea de SMS-uri. Mesajele către clienții afacerii sunt implicit la „dumneavoastră”, iar afacerea le poate schimba.
  - Textul de anulare depinde de setarea afacerii (fără taxă: „Clienții pot anula online cu cel puțin 24 de ore înainte.”; cu taxă: „Anulare gratuită cu cel puțin 24 de ore înainte. După aceea se reține {suma}.”). Clientul e anunțat automat pe canalul ales de afacere; dialogul pomenește mesajul doar dacă notificarea e pornită.
  - Integrarea Booking ↔ Inventory (consumabilele scad din stoc) e opțională și apare doar când afacerea are ambele aplicații.
- **Celelalte aplicații:** în CRM etapele le alege afacerea, pornind de la un set implicit. În HR întârzierea apare neutru: „Întârziere · 12 min”. În Finance reamintirile automate pentru facturi restante sunt configurabile și se opresc după plată. În Analytics diferențele de procent se scriu „+3 pp” pe ecran și „3 puncte procentuale” pentru cititorul de ecran și în tooltip.
- **Comercial (recomandări):**
  - Doar prin sloturi Growth, niciodată desenate fix în ecran, cu „Nu mă interesează” și plafoane.
  - Recomandările de cumpărare apar doar pentru proprietar și admin; membrul are „Recomandă aplicația” („Ajunge la {nume} (proprietar)”) și vede stările „În așteptare”, „Activată”, „Nu acum”. Primește notificare doar la activare, nu la refuz.
  - „Perioadă de probă” (nu „trial”) fără card și fără plată automată: la final aplicația se oprește, datele rămân, iar continuarea e o alegere explicită.
  - „Amintește-mi”: „Peste o săptămână” / „Peste o lună”.
- **Founder Control Center și Growth:** regulile complete sunt în `patterns.md` → Founder Control Center și Growth. Pe scurt:
  - Afacerile care cer atenție apar primele. Excepțiile au mereu termen (cel mult 12 luni).
  - Planurile au versiuni. Mutarea în dezavantajul clientului se anunță cu 30 de zile înainte; cea doar în avantajul lui se aplică imediat, cu anunț.
  - Ofertele apar doar în limbile cu text aprobat. Audiențele au cel puțin 5 afaceri.
  - Pragul de deranj de 5% oprește orice campanie și trimite o notificare către Founder.
  - Plafoanele implicite sunt 1 pe zi, 3 pe săptămână și 30 de zile după „Nu mă interesează”. Maximele permise sunt 2 pe zi, 5 pe săptămână și cel puțin 14 zile.
  - Atribuirea venitului se face la 7 zile de la click.
- **Măsurare:** aceleași evenimente în toate aplicațiile (vezi `patterns.md` → Măsurare comună). Instrumentul de analytics se alege separat.

## Conținut și ton

- **Persoana a doua, direct și calm, la diateza activă.** „Am mutat programarea pe joi, 14:30.” „Ai atins limita abonamentului. Nu se pierde nimic din ce ai.” Nu „Utilizatorul a…”, nu „Eroare!”.
- **Majusculă doar la început**, în titluri, butoane, etichete și meniuri: „Trimite reamintire”, „Setări notificări”. Niciodată Title Case, niciodată MAJUSCULE.
- **Butoanele încep cu un verb** și numesc rezultatul: „Confirmă”, „Trimite invitația”, „Anulează programarea”, „Păstrează programarea”. Niciodată „OK”, „Da/Nu”, „Click aici”.
- **Diacritice corecte, cu virgulă:** ș, ț, Ș, Ț (U+0219, U+021B), nu ş/ţ cu sedilă. Ghilimele românești: „…”.
- **Erorile spun ce să faci:** „Adresa nu pare completă. Verifică după @.” — nu „Câmp invalid”.
- **Stările goale** au un titlu, o propoziție și următorul pas: „Azi nu ai nicio programare.” + „Adaugă una sau deschide calendarul ca să vezi restul săptămânii.” + „Adaugă o programare”.
- **Un singur cuvânt pentru fiecare lucru**, din `glossary.md` (cardul Glosar), în toate cele 6 limbi: „abonament” (nu „plan”), „pachete în plus” (nu „add-on-uri”), „solicitare” (nu „tichet”), „resurse” (camere, echipamente sau spații). Orice ecran nou trece prin revizuirea de microcopy înainte să fie gata (vezi `patterns.md` → Scriere și microcopy).
- **Mesajele către clienții afacerii** (SMS, e-mail) sunt la „dumneavoastră”; interfața vorbește cu echipa la „tu”.
- **Fără emoji, nicăieri** (nici în notificări, nici în texte de marketing din aplicație).
- **Șase limbi:** RO, EN, FR, ES, DE, IT (Italiano). RO e limba de referință; textele în celelalte pot fi cu ~30% mai lungi. În germană, franceză și italiană folosim forma de politețe (Sie, vous, Lei), în spaniolă tú. Testează fiecare ecran și cu etichete în germană și italiană: etichetele trec pe două rânduri, nu se taie; butoanele și pill-urile se taie cu „…” doar ca ultimă soluție.
- **Numere, date, ore** prin `Intl`, în limba activă: 1.284 (RO/DE), 24.10.2026, 14:30, săptămâna începe luni. Sumele au unitatea: „120 lei”. Cifrele sunt mereu tabulare.

## Culoare

Interfața stă pe neutri; culorile de brand apar rar și au un singur sens.

| Rol | Tokeni | Când |
| --- | --- | --- |
| Suprafețe | `canvas` → `sheet` → `raised`, `sunken`, `selected` | `canvas` e fundalul aplicației și al Spine; `sheet` e foaia de lucru; `raised` pentru meniuri, dialoguri, drawere; `sunken` pentru antet de tabel, câmpuri read-only; `selected` pentru rânduri și elemente selectate. |
| Text | `ink`, `ink-secondary`, `ink-muted`, `ink-disabled` | `ink` pentru titluri și valori, `ink-secondary` pentru celule și descrieri, `ink-muted` pentru meta, helper, placeholder. Toate trei ≥4.5:1 pe orice suprafață, în ambele teme. |
| Linii | `line`, `line-strong`, `control-border`, `control-border-hover` | `line` doar decorativ (separatoare, marginea Sheet); `control-border` delimitează controalele și are ≥3:1. |
| Zonă de brand — doar în Hub | `brand-surface`, `brand-raised`, `on-brand`, `on-brand-muted`, `brand-line`, `brand-line-strong`, `brand-control-border` | Antetul și banda launcher-ului, panoul de autentificare, prin componenta `BrandZone`. Navy #000C3F în light, negru rece #1B1D23 în dark. Textul e `on-brand` (16,25:1 / 14,66:1), secundarul `on-brand-muted` (9,69:1 / 7,01:1), bordura controalelor `brand-control-border` (4,13:1 / 4,10:1). Niciodată în aplicații, setări, dialoguri sau carduri. |
| Navy — structură și acțiunea principală | `primary`, `primary-hover`, `primary-pressed`, `on-primary`, `brand-navy` | În light: text, butonul principal (unul pe ecran), bife, toggle pornit, zi selectată. În dark, `primary` devine off-white cald cu text închis; navy-ul nu mai e suprafață și apare doar pe plăcuțele iconurilor de aplicații. |
| Peach — acum / atenția ta / ești aici | `attention`, `on-attention`, `attention-soft`, `attention-ink`, `attention-mark` | Bara „ești aici” din Spine și bottom nav, ziua de azi și linia „acum” din calendar, programarea în desfășurare, contoare necitite, avertizarea de limită, linia de sub fișa din AppDock la hover (`hover-accent`, niciodată în repaus). `attention` e umplere cu text `on-attention`; `attention-ink` e text; `attention-mark` e linie fină (≥3:1). |
| Lime — gata / confirmat | `done`, `on-done`, `done-soft`, `done-ink`, `done-mark` | „Confirmată”, „Plătită”, progres terminat. Aceleași reguli de umplere / text / linie. |
| Eroare și acțiuni distructive | `danger`, `danger-hover`, `on-danger`, `danger-soft`, `danger-ink` | Erori de câmp, „Epuizat”, „Absență”, butonul distructiv din dialogul de confirmare. Nu e culoare de brand; nu se folosește pentru avertizări (acelea sunt peach). |
| Neutru pentru stări | `neutral-soft` | Pill-uri „Ciornă”, „Anulată”, cele patru stări de acces. |
| Grafice | `chart-1` … `chart-5`, `chart-compare`, `chart-now`, `chart-grid`, `chart-axis`, `chart-label`, `chart-seq-1` … `chart-seq-5` | Serii categoriale în ordine fixă (validate pentru daltonism și ≥3:1 pe `sheet` și `canvas`, în ambele teme); comparația mereu gri; perioada în curs peach; rampa secvențială navy pentru intensitate. Peach și lime nu sunt culori de serie. Vezi `patterns.md` → Date vizuale. |
| Focus | `focus-ring` | Inel solid de `focus-ring-width` (2px) la `focus-ring-offset` (2px), navy în light, off-white cald în dark, ≥3:1 pe orice suprafață. |
| Interacțiune | `state-hover`, `state-pressed`, `scrim` | Suprapuneri transparente peste orice suprafață interactivă; `scrim` în spatele dialogurilor. |

**Nu face:** peach sau lime ca decor, fundaluri de secțiune sau accente „ca să fie mai vesel”; text peach (`attention`) pe alb — folosește `attention-ink`; verde/roșu doar prin nuanță — orice stare are și cuvânt sau icon; gradienturi; carduri cu bordură colorată pe stânga; ilustrații decorative; „AI sparkles”.

**Tema luminoasă** stă pe off-white (`canvas` #F2F3F0, din direcția B; înainte #EFF0EE), cu foaia de lucru albă (`sheet` #FFFFFF) delimitată de o linie fină (`line` #E4E5E2): structură prin linii, nu prin carduri și umbre. Textul e navy (`ink` #000C3F), secundarul și metadatele în gri-navy discret (`ink-secondary` #3D4566, `ink-muted` #5E6680). Hover și selecție sunt nuanțe neutre.

**Tema întunecată** e neutră, aproape neagră, fără tentă albastră: `canvas` #0E0F11, `sheet` #16171A, `raised` #1E2024 (meniuri, dialoguri, drawere), `sunken` #121315, linii #2A2C30. Textul principal e un off-white cald (`ink` #F1EFEA), secundarul și metadatele gri neutru (#C6C4BF, #9C9A95). Hover și selectat sunt gri neutru (`state-hover`, `selected` #2A2C31). Navy-ul nu e niciodată suprafață în dark: rămâne doar pe plăcuțele iconurilor de aplicații (`appicon-plate`). Zonele de brand ale Hub-ului devin în dark un negru rece (`brand-surface` #1B1D23), nu navy. Butonul principal devine off-white cu text închis. Peach și lime își păstrează umplerile; textele lor (`attention-ink`, `done-ink`) se deschid ca să rămână lizibile.

## Tipografie

- **Syne** doar pentru momente de brand: `display-xl` (56/58, afirmația din panoul de autentificare, onboarding), `display-hub` (40/46, doar în Hub: salutul din launcher și titlul autentificării; 32/36 pe telefon), `display-l` (30/36, salutul din „Azi” în aplicații), `display-m` (titluri de secțiune din Hub, stări goale mari). Niciodată în tabele, formulare sau navigație. `display-xl` și `display-hub` vin din direcția B (înainte afirmația avea 40/44, iar salutul din launcher 30/36).
- **DM Sans** pentru tot restul, pe bază densă de 14px: `title` (20/28, titlul paginii, al dialogului și al drawerului), `heading` (16/24, secțiuni în Sheet), `subheading` (14/20 semibold, antete de coloană, grupuri), `body` (14/20), `body-strong` (14/20 medium, numele rândului, etichetele butoanelor), `body-small` (13/18, meta), `caption` (12/16 medium, etichete de câmp, helper, pill-uri), `numeric` (28/32, KPI-uri). Doar pe banda launcher-ului: `eyebrow` (12/16 semibold, majuscule, +0,08em: data și afacerea deasupra salutului) și `lead` (18/34, fraza zilei; 15/30 pe telefon).
- **Cifre tabulare** peste tot (`font-variant-numeric: tabular-nums` e pus pe `body`); coloanele numerice se aliniază la dreapta.
- Fonturile sunt fișierele variabile din `fonts/` (DM Sans normal și italic, Syne), cu ș și ț corecte.

## Spațiu, forme, adâncime

- **Spațiere pe 4px:** `space-1` (4) … `space-16` (64). Controale: padding orizontal `space-3`; câmp la câmp `space-4`; padding Sheet `space-6` pe desktop, `space-4` pe mobil; între secțiuni `space-8`.
- **Raze:** `radius-xs` (4) bife, Kbd · `radius-sm` (6) butoane, câmpuri · `radius-md` (8) meniuri, toasturi, tabele · `radius-lg` (12) Sheet, Dialog, Drawer · `radius-xl` (18, din direcția B) AppTile, foaia și fișele din AppDock, cardul Portal, plăcuțele aplicațiilor · `radius-full` pill-uri, avatare, toggle.
- **Borduri:** `border-width` (1px) pentru linii fine și câmpuri, `border-width-control` (1.5px) pentru bife, radio, toggle, `marker-width` (3px) pentru marcajele de locație.
- **Umbre doar pentru ce plutește:** `shadow-1` (tile la hover), `shadow-2` (meniuri, popovere, toasturi și foaia AppDock ridicată peste banda de brand), `shadow-tile-hover` (fișa deschisă din AppDock), `shadow-3` (dialog, drawer, paletă de comenzi). Sheet-ul se separă de `canvas` printr-o linie, nu printr-o umbră.
- **Dimensiuni:** controale `control-sm` 28 / `control-md` 36 / `control-lg` 44; pe mobil și pe ecrane tactile orice țintă are minimum `touch-target` (44px). Rânduri de tabel `row-height` 44 / `row-height-dense` 36. Spine `spine-width` 232 / `spine-width-collapsed` 64, ContextBar `contextbar-height` 56, bottom nav `bottomnav-height` 64, Drawer `drawer-width` 480.
- **Puncte de rupere** (tokenii `breakpoint-*`): telefon 360–767px, tabletă portret 768–1023px (`breakpoint-tablet`), tabletă peisaj și laptop mic 1024–1279px (`breakpoint-laptop`), desktop 1280–1919px (`breakpoint-desktop`), ecrane late de la 1920px (`breakpoint-wide`), unde conținutul se oprește la `content-max-width` (1440px). Detaliile sunt în secțiunea Responsive de mai jos.
- **Mișcare:** `duration-instant` 80ms (hover), `duration-intent` 120ms (cât stă cursorul pe un icon din AppDock până se deschide fișa), `duration-fast` 140ms (meniuri, toggle), `duration-base` 220ms (drawer, dialog, toast), `duration-slow` 360ms (intrarea iconurilor în AppDock), `duration-launch` 420ms (aplicația crește din card; deschiderea durează ~850ms), cu `ease-standard`. Doar în Hub: `duration-playful` 280ms și `duration-morph` 340ms pe `ease-spring` (un mic rebound: fișa din AppDock, iconul care crește la apăsare); niciodată în aplicații. La `prefers-reduced-motion` totul devine instant.
- **Straturi:** `z-sticky` < `z-shell` < `z-overlay` < `z-popover` < `z-toast`.

## Iconografie

- **Lucide** (release 0.460.0), inline în bundle prin `Icon`, contur `1.75`: 16px în controale, 20px în navigație, 24px mare. Iconurile sunt `aria-hidden`, cu excepția celor care poartă singure un sens (atunci primesc `label`).
- **Fără emoji**, fără alte seturi de iconuri, fără ilustrații.
- **Iconurile aplicațiilor** sunt o familie proprie de 15 pictograme (`AppIcon`), în ecou cu semnul: plăcuță navy, forme off-white pline și geometrice, o singură parte peach care arată ce face aplicația. Sunt desenate pe aceeași grilă de 48 de unități (colțuri r12, pătrat-cheie 10–38, cerc-cheie r15, goluri de 2–2,5 u). Culorile vin din tokenii `appicon-*`: în dark plăcuța rămâne navy (singurul loc unde navy-ul apare în dark), puțin ridicat și cu o linie fină, iar varianta inactivă (`muted`) e gri, cu partea peach stinsă, ca o aplicație fără acces să nu semnaleze nimic. Nu le folosi sub 16px, nu le recolora și nu înlocui iconul unei aplicații cu un icon Lucide.
- **Favicon:** fiecare aplicație folosește `assets/App icons/<app>.svg`; Hub-ul folosește semnul Ventora.

## Logo

Fișierele oficiale sunt în `assets/Logos/` și se folosesc exact cum sunt: nu le redesena, nu le recolora, nu le pune pe o plăcuță colorată.

| Fișier | Ce este | Unde |
|---|---|---|
| `ventora-logo.svg` | Logo complet: semnul + wordmark-ul „VENTORA” (V peach, restul navy) | Fundaluri deschise |
| `ventora-logo-dark.svg` | Logo complet, varianta B: romb mai luminos (#3A4680), contururi și wordmark off-white | Fundaluri închise |
| `ventora-mark.svg` | Doar semnul | Fundaluri deschise, favicon |
| `ventora-mark-dark.svg` | Doar semnul, varianta B | Fundaluri închise |
| `favicon.svg` | Semnul; trece singur pe varianta B când sistemul e în dark | Favicon-ul Hub-ului |

- **Wordmark-ul face parte din fișier.** Logo-ul complet se folosește întreg, cu „VENTORA” din fișier. Nu scrie „Ventora” în Syne (sau în alt font) lângă semn în locul lui.
- **Pe zona de brand** (`BrandZone`: antetul și banda launcher-ului, panoul de autentificare) logo-ul folosește varianta B, ca pe orice fundal închis. E singura excepție de la „nu pe o plăcuță colorată” (V3).
- **Dark = varianta B**, peste tot. Componenta `Logo` arată singură varianta potrivită după cel mai apropiat `data-theme`, deci și într-un panou închis dintr-o pagină deschisă.
- Componenta `Logo`: `variant="full"` (logo complet) sau `"mark"` (doar semnul); `size` = înălțimea semnului în px; logo-ul complet păstrează proporțiile fișierului (250 × 68).
- Minim 16px pentru semn și 21px înălțimea semnului pentru logo complet. Spațiu liber de jumătate din înălțimea semnului pe toate laturile.
- Logo-ul complet apare pe ecranele Hub (autentificare, launcher, Spine-ul Hub-ului desfășurat), pe copertă și în marketing. Semnul singur apare în favicon și în Spine-ul Hub-ului strâns. În interiorul unei aplicații, Spine arată aplicația, nu logo-ul Ventora; în Founder Control Center, semnul stă lângă numele „Founder”.

## Responsive

Totul funcționează în browser de la 360px până la ecrane late, fără scroll orizontal al paginii.

| Lățime | Navigație | Conținut | Straturi |
| --- | --- | --- | --- |
| Telefon 360–767px | Bottom nav (patru destinații + „Mai multe”), ContextBar cu numele aplicației, „Creează” rotund | O coloană, Sheet de la margine la margine, tabelele devin liste, butoanele din formulare pe toată lățimea | Drawer pe tot ecranul cu săgeată înapoi, Dialog ca bottom sheet |
| Tabletă portret 768–1023px | Spine ca bară de iconuri (64px), căutarea ca icon, OrgSwitcher vizibil | Două coloane doar pentru câmpuri scurte, grile de 3 tile-uri, ecranele cu două panouri se așază unul sub altul | Drawer lateral de `drawer-width-tablet` (560px), lista rămâne vizibilă |
| Laptop 1024–1279px | Spine extins, căutare completă | Grile de 3–4 coloane | Drawer `drawer-width` (480px) |
| Desktop 1280–1919px | Layoutul de referință | Ecrane cu două panouri (listă + formular), grile de 4 | La fel |
| Late 1920px+ | La fel | Nimic nu crește peste `content-max-width` (1440px); canvas-ul ia spațiul în plus | La fel |

- **Ținte de atingere ≥44px** (`touch-target`) pe orice ecran tactil (`pointer: coarse`) și sub 768px: butoane, câmpuri, opțiuni, elemente de meniu, taburi, zile din calendar, bife (zonă de atingere de 44px în jurul cutiei de 16px).
- **Nicio acțiune doar la hover.** Acțiunile pe rând stau în kebab, mereu vizibil; butonul de restrângere al Spine e mereu vizibil; săgeata din AppTile e decorativă (tot tile-ul e butonul) și apare permanent pe ecranele tactile.
- **Shell-ul și tabelul reacționează la propria lățime** (container queries), așa că funcționează la fel într-un Drawer sau într-un panou îngust. Straturile (Drawer, Dialog, Toast) reacționează la lățimea ecranului.
- **Fără scroll orizontal al paginii.** Singurele zone care se pot derula orizontal sunt un tabel lat (în cadrul lui) și lista de taburi.

## Accesibilitate

- Contrast verificat în ambele teme: text ≥4.5:1, borduri de control, iconuri și inelul de focus ≥3:1 (valorile sunt în notele fiecărui token).
- Fiecare control are stările: default, hover, focus-visible, pressed, disabled, error, loading. Starea de eroare are mereu și text, nu doar culoare.
- Tastatura merge peste tot: Tab ordonat, săgeți în liste, meniuri, taburi, calendar; Esc închide și întoarce focusul; dialogurile și drawerele țin focusul înăuntru.
- Ținte de atingere ≥44px pe mobil și pe ecrane tactile.

## Cum folosești sistemul

- Încarcă, în ordine: `tokens.css` (generat din `tokens.json`), fonturile din `fonts/`, `components/bundle.css`, React 18 și ReactDOM 18, apoi `components/bundle.js`, care expune `window.Ventora`.
- Învelește fiecare aplicație o singură dată în `VentoraProvider locale="ro"`: limbă, temă (Light/Dark/System pe `data-theme` din `<html>`) și toasturi.
- Fiecare ecran de aplicație = `AppShell` cu `Spine` + `ContextBar`, iar în conținut `PageHeader` și `Sheet` / `DataTable`. Regulile de compunere sunt în secțiunea Patterns.
- Textele interne ale componentelor (paginare, calendar, „Anulează”, stări de acces, limite, plăți) vin deja traduse în cele șase limbi; textele tale le pui prin sistemul de traduceri al aplicației.

## Registrul deciziilor

Toate deciziile aprobate, pe scurt. Detaliile sunt aplicate în ecrane, componente, glosar și `patterns.md`.

**Scriere și microcopy (D1–D14, Hub și Booking)**

| # | Decizie |
| --- | --- |
| D1 | Doar „abonament”, niciodată „plan”, în tot ce văd afacerile: „limita abonamentului”, „Abonamentul tău: Business”, „Cere alt abonament”. Excepție: în Founder Control Center, instrumentul intern, „plan” numește nivelul de abonament și versiunile lui (Planuri, Plan nou). |
| D2 | „Pachete în plus”, același termen peste tot. |
| D3 | „Anulează” = undo doar în toast-uri; anularea unei programări e mereu „Anulează programarea”; în dialogurile distructive, butonul sigur spune ce păstrează. |
| D4 | „Au nevoie de tine” în loc de „Necesită atenția ta”. |
| D5 | „Resurse” rămâne, cu explicația „camere, echipamente sau spații pe care le rezervă clienții” în setări. |
| D6 | „Solicitările mele”, „Solicitare nouă”, „Trimite” (nu „tichet”). |
| D7 | „Îți răspundem în cel mult o zi lucrătoare.” |
| D8 | Mesajele către clienții afacerii, implicit la „dumneavoastră”; afacerea le poate schimba. |
| D9 | Textul de anulare depinde de setarea afacerii; dialogul pomenește mesajul către client doar dacă notificarea e pornită. |
| D10 | Codul de autentificare se cere doar pe un dispozitiv nou. |
| D11 | Tema „Automată”, cu explicația „urmează setarea dispozitivului”. |
| D12 | „Acces oprit” în loc de „Suspendat”. |
| D13 | „Programează”, pe telefon „Programează · 13:15”. |
| D14 | Spaniolă: „negocio”, nu „empresa”. |

**Etapa 4 (E1–E5) și comercial (C1–C6)**

| # | Decizie |
| --- | --- |
| E1 | Etapele CRM le alege afacerea, cu un set implicit. |
| E2 | HR: „Întârziere · 12 min”, ton neutru. |
| E3 | Integrare Booking ↔ Inventory opțională, vizibilă doar cu ambele aplicații. |
| E4 | Reamintiri automate pentru facturile restante, configurabile, se opresc după plată. |
| E5 | „+3 pp” pe ecran; „3 puncte procentuale” pentru cititorul de ecran și în tooltip. |
| C1 | „Perioadă de probă”, nu „trial”. |
| C2 | Membrul are „Recomandă aplicația”, cu „Ajunge la {nume} (proprietar)”. |
| C3 | Probă fără card și fără plată automată; la final aplicația se oprește, datele rămân, continuarea e o alegere explicită. |
| C4 | „Peste o săptămână” / „Peste o lună”. |
| C5 | Fără notificare la refuz; membrul vede „În așteptare” / „Activată” / „Nu acum”; notificare doar la activare. |
| C6 | Catalogul se deschide din launcher, din paleta de comenzi și din meniul contului. |
| — | Recomandarea pentru Marketing din launcher e un slot comercial, doar pentru proprietar și admin, cu „Nu mă interesează” și plafoane. |

**Review de produs (P1–P27)**

| # | Decizie |
| --- | --- |
| P1 | „Ține-mă minte” arată durata: 30 de zile. |
| P2 | „Arată parola” în loc de „Repetă parola”. |
| P3 | Un rol cu o singură aplicație intră direct în ea; un rol cu mai multe ajunge prima dată în launcher. |
| P4 | Ordinea aplicațiilor: fixă implicit, cu reordonare manuală per utilizator. |
| P5 | Autentificare în doi pași obligatorie pentru proprietar, 14 zile de grație de la prima intrare, coduri de recuperare. |
| P6 | Invitațiile expirate dispar din listă și rămân în jurnalul de audit. |
| P7 | „Vezi ca {rol}”. |
| P8 | Data estimată a limitei, doar când estimarea e de încredere. |
| P9 | Nu acum: sugestiile de articole de ajutor așteaptă centrul de ajutor. |
| P10 | Cardul „Următoarea programare” pe telefon. |
| P11 | „Primul loc liber” în calendar. |
| P12 | Căutarea arată rezultatele din afara perioadei filtrate, ca link separat. |
| P13 | „Programează din nou” în detaliul programării. |
| P14 | O programare poate porni și de la client; ordinea implicită serviciu → oră → client; „Oricine e liber”. |
| P15 | Estimarea de SMS-uri lângă reamintiri. |
| P16 | Lista de afaceri arată întâi ce cere atenție. |
| P17 | Nicio excepție fără termen (cel mult 12 luni, prelungibile). |
| P18 | Avertisment (nu blocare) la CUI sau e-mail de proprietar deja folosit. |
| P19 | Mutarea pe altă versiune: anunț cu 30 de zile înainte când e în dezavantajul clientului (preț mai mare sau mai puțin inclus); imediat, cu anunț, când e doar în avantajul lui. |
| P20 | O ofertă apare doar în limbile cu text aprobat, fără rezervă pe altă limbă. |
| P21 | Membrii pot fi audiență doar pentru „Recomandă aplicația”. |
| P22 | Pragul de oprire automată (5%) se aplică și campaniilor programate; oprirea trimite o notificare către Founder. |
| P23 | O audiență are cel puțin 5 afaceri. |
| P24 | Venitul atribuit: conversii în 7 zile de la click. |
| P25 | Plafoane implicite 1 pe zi, 3 pe săptămână, 30 de zile; maxime permise 2, 5 și minimum 14 zile. |
| P26 | În Founder, Spine arată semnul Ventora lângă „Founder”. |
| P27 | Favicon-ul Hub-ului trece singur pe varianta B în dark. |

**Brand:** logo-ul oficial SVG, folosit exact cum e; dark = varianta B; wordmark-ul „VENTORA” din fișier, nu text în Syne.

**Ridicarea vizuală, direcția B „Navy de comandă” (V1–V18, 25 octombrie 2026)**

| # | Decizie |
| --- | --- |
| V1 | Hub-ul primește zone de brand: antetul și banda launcher-ului (salutul, fraza zilei, „Aplicațiile tale”) și panoul de autentificare. Navy în light, negru rece în dark. Structura ecranelor, funcțiile și textele aprobate nu se schimbă. |
| V2 | Navy e suprafață doar în zonele de brand ale Hub-ului (`BrandZone`). Niciodată în aplicații, în setările Hub-ului, în dialoguri sau carduri. |
| V3 | Pe zona de brand logo-ul folosește varianta B. |
| V4 | „Aplicațiile tale” e un rând de iconuri de 64px (`AppDock`) pe o foaie ridicată peste marginea benzii. La hover sau la focus, iconul se deschide deasupra rândului în fișa aplicației: icon de 48px, nume, descriere și linia de azi. Pe telefon, grilă de iconuri de 56px, fără fișă. |
| V5 | Linia piersică de sub fișă înseamnă „ești aici”: apare doar la hover și focus, niciodată în repaus. |
| V6 | Portal are cardul lui sub aplicații (`PortalPresence`), nu e un icon în rând. „Gestionează pagina” deschide gestionarea prezenței în platforma de business, în același tab; „Vezi cum arată în Portal” deschide pagina publică într-un tab nou. Proprietarul, adminul și managerul aplicației Portal gestionează; membrii doar văd; colaboratorii externi nu văd cardul. |
| V7 | Deschiderea unei aplicații (`AppLaunch` v2): iconul crește la 112%, aplicația crește din cardul apăsat, iconul trece prin centru și se așază în bara aplicației (~850ms). Ecranul de până acum (icon și nume în centru) rămâne starea de încărcare. |
| V8 | Mișcarea cu rebound (`ease-spring`) există doar în Hub. |
| V9 | „Alte aplicații Ventora”: rânduri compacte, numele în față (16/24 semibold, lângă starea de acces), explicațiile la 14/20 în `ink-secondary`. |
| V10 | Textele noi: „Duminică, 25 octombrie · Salon Aurora” deasupra salutului; „Afacerea ta. Într-un singur loc.” și „© 2026 Ventora Systems” în panoul de autentificare (subsolul păstrează „Termeni · Confidențialitate · Ajutor”); textele cardului Portal; liniile de azi din fișele aplicațiilor („Următoarea: 09:30 · Ana Popescu”, „1 cerere de aprobat”…), toate cu plural ICU. |
| V11 | Tokeni schimbați: `canvas` light #F2F3F0, `radius-xl` 18px, `shadow-2` mai adâncă, `display-xl` 56/58. Roluri noi: `brand-surface`, `brand-raised`, `on-brand`, `on-brand-muted`, `brand-line`, `brand-line-strong`, `brand-control-border`, `hover-accent`, `shadow-tile-hover`, `dock-icon`, `dock-icon-compact`, `dock-icon-phone`, `dock-card-w`, `duration-intent`, `duration-playful`, `duration-morph`, `duration-launch`, `ease-spring`, stilurile `display-hub`, `lead` și `eyebrow`. |
| V12 (R-B1) | În AppDock, un click deschide doar aplicația de sub cursor: partea fișei care trece peste vecini nu e clicabilă, iar mutarea mouse-ului pe vecin îl deschide pe el. |
| V13 (R-B2) | Fișa din AppDock se deschide după 120ms de oprire a cursorului (`duration-intent`) și se închide imediat. |
| V14 (R-B3) | Cardul Portal: „Clienții te găsesc în Portal și își fac programări acolo. De aici schimbi ce văd ei.” |
| V15 (R-B4) | Pentru membri: „Pagina o pot schimba proprietarul, adminii și managerul aplicației Portal.” |
| V16 (R-B5) | Linia de azi din Documents: „Ultimul deschis: {document} · {când}”. |
| V17 (R-B6) | Acceptarea invitației (HubInvite) folosește panoul de brand al autentificării. |
| V18 (R-B7) | În aplicații salutul din „Azi” rămâne `display-l` 30/36; mărimea nouă e `display-hub` 40/46, doar în launcher și la autentificare. |

## Ce nu e încă aici

- Interiorul aplicațiilor Portal și Network (identitate proprie, proiectată separat).
- Centrul de ajutor (de el depinde P9).
- Instrumentul de analytics (lista de evenimente e aprobată; instrumentul se alege separat).

## Inventar

- **Acțiuni:** Button, IconButton
- **Formulare:** FormField, Input, Textarea, Select, Combobox, Checkbox, Radio / RadioGroup, Toggle, SegmentedControl, DatePicker, FileUpload
- **Navigație:** Tabs, Pagination, Menu, CommandPalette
- **Date și timp:** DataTable, Schedule (calendar zi / săptămână / resurse), Agenda, SlotPicker, Kanban (+ KanbanCard), Timeline
- **Grafice și cifre:** Stat, LineChart, BarChart
- **Stare și feedback:** StatusPill, StatusDot, Badge, Avatar / AvatarGroup, Notice, AttentionList, EmptyState, Skeleton, ProgressBar, UsageMeter, Kbd, Toast
- **Straturi:** Tooltip, Dialog, Drawer
- **Preferințe:** ThemeSwitcher, LanguageSwitcher
- **Shell:** AppShell, Spine (cu bottom nav pe mobil), ContextBar, PageHeader, Sheet / SheetSection
- **Hub:** Logo, BrandZone (zona de brand, doar în Hub), AppIcon (+ grila de construcție și exemple în context), AppTile (tile, icon, rând), AppDock (rândul de aplicații din launcher, cu fișa la hover), PortalPresence (pagina afacerii în Portal), AppLaunch (deschiderea unei aplicații, v2), AddonPurchase (cumpărarea pachetelor în plus cu cardul, PaymentCard, StripeSlot), AccessBadge, OrgSwitcher, NotificationsPanel, AccountMenu
- **Ecrane Hub** (pagini, fiecare în telefon, tabletă și desktop, light și dark): HubSignIn, HubInvite, HubChooseBusiness, HubLauncher, HubEmpty, HubAccount, HubAdminTeam, HubAdminAccess, HubAdminPlan, HubAddonPurchase, HubSupport, HubStates (stările care completează ecranele)
- **Ecrane Booking:** BookingToday, BookingCalendar, BookingList, BookingDetail, BookingNew, BookingSettings, BookingLimit, BookingStates
- **Comercial** (recomandări discrete, grup separat): RecommendationLabel, GrowthSlot, RecommendationCard, UpgradeDialog, DiscoveryTooltip, HubRecommendation, CatalogRecommendation, CommercialPreferences, HubCatalog, HubCatalogApp, RuleBuilder, CommercialStates
- **Founder Control Center + Growth** (instrumentul intern al echipei Ventora): FounderBusinesses, FounderBusiness, FounderNewBusiness, FounderPlans, FounderPlanEditor, FounderPacks, FounderUsage, GrowthOffers, GrowthOfferEditor, GrowthCampaigns, GrowthCampaignEditor, GrowthAudiences, GrowthResults, GrowthControl, FounderStates
- **Ecrane aplicații** (câte un ecran reprezentativ pe același shell): CrmPipeline, HrAttendance, InventoryStock, ProjectsBoard, ProjectsTimeline, FinanceDue, AnalyticsDashboard, AppStates
- **Fundații:** Glosar (termenii în 6 limbi și regulile de scriere), Italiano, Icon, VentoraProvider, useTheme, useToast, useHotkey
