Ventora e un singur produs, chiar dacă are un Hub și 15 aplicații (EasyBook, ClientDesk, DocSpace, ContractDesk, EventSpace, TeamSpace, StockDesk, ShiftPlan, CampaignKit, DataView, AssetDesk, TaskBoard, MoneyDesk, Portal, Network): aceleași componente, aceeași navigație, aceleași reguli, în română, engleză, franceză, spaniolă, germană și italiană, în temă luminoasă și întunecată. Portal și Network fac parte din familie prin iconițe: apar în launcher, pe tile-uri, în favicon și în notificări exact ca celelalte. Doar interiorul lor are identitate vizuală proprie, proiectată separat; ecranele lor nu folosesc shell-ul și componentele de aici. Premium prin precizie, nu prin decor: ierarhie din tipografie, spațiu și linii fine, interfață ~90% neutră, culoare doar acolo unde înseamnă ceva.

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
| `i18n/two-factor.json` | Cheile de traducere pentru autentificarea în doi pași (Hub și Founder), în cele 6 limbi |
| `i18n/support-session.json` | Cheile pentru sesiunea de suport în Hub (`support.session.banner.*`, aprobate, și `support.sessions.*`), în cele 6 limbi |
| `i18n/founder-support.json` | Cheile Founder pentru sesiunea de suport (`founder.support.*`) și recuperarea accesului proprietarului (`founder.recovery.*`), doar în română |
| `i18n/account-security.json` | Cheile pentru Contul tău · Securitate în Hub (`account.security.*`: „Schimbă parola”, autentificarea în doi pași pentru membri), în cele 6 limbi |
| `i18n/founder-auth.json` | Cheile pentru intrarea în Founder (`founder.signIn.*`), doar în română |
| `i18n/password-reset.json` | Cheile de traducere pentru parola nouă din „Ai uitat parola?” (Hub și Founder) și pentru e-mailul „Parola contului tău a fost schimbată”, în cele 6 limbi |
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
- **Autentificare:** pagina e componenta AuthLayout. „Ține-mă minte” spune cât ține (30 de zile) și păstrează doar sesiunea. La setarea parolei, „Arată parola” în loc de „Repetă parola”. Autentificarea în doi pași e obligatorie pentru proprietar, activată la prima intrare după ce devine proprietar, fără grație și fără „Sari peste”; în Founder e obligatorie pentru toți. Codul din aplicația de autentificare se cere la fiecare intrare cu parola. 10 coduri de rezervă, văzute o singură dată. Blocare 15 minute după 5 coduri greșite. Fără resetare automată: accesul se recuperează prin e-mail, după confirmarea identității (S58–S63). „Ai uitat parola?” trimite un link valabil o oră, care merge o singură dată; răspunsul e același și pentru o adresă fără cont. După parola nouă se închid toate sesiunile, inclusiv cele cu „Ține-mă minte”, iar autentificarea în doi pași rămâne (S72–S79). La orice schimbare de parolă pleacă un e-mail de securitate, care nu se poate opri (S82, S83).
- **După invitație:** un rol cu o singură aplicație intră direct în ea; un rol cu mai multe aplicații ajunge prima dată în launcher.
- **Launcher:** ordine fixă implicită, cu reordonare manuală per utilizator; iconurile nu se mută singure. Catalogul de aplicații se deschide din launcher, din paleta de comenzi și din meniul contului.
- **Echipă și acces:** invitațiile expirate dispar din listă, dar rămân în jurnalul de audit. „Vezi ca {rol}” arată ce vede un rol înainte să schimbi accesul. Starea unui om fără acces e „Acces oprit” (nu „Suspendat”).
- **Abonament și consum:** data estimată a atingerii unei limite apare doar când estimarea e de încredere (de la 50% consum și după primele 7 zile ale lunii). La limită: blocare controlată, nimic nu se pierde (vezi `patterns.md` → Limite de plan).
- **Suport:** „Solicitările mele”, „Solicitare nouă”, „Trimite”; promisiunea afișată e „Îți răspundem în cel mult o zi lucrătoare.” Sugestiile de articole de ajutor vin doar când există centrul de ajutor.
- **Temă:** Light, Dark sau „Automată” (urmează setarea dispozitivului), per utilizator.
- **EasyBook:**
  - „Azi” are pe telefon primul card „Următoarea programare”; lista se numește „Au nevoie de tine” și arată cel mult 5 lucruri.
  - Calendarul are „Primul loc liber”; vederea „Resurse” rămâne, explicată în setări ca „camere, echipamente sau spații pe care le rezervă clienții”.
  - Căutarea arată și rezultatele din afara perioadei filtrate, ca link separat.
  - Detaliul are „Programează din nou”. O programare nouă poate porni și de la client; ordinea implicită e serviciu → oră → client, cu „Oricine e liber”. Butonul este „Programează”.
  - Lângă reamintiri apare estimarea de SMS-uri. Mesajele către clienții afacerii sunt implicit la „dumneavoastră”, iar afacerea le poate schimba.
  - Textul de anulare depinde de setarea afacerii (fără taxă: „Clienții pot anula online cu cel puțin 24 de ore înainte.”; cu taxă: „Anulare gratuită cu cel puțin 24 de ore înainte. După aceea se reține {suma}.”). Clientul e anunțat automat pe canalul ales de afacere; dialogul pomenește mesajul doar dacă notificarea e pornită.
  - Integrarea EasyBook ↔ StockDesk (consumabilele scad din stoc) e opțională și apare doar când afacerea are ambele aplicații.
- **Celelalte aplicații:** în ClientDesk etapele le alege afacerea, pornind de la un set implicit. În TeamSpace întârzierea apare neutru: „Întârziere · 12 min”. În MoneyDesk reamintirile automate pentru facturi restante sunt configurabile și se opresc după plată. În DataView diferențele de procent se scriu „+3 pp” pe ecran și „3 puncte procentuale” pentru cititorul de ecran și în tooltip.
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

**Scriere și microcopy (D1–D14, Hub și EasyBook)**

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
| D10 | ~~Codul de autentificare se cere doar pe un dispozitiv nou.~~ Înlocuit de S59 (28 oct. 2026): codul se cere la fiecare intrare cu parola. |
| D11 | Tema „Automată”, cu explicația „urmează setarea dispozitivului”. |
| D12 | „Acces oprit” în loc de „Suspendat”. |
| D13 | „Programează”, pe telefon „Programează · 13:15”. |
| D14 | Spaniolă: „negocio”, nu „empresa”. |

**Etapa 4 (E1–E5) și comercial (C1–C6)**

| # | Decizie |
| --- | --- |
| E1 | Etapele ClientDesk le alege afacerea, cu un set implicit. |
| E2 | TeamSpace: „Întârziere · 12 min”, ton neutru. |
| E3 | Integrare EasyBook ↔ StockDesk opțională, vizibilă doar cu ambele aplicații. |
| E4 | Reamintiri automate pentru facturile restante, configurabile, se opresc după plată. |
| E5 | „+3 pp” pe ecran; „3 puncte procentuale” pentru cititorul de ecran și în tooltip. |
| C1 | „Perioadă de probă”, nu „trial”. |
| C2 | Membrul are „Recomandă aplicația”, cu „Ajunge la {nume} (proprietar)”. |
| C3 | Probă fără card și fără plată automată; la final aplicația se oprește, datele rămân, continuarea e o alegere explicită. |
| C4 | „Peste o săptămână” / „Peste o lună”. |
| C5 | Fără notificare la refuz; membrul vede „În așteptare” / „Activată” / „Nu acum”; notificare doar la activare. |
| C6 | Catalogul se deschide din launcher, din paleta de comenzi și din meniul contului. |
| — | Recomandarea pentru CampaignKit din launcher e un slot comercial, doar pentru proprietar și admin, cu „Nu mă interesează” și plafoane. |

**Review de produs (P1–P27)**

| # | Decizie |
| --- | --- |
| P1 | „Ține-mă minte” arată durata: 30 de zile. |
| P2 | „Arată parola” în loc de „Repetă parola”. |
| P3 | Un rol cu o singură aplicație intră direct în ea; un rol cu mai multe ajunge prima dată în launcher. |
| P4 | Ordinea aplicațiilor: fixă implicit, cu reordonare manuală per utilizator. |
| P5 | ~~Autentificare în doi pași obligatorie pentru proprietar, 14 zile de grație de la prima intrare, coduri de recuperare.~~ Înlocuit de S58 (28 oct. 2026): proprietarul activează autentificarea în doi pași la prima intrare, fără grație; coduri de rezervă. |
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
| V16 (R-B5) | Linia de azi din DocSpace: „Ultimul deschis: {document} · {când}”. |
| V17 (R-B6) | Acceptarea invitației (HubInvite) folosește panoul de brand al autentificării. |
| V18 (R-B7) | În aplicații salutul din „Azi” rămâne `display-l` 30/36; mărimea nouă e `display-hub` 40/46, doar în launcher și la autentificare. |

**Numele aplicațiilor (D-UX-4, 25 octombrie 2026)**

Cele 13 module de business au nume afișate noi, aceleași în toate cele 6 limbi. Portal și Network rămân la fel. Iconurile, cheile (`booking`, `crm`…), descrierile de sub nume și numele tehnice ale componentelor (`BookingToday`, `BookingSmsSettings`, `CrmPipeline`, `HrAttendance`…) nu se schimbă; nici grupul de carduri „Ecrane Booking” din acest sistem.

| Cheie | Înainte | Acum |
| --- | --- | --- |
| booking | Booking | EasyBook |
| crm | CRM | ClientDesk |
| hr | HR | TeamSpace |
| finance | Finance | MoneyDesk |
| projects | Projects | TaskBoard |
| shifts | Shifts | ShiftPlan |
| documents | Documents | DocSpace |
| inventory | Inventory | StockDesk |
| analytics | Analytics | DataView |
| marketing | Marketing | CampaignKit |
| events | Events | EventSpace |
| assets | Assets | AssetDesk |
| contracts | Contracts | ContractDesk |

Aplicat în `APPS` (deci AppIcon, AppTile, AppDock, AppLaunch, Spine, AccessBadge și tot ce citește numele de acolo), în glosar și în toate ecranele și textele (launcher, catalog, ContextBar, fișele din dock, Founder, recomandări, notificări, „Deschide EasyBook”). Nu se traduc și nu se declină: „în EasyBook”, „din ClientDesk”. Ca să încapă, eticheta din AppDock folosește acum toată lățimea aplicației (96px pe desktop și tabletă, 86px pe telefon); cel mai lung nume, ContractDesk, are 94px la 14px și 81px la 12px, deci nu se taie. Testul e în fișa AppDock, și în germană.

**SMS de pe numărul propriu, EasyBook (S1–S19, 25 octombrie 2026)**

Pornesc din `SPEC_ECRANE_SMS.md` și `SMS_NUMAR_PROPRIU.md` (D-SMS-1…9). Funcționalitatea e aprobată condiționat: validarea tehnică E-SMS-1 și cea juridică D-SMS-7 sunt încă deschise.

| # | Decizie |
| --- | --- |
| S1 | `AttentionList` primește `tone: "neutral"`. Peach rămâne doar pentru „telefonul afacerii e deconectat și are mesaje în așteptare”. |
| S2 | `NotificationsPanel` grupează pe categorii; „Despre cont și funcționare” (notificările operaționale) stă sus. |
| S3 | Un șablon de email operațional, general pentru tot ecosistemul (invitația, resetarea parolei, codurile de autentificare, alertele SMS), în cele 6 limbi, doar light. Emailurile pleacă prin Resend, de pe ventora-hub.com, toate de la Ventora <noreply@ventora-hub.com> (28 oct. 2026). |
| S4 | Pagina publică de descărcare a aplicației pentru telefon se face din piesele existente. Spune „Descarcă aplicația doar de pe această pagină.”, plus versiunea și data ei; fără coduri de verificare. |
| S5 | În „Au nevoie de tine” intră și „3 mesaje la rând nu au plecat” și „aplicația de pe telefon trebuie actualizată”. |
| S6 | La „Ce îți trebuie”, lângă recomandarea de telefon dedicat: SMS-urile rămân și în istoricul telefonului, de aceea recomandăm un telefon dedicat, cu PIN. |
| S7 | Numele telefonului apare pe mesaj doar când afacerea are cel puțin două telefoane. |
| S8 | „Conectat” e neutru, cu icon plin; „Deconectat” e cerc gol, peach doar când are mesaje în așteptare. Lime rămâne doar pentru trimis și livrat. |
| S9 | Starea incertă a unui mesaj se numește „Fără confirmare”, nu „Neconfirmat” (ca să nu se confunde cu programarea „Neconfirmată”), cu explicația „Mesajul a ajuns la telefon, dar nu avem confirmarea că a plecat. Poate să fi plecat.” |
| S10 | „Reamintire” peste tot în interfață, nu „reminder”. |
| S11 | Instalarea aplicației: pași numerotați, cu text și iconuri, fără ilustrații. Capturile reale vin după E-SMS-1. |
| S12 | Roluri: proprietarul și adminul fac tot. Managerul aplicației EasyBook vede starea, trimite SMS de probă, redenumește telefonul și schimbă orele de trimitere; nu schimbă metoda, nu conectează și nu deconectează telefoane, nu pornește rezerva prin Ventora. „Un telefon în plus” îl plătește doar proprietarul; adminul și managerul văd „Recomandă”. |
| S13 | „Dezactivat”: nu pleacă niciun SMS. Reamintirile pe email continuă dacă sunt pornite. Ecranul spune: „Nu trimitem SMS-uri. Reamintirile pe e-mail rămân cum le-ai setat în Reamintiri.”, cu link spre tabul Reamintiri (R-S1). Aceeași frază în starea „Nicio metodă aleasă”. |
| S14 | Rezerva prin Ventora: „Consumă din SMS-urile abonamentului · îți mai rămân {n} luna asta”. Prețul în lei apare doar când SMS-urile abonamentului se termină. |
| S15 | Prețul telefonului în plus e „{preț} lei pe lună”, marcat vizibil ca valoare de completat până la decizia D-SMS-4. |
| S16 | Istoricul unui mesaj se desfășoară sub mesaj, în același drawer al programării. |
| S17 | Pe email, stările sunt „Trimis”, „Livrat” (doar când furnizorul confirmă primirea de serverul destinatarului) și „Nu s-a trimis” (adresă greșită, respins). Fără „Fără confirmare” pentru email. |
| S18 | Membrii, la telefonul în plus: tiparul aprobat din `UpgradeDialog`, cu „Recomandă” și cine decide. |
| S19 | Culorile stărilor unui mesaj, mereu cu icon și text: neutru pentru „În așteptare”, „Predat telefonului”, „Fără confirmare” și „Anulat”; lime pentru „Trimis” (o bifă) și „Livrat” (bifă dublă); `danger` pentru „Nu s-a trimis”. |
| S20 | „Vezi ce poți face” (telefon deconectat) deschide un Dialog: 4 verificări pe telefon (pornit, internet, aplicația Ventora pornită — merge și în fundal, economisirea bateriei oprită pentru Ventora), apoi „Conectează alt telefon” și „Trimite un SMS de probă” (R-S2). |
| S21 | Mesajele în așteptare nu așteaptă la nesfârșit: la deconectare, „Cele {n} mesaje în așteptare pleacă doar dacă conectezi alt telefon sau alegi altă metodă înainte de ora lor. Altfel nu mai pleacă și te anunțăm.” |
| S22 | Cifrele de capacitate se calculează din ~40 de mesaje pe oră × intervalul de reamintiri (10:00–19:00 ≈ 360). Exemplul de depășire: 420 de reamintiri. |
| S23 | „Prin Ventora”: „Cumpără un pachet în plus · {preț}” doar la proprietar (tiparul UsageMeter / HubAddonPurchase). Adminul și managerul văd „Recomandă un pachet în plus” + „Ajunge la {nume} (proprietar).” Membrul nu vede nicio acțiune. |
| S24 | Cele 4 cifre de azi: un rând de 4 pe desktop și tabletă, 2×2 pe telefon. Niciodată 3+1. |
| S25 | Conectarea telefonului (§2): pasul 3 trece singur la pasul 4 când telefonul se conectează, fără „Continuă” (R-C1). |
| S26 | Ieșirea înainte de final: după pasul 3 telefonul rămâne conectat, dar nu trimite nimic până la declarație și probă. Reiei din Setări → „Continuă conectarea”, de la pasul unde ai rămas (R-C2). |
| S27 | Numele telefonului (implicit „Telefon recepție”) se dă la pasul 7 (R-C3). |
| S28 | Proba „Fără confirmare”: „A ajuns, continuă” și „Trimite din nou”; „Continuă” merge și după „Trimis”, fără „Livrat” (R-C4). |
| S29 | Ghidurile pe marcă: Samsung, Xiaomi, Motorola, Google Pixel, „Altă marcă”. Texte orientative până la testele pe telefoane reale (E-SMS-1); „Ghidul complet” duce la pagina din §9 (R-C5). |
| S30 | Pasul 1: „SMS-urile pleacă de pe numărul acestui SIM și le plătești la operatorul tău, ca pe orice SMS.” „Abonament” rămâne doar abonamentul Ventora. |
| S31 | **Text juridic de validat (D-SMS-7):** declarația de la pasul 5 („Folosesc un SIM al afacerii și respect condițiile operatorului meu de telefonie.”) și pagina „Ce înseamnă asta” sunt provizorii până la validarea juridică. |
| S32 | „Aplicația Ventora pornită”, nu „deschisă”: merge și în fundal, cu ecranul stins (pasul 7 și verificările din §1). |
| S33 | Adresa paginii de descărcare: app.ventora-hub.com/telefon, peste tot (QR, text, ghiduri). |
| S34 | Istoricul pe stări al unui mesaj folosește lista „Istoric” din drawer, nu componenta Timeline (care e un grafic pe perioade) (R-M1). |
| S35 | Textul trimis clientului apare în istoricul deschis, doar cât se păstrează pe server (SMS_NUMAR_PROPRIU §3.8; termenul din ARCHITECTURE §17.4). După aceea, în locul lui: „Textul nu se mai păstrează după 30 de zile. Starea și ora rămân.” (R-M2) Termenul de 30 de zile e decizia de acum și se confirmă la politica de retenție. |
| S36 | „Trimite din nou” lipsește când programarea a început sau adresa de e-mail nu există; motivul spune ce s-a întâmplat (R-M3). „Anulat” = mesajul nu mai pleacă pentru că programarea s-a mutat sau s-a anulat, cu motivul sub rând (R-M4). |
| S37 | Mesajele stau în ordinea în care au plecat, cel mai vechi sus; oricine are acces la EasyBook vede secțiunea și poate retrimite (R-M5). |
| S38 | **SMS-urile către clienți: fără diacritice și în cel mult 160 de caractere (1 SMS).** Cu un singur caracter în afara alfabetului SMS standard (ă, â, î, ș, ț, „”, ’, —) un SMS are 70 de caractere, iar reamintirea veche (166 de caractere, cu diacritice) pleca în 3 SMS-uri: cost și capacitate triple. Germana și italiana își păstrează ä, ö, ü, ß, à, è, é, ì, ò, ù, care sunt în alfabet. Sub textul din istoric: „1 SMS · 119 caractere”. E-mailurile și interfața rămân cu diacritice. |
| S39 | Pe telefon, bara de sus din Hub arată doar semnul Ventora când pagina are titlu (numele lungi, ca CampaignKit, nu se mai taie). |
| S40 | În Founder Growth, valorile lungi din Select (semnalul și oferta campaniei) trec pe două rânduri: `className="v-select--wrap"`. |
| S41 | Italiana din ecranele SMS folosește „Lei”, ca în glosar („Cosa Le serve”, „Tenga vicino il telefono”, „In attesa di Lei”); butoanele rămân la imperativ, ca verbele din glosar. Corectat în §2 și §4. |
| S42 | Alertele SMS din „Au nevoie de tine” (§4): deconectarea e mereu prima și singura peach; „{n} mesaje nu au plecat azi” și „3 mesaje la rând nu au plecat” sunt danger, iar „3 la rând” o înlocuiește pe cealaltă când se aplică amândouă; restul (fără confirmare, baterie, capacitate, aplicație veche) sunt `tone: "neutral"`. Celelalte alerte SMS intră în ordinea obișnuită a listei. (R-A1…R-A3) |
| S43 | Cât timp e afișată alerta de deconectare, slotul comercial de sub listă nu apare (R-A4). Alertele dispar singure când problema s-a rezolvat; la reconectare apare un Toast. Alerta de baterie apare sub 15% și doar când telefonul nu se încarcă (R-A5). |
| S44 | Alertele SMS le văd proprietarul, adminul și managerul EasyBook; managerul are doar acțiunile lui (SMS de probă, orele), fără „Conectează alt telefon”. Membrii nu le văd. (R-A6) |
| S45 | Pe telefon, „Azi” începe cu „Următoarea programare”, apoi „Au nevoie de tine” (cu alerta de telefon deconectat pe primul rând), apoi „În desfășurare” și programul zilei. Desktop și tabletă rămân neschimbate. Corectat și în BookingToday. |
| S46 | Lista mesajelor (§5): implicit azi, cele mai noi sus; din cifre și alerte se deschide cu filtrul lor; click pe rând deschide programarea la mesaj (§3); „Trimite din nou” doar unde se poate (S36); fără acțiuni în bloc; membrii văd lista fără numerele clienților și fără export; pe telefon, cardul „client · Reamintire · 16:00 · stare”. (R-L1…R-L5) |
| S47 | Starea de eșec are un singur plural: „Nu au plecat” (cifre, filtre, alerte); la singular „Nu s-a trimis”. Nu „Nu s-au trimis”. |
| S48 | Tipurile de mesaj au o formă lungă (detaliul programării) și una scurtă (tabel, carduri pe telefon), definite în glosar ca pereche: „Reamintire”; „Confirmarea programării” / „Confirmare”; „Programare mutată” / „Mutare”; „Programare anulată” / „Anulare”. |
| S49 | Telefonul în plus (§6): înainte de plată spunem de pe ce număr primesc clienții mesajele (R-T2, textul în S51); membrii nu ajung la dialog, managerul ajunge din capacitate (R-T3); după plată, §2 pornește de la pasul 1 (R-T4). Prețul rămâne „{preț} lei pe lună”, de completat (D-SMS-4). |
| S50 | Fără peach în fluxul telefonului în plus: pasul de opțiuni n-are contor, iar contorul de după plată („Telefoane conectate 1 → 2”) e neutru. Regula e în componentă: comparația înainte/după de după o plată e mereu neutră (UpgradeDialog și AddonPurchase). (R-T1) |
| S51 | Mai multe telefoane (D-SMS-11): același client primește, când se poate, de pe același telefon; dacă unul se deconectează, mesajele care încă așteaptă pleacă de pe celălalt, iar cele deja predate lui nu se retrimit automat. În ofertă: „Fiecare client primește mesajele de pe același număr, de obicei. Dacă un telefon se deconectează, unele pot pleca de pe celălalt.” În Setări: „Dacă unul se deconectează, celălalt trimite mesajele care încă așteaptă.” |
| S52 | Notificările operaționale SMS (§7): e-mailul „deconectat” pleacă o dată pentru fiecare deconectare (după 15 minute, doar cu mesaje în așteptare), cel mult 3 pe zi pentru aceeași afacere; „Mesajele nu pleacă” după 3 mesaje la rând, cel mult o dată pe zi. Le primesc proprietarul, adminii și managerul EasyBook; punctul de necitit rămâne peach, ca în tot sistemul. (R-N1…R-N3, R-N5) |
| S53 | Copia pe e-mail a notificărilor operaționale SMS se poate opri de fiecare om, din Contul tău · Notificări, cu excepția proprietarului: comutatorul lui e pornit și blocat, cu „Proprietarul primește mereu aceste e-mailuri, ca să afle cineva sigur când reamintirile nu pleacă.” În aplicație nu se opresc. (R-N4) |
| S54 | Șablonul de e-mail operațional servește invitația în echipă, resetarea parolei și alertele SMS. Nu trimitem coduri de autentificare pe e-mail: autentificarea în doi pași e cu aplicație de autentificare. |
| S55 | Valabilitatea linkurilor: invitația unui membru 7 zile, invitația proprietarului creată din Founder 30 de zile, resetarea parolei o oră. Fiindcă diferă, e-mailul de invitație spune data concretă („Invitația e valabilă până pe {data}.”); cel de resetare spune „Linkul e valabil o oră.” |
| S56 | Founder · SMS (§8): schimbarea plafonului cere motiv și intră în jurnal (R-F1); maximul e 30 la 30 de minute pentru toate modelele, de revăzut după E-SMS-1 (R-F2); dialogul arată ce vede afacerea (R-F3). |
| S57 | Founder rămâne doar în română, fără test DE/IT, dar toate textele lui sunt chei de traducere, nu text scris direct, ca să poată fi traduse mai târziu (R-F4). |
| S58 | Autentificarea în doi pași (R-2F1): proprietarul o activează la prima intrare după ce devine proprietar, fără grație, fără „Sari peste” și fără „Dezactivează”. În Founder e obligatorie pentru toți. Înlocuiește P5. În HubAccount proprietarul vede starea („Activă · obligatorie pentru proprietar”), nu un comutator; starea „Autentificarea în doi pași e oprită” din HubStates a fost scoasă. „Ieși din cont” rămâne la pașii 1 și 2 și nu sare peste. |
| S59 | Codul din aplicația de autentificare se cere la fiecare intrare cu parola; „Ține-mă minte pe acest dispozitiv timp de 30 de zile” păstrează doar sesiunea. Fără „Ține minte acest dispozitiv” la verificare. Înlocuiește D10 (R-2F2). |
| S60 | „Coduri de rezervă” peste tot (nu „coduri de recuperare”), în glosar în cele 6 limbi (R-2F3). 10 coduri de 8 cifre, văzute o singură dată, cu „Descarcă” și „Copiază” și bifa obligatorie „Le-am salvat într-un loc sigur”. |
| S61 | Blocare după 5 coduri greșite, 15 minute, la activare și la intrare; mesajul spune ora („Poți intra din nou după ora {time}.”). Sesiunea de verificare ține 10 minute, apoi înapoi la autentificare (R-2F5). |
| S62 | Recuperarea accesului: „Scrie-ne de pe adresa contului…”, fără resetare automată. Adresa e support@ventorasystems.com (R-2F7, 28 oct. 2026), în Hub și în Founder, în cheile `auth.2fa.recovery.email` și `auth.2fa.recovery.address` din cele 6 limbi. |
| S63 | AuthLayout e componentă (R-2F9), cu același nume și aceleași zone ca în packages/ui: panoul de brand, foaia cu formularul, banda cu logo pe telefon. În plus: `brand="founder"`, `statement`, `wide`. Fraza panoului e tradusă în cele 6 limbi. |
| S64 | AttentionList (PASUL 2 b): tonul implicit e neutru; peach (`tone: "attention"`) doar pentru „are nevoie de tine acum”; roșu (`tone: "danger"`) doar pentru eroare sau pierdere. Înlocuiește regula veche din S1 (implicit peach). |
| S65 | UsageMeter la limită (PASUL 2 c): proprietarul vede „Cumpără pachet · {preț}” (principal) și „Cere alt abonament” (secundar); ceilalți văd „Pachetele în plus le poate cumpăra doar {nume} (proprietar).” și „Anunță proprietarul”. Textul de deasupra rămâne „Ai atins limita abonamentului. Nu se pierde nimic din ce ai…”. |
| S66 | Antetul Hub pe telefon (sub 600px, PASUL 2 d): doar logo, căutare (iconiță), clopoțel și avatar. Selectorul de afacere e în AccountMenu („Afacerile tale”, `orgsInMenu`). Shell-ul trece pe varianta de telefon sub 768px, deci regula acoperă tot ce e sub 600px. |
| S67 | Iconițele din launcher sunt în registrul Icon: wrench, lock, globe, store, grid, arrow-right (PASUL 2 e; „grid” adăugată, Lucide grid-3x3). |
| S68 | §9 SmsAppDownload aprobat, cu R-D1…R-D7. |
| S69 | PASUL 2 aprobat (28 oct. 2026). Exportul îl integrează agentul UI pe branch-ul lui. Etichetele scurte pentru bara de jos sunt în S70. |
| S70 | Etichete scurte în bara de jos pe telefon (`short`), doar acolo; în rest forma lungă: programări → „Bookings” (EN), „Agenda” (FR, IT); abonament → „Plan” (EN), „Usage” (FR), „Abo” (DE), „Utilizzo” (IT). În glosar, secțiunea „Etichete scurte în bara de jos pe telefon”. |
| S71 | P-1: pe telefon, când bara de sus are titlu, titlul ia tot locul până la iconițe; ce nu încape se termină cu „…” (ContextBar). P-2: Timeline se deschide cu ziua de azi la aproximativ o treime din lățimea vizibilă, iar eticheta „azi” rămâne mereu pe ecran: centrată pe linie când încape, altfel mutată spre interior (Timeline). |
| S72 | Parola nouă (R-PR1, înlocuiește trimiterea la „D17”, care nu era în registru): după o parolă nouă din „Ai uitat parola?” se închid toate sesiunile, pe toate dispozitivele, inclusiv cele cu „Ține-mă minte”. Ecranul o spune înainte de salvare („Când o salvezi, te scoatem din cont pe toate dispozitivele.”) și după („Te-am scos din cont pe toate dispozitivele.”). Proprietarul cu autentificare în doi pași și oricine din Founder dau codul la intrarea următoare. |
| S73 | După „Trimite linkul” (R-PR2): titlul e „Verifică-ți e-mailul”, iar fraza spune „Dacă {email} este adresa unui cont Ventora, ți-am trimis acolo un link pentru o parolă nouă.” Același ecran pentru orice adresă, ca să nu dezvăluim conturile. |
| S74 | „Trimite alt link” devine activ după un minut („Poți cere alt link peste un minut.”); fiecare link nou îl anulează pe cel vechi („Ți-am trimis alt link. Folosește-l pe cel mai nou.”) (R-PR3). |
| S75 | După 5 cereri într-o oră pentru aceeași adresă: Notice danger „Ai încercat de prea multe ori” / „Poți cere un link nou după ora {time}.”, cu câmpul și butonul oprite (R-PR4). |
| S76 | „Cere un link nou” dintr-un link expirat trimite direct alt link pe adresa contului și duce la „Verifică-ți e-mailul”. Când adresa nu se mai poate afla din link (link deja folosit sau necunoscut), duce la „Ai uitat parola?” cu câmpul de e-mail gol (R-PR5, 28 oct. 2026). |
| S77 | Un link stricat sau necunoscut arată ecranul „Linkul a expirat”; nu spunem dacă linkul a existat (R-PR6). |
| S78 | După o parolă nouă pleacă e-mailul „Parola contului tău a fost schimbată” (R-PR7, texte aprobate pe 28 oct. 2026), prin șablonul operațional (S54 primește încă un tip), de la Ventora <noreply@ventora-hub.com>. Subiect: „Parola contului tău Ventora a fost schimbată”. Fraza are două variante: din „Ai uitat parola?” — „Parola contului {email} a fost schimbată pe {data}, la {ora}. Te-am scos din cont pe toate dispozitivele.”; din Contul tău · Securitate — „… Te-am scos din cont pe celelalte dispozitive.” Ora e în fusul fix al celorlalte e-mailuri, cu abrevierea lui („10:32 EET”), nu în fusul contului. „Nu ai fost tu? Alege imediat o parolă nouă din «Ai uitat parola?» și scrie-ne la support@ventorasystems.com.” — doar text. Butonul: „Scrie-ne la suport”. Fără link de resetare și fără parolă. Chei `auth.reset.email.*` în `i18n/password-reset.json`, 6 limbi. |
| S79 | „Parola e schimbată” e neutră pe ecran, cu iconița de ieșire, ca „Autentificarea în doi pași e activă”; toastul din Contul tău („Parola e schimbată.”) rămâne lime (R-PR8). |
| S80 | Fișa 2FA (28 oct. 2026): „Ieși din cont” rămâne la pașii 1 și 2 ai activării și nu sare peste (R-2F4, deja în S58); codurile de rezervă au 8 cifre, în două grupuri, și se descarcă în `ventora-coduri-de-rezerva.txt` (R-2F6, S60); Founder fără selector de limbă, recuperarea la aceeași adresă (R-2F8, S57, S62). |
| S81 | După o intrare cu un cod de rezervă (R-2F10): un toast „Ai intrat cu un cod de rezervă” în locul unde ajungi, cu câte coduri au rămas și „Generează coduri noi” (spre Contul tău · Securitate). Cu 3 sau mai multe coduri e neutru și dispare singur; cu 2, 1 sau 0 e peach și rămâne până îl închizi. Cheile `auth.2fa.backupLeft.*`. |
| S82 | E-mailul „Parola contului tău a fost schimbată” pleacă la orice schimbare de parolă: din „Ai uitat parola?” și din Contul tău · Securitate (R-PR9, 28 oct. 2026). |
| S83 | E-mailul „Parola contului tău a fost schimbată” nu se poate opri: e un e-mail de securitate, nu o notificare. În Contul tău · Notificări apare cel mult ca rând informativ, fără comutator (R-PR10, 28 oct. 2026). |
| S84 | Founder · „Coduri de rezervă” (FounderBackupCodes): o pagină minimă în shell-ul Founder, la care duce „Generează coduri noi” (S81). Arată câte coduri au rămas („Ți-au rămas {n} din 10.”); generarea se confirmă cu codul din aplicația de autentificare; codurile noi apar o singură dată, cu „Descarcă” și „Copiază” și bifa obligatorie, ca la activare; codurile vechi nu mai merg. Cod greșit și blocarea după 5 coduri greșite ca în S61. Refolosește piesele din Hub (câmpul de cod din HubTwoFactorVerify, lista din HubTwoFactorSetup). Chei `auth.2fa.codes.*`. |
| S85 | Sesiunea de suport în Hub (Lotul 2.5c): cât timp e activă, toți membrii afacerii văd un banner deasupra paginii, în launcher și în aplicații, cu textele aprobate `support.session.banner.*` („Sesiune de suport activă”, „{founderName} din echipa Ventora poate vedea datele afacerii până la {expiresAt}.”, „Doar citire: …”). „Închide sesiunea” doar pentru proprietar și admin, cu confirmare („Închizi sesiunea de suport? Echipa Ventora pierde accesul imediat.”) și toastul „Sesiunea de suport s-a închis.” (HubSupportSession) |
| S86 | Sesiunea de suport în Founder: se deschide din pagina afacerii, cu motiv (obligatoriu), referința cererii (obligatorie) și durată (opțională; implicit 1 oră, cel mult 4 ore, S92); o singură sesiune deschisă pe afacere. Bannerul, expirarea și închiderea folosesc textele aprobate `founder.support.banner.*`. Doar în română (FounderSupportSession) |
| S87 | Recuperarea accesului proprietarului, din Founder, după PROCEDURA-RECUPERARE-OWNER: proprietarul, referința cererii, motivul (obligatoriu, 10–1.000 de caractere, S93), trei verificări (e-mailul contului; telefonul afacerii din contract sau facturare, niciodată din cerere; confirmarea scrisă a altui admin activ), „Adresa contului e compromisă”. Regula: cel puțin 2 verificări; cu adresa compromisă, telefonul și adminul obligatorii; butonul e inactiv până se respectă, iar serverul o verifică din nou. Bifa „Am verificat identitatea conform procedurii”; varianta B (implicit, 2FA + parolă, link valabil o oră) sau A (doar 2FA); codul de autentificare al Founder-ului; buton danger și confirmare care spune ce se întâmplă. Blocare după 5 coduri greșite, 15 minute (ca S61). Fără acte, capturi sau conținutul e-mailurilor (FounderOwnerRecovery) |
| S88 | Logo-ul pentru antetul e-mailurilor: `assets/Logos/ventora-logo-email-2x.png`, varianta light, PNG 320 × 88 (afișat la 160 × 44), randat din `ventora-logo.svg`. |
| S89 | Sesiunea de suport în Hub: membrii văd doar bannerul (titlul, mesajul, „Doar citire”); motivul, cererea și „Închide sesiunea” le văd doar proprietarul și adminul (R-SS1, 28 oct. 2026). |
| S90 | Culoarea bannerului de suport: în Hub e neutru (o informație, nu ceva de rezolvat acum); în Founder e peach (ești acum în datele altei afaceri) și devine neutru când sesiunea a expirat (R-SS2, 28 oct. 2026). |
| S91 | Sesiunile de suport ale afacerii se văd în Administrare · Roluri și acces, secțiunea „Sesiuni de suport”: cine din echipa Ventora, motivul, cererea, când și starea (activă, închisă de cineva, expirată); cea activă are „Închide sesiunea” în meniul rândului (R-SS3, 28 oct. 2026). |
| S92 | Durata sesiunii de suport: implicit 1 oră, cel mult 4 ore; opțiunile sunt 30 de minute, 1 oră, 2 ore și 4 ore (R-SS4, 28 oct. 2026). |
| S93 | Limitele câmpurilor din sesiunea de suport și din recuperarea proprietarului: motivul are între 10 și 1.000 de caractere (cu contor); referința cererii e obligatorie, cel mult 255 de caractere (R-SS5, 28 oct. 2026). |
| S94 | Închiderea sesiunii de suport în Hub: dialogul are titlul `support.session.banner.close` („Închide sesiunea”), corpul `support.session.banner.closeConfirm` și butoanele „Renunță” (`support.session.banner.cancel`) și „Închide sesiunea”. Nu e nevoie de o cheie `closeTitle` (R-SS6, 28 oct. 2026). |
| S95 | În Founder, sesiunea de suport și recuperarea proprietarului pornesc din pagina afacerii, meniul „Mai multe”: „Deschide o sesiune de suport” și „Recuperează accesul proprietarului” (R-SS7, 28 oct. 2026). |
| S96 | Traducerile EN, FR, ES, DE și IT ale cheilor `support.session.banner.*` sunt cele din cod; cele desenate înainte au fost înlocuite în `i18n/support-session.json` (R-SS8, 28 oct. 2026). |
| S97 | E-mailul E-6 „Echipa Ventora are acces de suport la {businessName}”, către proprietari la deschiderea sesiunii: de la Ventora <noreply@ventora-hub.com>, doar în română, același șablon, fără buton; textele din cod, cheile `email.supportSession.*` (S99). Sesiunea se închide din bannerul din Ventora. (BookingSmsNotifications, cardurile 11–12) |
| S98 | Textele noi din Lotul 2.5c sunt aprobate în română (28 oct. 2026): `support.session.banner.cancel`, `support.sessions.*` (în `i18n/support-session.json`; EN–IT de verificat cu codul), `founder.support.open.*` și `founder.recovery.*` (în `i18n/founder-support.json`). Cu o corectură: `founder.recovery.check.emailHelp` = „Cererea vine de pe adresa contului, sau proprietarul a răspuns la e-mailul nostru trimis pe adresa contului.” |
| S99 | E-mailul E-6, după review (P-E6-1–P-E6-4): cheile sunt cele din cod, `email.supportSession.*` (subject, intro, scope, until, close, notRequested), plus două noi în același stil: `reason` („Motivul: {reason}”, după fraza de început) și `footer` („Primești acest e-mail pentru că ești proprietarul afacerii {businessName} în Ventora.”). Ora: „pe 28 octombrie, la 18:30 EET” (cu „la”, zona fixă și abrevierea). Expeditorul, salutul, semnătura și rândul cu firma vin din șablonul comun. |
| S100 | Contul tău · Securitate (Hub): „Schimbă parola” cu parola actuală și parola nouă cu cerințele live ca la resetare (10 caractere, o cifră, o literă mare; Ă Â Î Ș Ț contează). Stări: parolă actuală greșită, cerințe neîndeplinite, se salvează, gata cu toastul aprobat „Parola e schimbată.”. După salvare rămâi conectat pe acest dispozitiv și ești scos de pe celelalte; pleacă e-mailul S78, varianta „celelalte dispozitive” (29 oct. 2026). (HubAccountSecurity) |
| S101 | Intrarea în Founder (FounderSignIn): AuthLayout cu `brand="founder"`, e-mail, parolă, „Ai uitat parola?”; fără nota despre invitații și fără selector de limbă, doar în română. Stări: eroare, se verifică, prea multe încercări („Poți încerca din nou peste 15 minute, la ora {time}.”) (29 oct. 2026). |
| S102 | „Prea multe încercări” la intrare, în Hub și în Founder: 15 minute, nu 5 (29 oct. 2026). |
| S103 | Founder: parola are cel puțin 12 caractere („Cel puțin 12 caractere”) peste tot în Founder (resetare, activare); Hub rămâne la 10 (29 oct. 2026). |
| S104 | Codurile de rezervă rămân de 8 cifre, în două grupe (confirmă S60, 29 oct. 2026). |
| S105 | Un singur mesaj pentru un cod de rezervă greșit sau deja folosit; „Cod de rezervă deja folosit” nu mai e o stare separată (29 oct. 2026). |
| S106 | Sesiunile de suport închise de sistem: „Închisă automat” (`support.sessions.status.closedAuto`) (29 oct. 2026). |
| S107 | Regula de telefon pentru `display-hub` (32/36) și `lead` (15/30) e din nou în `tokens.json` (stilurile `display-hub-phone`, `lead-phone`), aplicată sub 768px în `bundle.css`; dispăruse din export după v49 (29 oct. 2026). |
| S108 | Autentificarea în doi pași nu e obligatorie pentru membri; în Contul tău · Securitate, un membru care nu o are activă vede rândul cu starea și o poate activa (29 oct. 2026). (HubAccountSecurity) |
| S109 | Traducerile EN, FR, ES, DE și IT pentru `support.sessions.*`, `support.session.banner.cancel` și `support.sessions.status.closedAuto` revizuite și corectate unde nu sunau natural (29 oct. 2026). Restul cheilor din cod (`hub.chooseBusiness.*`, `auth.signIn.*`, `invite.*`, `account.*`, `roles.*`) se verifică după lista din cod. |
| S110 | HubAccountSecurity (după S108): activarea autentificării în doi pași de către un membru cere parola actuală, la pasul 1, înainte de codul QR, cu „Ai uitat parola?” (spre resetare); codul QR și cheia apar doar după ce parola e confirmată; eroare „Parola actuală nu e corectă.”. La „Dispozitive conectate” nu mai apare orașul (nu păstrăm localizarea după IP): „Windows · Chrome · Ieri, 21:40”. Format oră: „Activ acum”, „Azi, 14:32”, „Ieri, 21:40”, apoi „28 oct., 09:15”; la fel la „Schimbată …” pentru parolă (30 oct. 2026). |

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
- **Hub:** Logo, BrandZone (zona de brand, doar în Hub), AuthLayout (pagina de autentificare: panoul de brand, foaia cu formularul, banda cu logo pe telefon), AppIcon (+ grila de construcție și exemple în context), AppTile (tile, icon, rând), AppDock (rândul de aplicații din launcher, cu fișa la hover), PortalPresence (pagina afacerii în Portal), AppLaunch (deschiderea unei aplicații, v2), AddonPurchase (cumpărarea pachetelor în plus cu cardul, PaymentCard, StripeSlot), AccessBadge, OrgSwitcher, NotificationsPanel, AccountMenu
- **Ecrane Hub** (pagini, fiecare în telefon, tabletă și desktop, light și dark): HubSignIn, HubInvite, HubChooseBusiness, HubLauncher, HubEmpty, HubAccount, HubAdminTeam, HubAdminAccess, HubAdminPlan, HubAddonPurchase, HubSupport, HubAccountSecurity (Contul tău · Securitate: „Schimbă parola”, doi pași pentru membri), HubTwoFactorSetup (activarea autentificării în doi pași), HubTwoFactorVerify (verificarea după parolă, „Nu mai am acces” și câte coduri de rezervă au rămas), HubPasswordReset (parola nouă din „Ai uitat parola?”), HubSupportSession (sesiunea de suport: bannerul, închiderea, lista sesiunilor), HubStates (stările care completează ecranele)
- **Ecrane Booking:** BookingToday, BookingCalendar, BookingList, BookingDetail, BookingNew, BookingSettings, BookingLimit, BookingStates, BookingSmsSettings (Setări · Trimitere SMS, de pe telefonul afacerii), BookingSmsConnect (conectarea telefonului afacerii, 7 pași), BookingSmsMessages (mesajele către client pe detaliul programării), BookingSmsToday (alertele SMS din „Au nevoie de tine”), BookingSmsList (lista mesajelor către clienți), BookingSmsExtraPhone (telefonul în plus), BookingSmsNotifications (notificările și e-mailul operațional), SmsAppDownload (pagina publică de descărcare a aplicației pentru telefon); Founder: FounderBusinessSms (secțiunea SMS a unei afaceri)
- **Comercial** (recomandări discrete, grup separat): RecommendationLabel, GrowthSlot, RecommendationCard, UpgradeDialog, DiscoveryTooltip, HubRecommendation, CatalogRecommendation, CommercialPreferences, HubCatalog, HubCatalogApp, RuleBuilder, CommercialStates
- **Founder Control Center + Growth** (instrumentul intern al echipei Ventora): FounderBusinesses, FounderBusiness, FounderNewBusiness, FounderPlans, FounderPlanEditor, FounderPacks, FounderUsage, GrowthOffers, GrowthOfferEditor, GrowthCampaigns, GrowthCampaignEditor, GrowthAudiences, GrowthResults, GrowthControl, FounderSignIn (intrarea în Founder), FounderTwoFactor (autentificarea în doi pași, obligatorie pentru toți), FounderPasswordReset (parola nouă din „Ai uitat parola?”), FounderBackupCodes (codurile de rezervă noi), FounderSupportSession (sesiunea de suport), FounderOwnerRecovery (recuperarea accesului proprietarului), FounderStates
- **Ecrane aplicații** (câte un ecran reprezentativ pe același shell): CrmPipeline, HrAttendance, InventoryStock, ProjectsBoard, ProjectsTimeline, FinanceDue, AnalyticsDashboard, AppStates
- **Fundații:** Glosar (termenii în 6 limbi și regulile de scriere), Italiano, Icon, VentoraProvider, useTheme, useToast, useHotkey


---

## Consuming this system (generated — do not edit)

Every path named below is under `project/` in this design system: read `project/api/tokens.md`, not `api/tokens.md`.

`components/bundle.js` defines `window.Ventora` (70 components); `components/bundle.css` is its stylesheet; `tokens.css` is every token as a CSS variable plus `@font-face` for the fonts. `components/bundle.css` reads its variables from `tokens.css`. The bundle needs react 18 (not packed in this system: bring your own copy) (`window.React`), react-dom 18 (not packed in this system: bring your own copy) (`window.ReactDOM`), loaded before it. Build any UI by mounting these components; never hand-build a control or draw an icon the system provides.

- **Standalone page:** inline `tokens.css` and `components/bundle.css` in a `<style>`, then the library files and `components/bundle.js` as classic scripts (a file containing `</style`, `</script` or `<!--` breaks an inline element: write the sequence `<\/style`, `<\/script` or `\x3C!--` in your copy, or load that file by URL).
- **Design canvas:** bring `tokens.css`, `components/bundle.css`, `components/bundle.js` and `components/index.d.ts` (for the editor’s props panel) onto the canvas in full, as the canvas type’s design-system components reference says (a server-side copy first where it offers one); in each artboard that uses this system, right after the `support.js` line, load `tokens.css` first, then the stylesheet, then the script; skip the library files (the artboard supplies React); mount with `<x-import component-from-global-scope="Ventora.<Comp>" …>`.
- **Slides deck, or any surface that cannot run the bundle:** tokens and fonts — the values are on `api/tokens.md`; the deck takes `tokens.json` by file path for its colour pickers, and fonts as “Fonts” below says.

Fonts: `tokens.css` loads each font from its file, by path.

- **Design canvas:** copy `fonts/DMSans-Variable.woff2`, `fonts/DMSans-Italic-Variable.woff2` and `fonts/Syne-Variable.woff2` to the same paths under the canvas’s `project/ds/<folder>/` (`<folder>` is the folder you install this system under; `fonts/DMSans-Variable.woff2` lands on `project/ds/<folder>/fonts/DMSans-Variable.woff2`), in the same call that installs this system; the copy of `tokens.css` that each artboard links loads them from there. If the install’s reply leaves a font out, bring that font in as for any other page.
- **Slides deck:** for each family you use in the deck (`faces` holds at most the number of typefaces Slides’ `deck-files.md` gives), install its file with the system and name the path it lands on as that family’s `src` in `project/deck.json` `faces`, under the key in the Slides column. A deck takes a font as a file only under the rule in Slides’ `fonts.md` (no space or leading underscore in its path, for two): any other font, or one kept by id, is uploaded as `fonts.md` says.
- **Any other page:** one file per family is enough (below: the upright face nearest regular weight; bold and italic synthesize). Fetch it as the fetch column says (Artifact tool `read`, that id or path as `path`), upload it as an asset (`publish`, `file_path`, `asset:true`) and declare it with an `@font-face { font-family: "<family>"; src: url(<uploaded>) }` rule.

| family | file | fetch | CSS | Slides `faces` key |
| --- | --- | --- | --- | --- |
| DM Sans | `fonts/DMSans-Variable.woff2` (weight 100 1000) | `read` the file with `project/` in front | `var(--font-sans)` | `dm-sans` |
| Syne | `fonts/Syne-Variable.woff2` (weight 400 800) | `read` the file with `project/` in front | `var(--font-display)` | `syne` |

**Read, per thing:** a component’s props, parts and examples: `api/components/<Comp>.md`; token values: `api/tokens.md`; stored assets and their paths: `api/assets/<Group>.md`. After this README, fetch the cards and fonts you need in ONE message as parallel calls — none depends on another.

**Two rules.** Before you use a thing — a component, a token group, an icon, an asset — read its card from the index below; a value you did not read from a card is a guess. `tokens.json`, `manifest.json`, `components/index.d.ts` and `design-system.json` are sources for tools: hand them over. `components/<Comp>/README.md` and `assets/<Group>/README.md` are the long-form second read a card links to; `SKILL.md` and `artifact-type/` beside them are authoring guidance, not needed to consume the system.

## Index (generated — do not edit)

**Tokens**

- `api/tokens.md` — Every token: surface, text, fill, chart, palette, type, spacing, radius, shadow, border, size, duration, easing, z-index. (32.2k)

**Icons and assets**

- `api/assets/App-icons.md` — 60 files, by asset id. (6.7k)

**Components** (`api/components/<Comp>.md`, 121; 51 of them showcase pages)

- **Actions**: `Button` — Runs an action; the label is always a verb in sentence case ("Confirmă", "Trimite reamintire"), never "OK" · `IconButton` — A square button carrying a single Lucide icon; label is required and becomes the accessible name and the native tooltip
- **Forms**: `Input` — Single-line text entry; wrap it in FormField for the label, helper and error · `Textarea` — Multi-line text entry for notes and messages; same states as Input · `Select` — Pick one value from a short list; a custom listbox, never the native  · `Combobox` — Type to filter and pick one or many values — the search field for long lists (clients, services, staff) · `Checkbox` — An independent yes/no choice, or one of several in a list; supports indeterminate for "select all" headers · `Radio` — One choice from a small set, all options visible; use RadioGroup, which renders the fieldset, legend and error · `Toggle` — An on/off setting that takes effect immediately (no Save button); role switch · `SegmentedControl` — Switch between two to five views of the same content (Zi / Săptămână / Resurse; Listă / Calendar) · `FormField` — The wrapper every form control sits in: label, required marker, helper text and error message, wired with id and aria-describedby · `DatePicker` — Choose a date, a date range or a time; weeks start on Monday in every language · `FileUpload` — A drop zone plus a file list with per-file progress, success and error · `SlotPicker` — Free start times for a service and a person, as a grid of buttons; taken times stay visible, disabled and struck through, so people understand the day
- **Navigation**: `Tabs` — Switch between sibling sections of one record or page; the active tab has an ink label and a 2px primary underline · `CommandPalette` — Search and run anything from anywhere — pages, people, records, commands — with ⌘K / Ctrl+K
- **Data**: `DataTable` — The one table for every list of records: sorting, filters, selection, row actions, bulk bar, pagination, empty and loading — and a list layout on narrow screen… · `Schedule` — The calendar grid behind every time-based view: day (one column), week (seven day columns) and resources (one column per person, room or chair), with the peach… · `Agenda` — The day as a list — for the Today screen and for phones — with the peach "now" line between what's done and what's next, and the appointment in progress highli… · `Kanban` — Cards in stages — the ClientDesk pipeline, the TaskBoard board · `Timeline` — Stages of a project as bars across weeks, with the peach "Azi" line and milestones · `Stat` — One number with its label, an optional change against a named period and a short hint · `BarChart` — Columns for periods or days, horizontal bars for categories ranked by size · `LineChart` — A measure over time — revenue per month — with an optional grey comparison (last year) and the running period in peach · `Pagination` — Move through pages of a list: range ("21–40 din 248"), rows per page, page numbers with gaps, previous/next
- **Status**: `StatusPill` — The state of a record in one or two words, with an icon or dot — colour is never the only signal · `StatusDot` — A small mark beside a label for live or presence state ("Acum, în cabinetul 2", "Offline") · `Badge` — Counts and very short labels: unread counts, "Nou", plan tier · `Avatar` — A person or business: photo, or initials on avatar-bg; AvatarGroup stacks several with a "+n" remainder
- **Overlays**: `Tooltip` — A short label for an icon-only control or a truncated value, on hover and keyboard focus (400ms delay); never essential information · `Menu` — A list of actions opened from a trigger — the kebab on rows, "Creează", account menus · `Dialog` — A modal decision that blocks the page: confirm, a short form, a destructive choice · `Drawer` — A side panel over the current list for a record's detail or a longer form; full screen under 640px with a back arrow · `Toast` — A brief confirmation after an action, with "Anulează" (undo) whenever the action can be reversed
- **Feedback**: `EmptyState` — What a screen shows when there is nothing to show: one Lucide icon in a quiet plate, a title, one sentence, the next action — no illustrations · `Notice` — An inline message inside a page, form or panel — a sign-in error, an expired invitation, a plan notice — with an icon, a title, one or two sentences and option… · `AttentionList` — "Au nevoie de tine" — the few things that need a person now, each with its own action, at the top of every app's Today screen · `Skeleton` — Placeholder shapes while content loads; match the layout that is coming so nothing jumps · `ProgressBar` — Progress of a task the user started (import, export, upload, setup) · `UsageMeter` — Consumption against a plan limit, shown calmly: used, what is left, a warning near the limit, a controlled block at the limit, and the upgrade · `Kbd` — Keyboard keys in menus, tooltips and the command palette
- **Preferences**: `ThemeSwitcher` — Light / Dark / System — the three options every Ventora surface offers · `LanguageSwitcher` — Choose the interface language; each language is named in itself (Română, English, Français, Español, Deutsch)
- **Shell**: `AppShell` — The frame of every app: Spine on the left, ContextBar on top, the content (PageHeader + Sheet) in the middle — and a bottom nav under 640px · `Spine` — The app's navigation: app name (click to return to the Hub launcher), grouped items, an optional footer (usually a compact UsageMeter), collapse control — and… · `ContextBar` — The top bar of an app: business switcher, search (opens the CommandPalette, shows ⌘K), "Creează", notifications, account · `PageHeader` — The page's title block inside the content: optional breadcrumbs, title, one-line description, meta pills, actions, tabs · `Sheet` — The working surface: a sheet panel with a hairline edge on the canvas, holding forms, settings and content; SheetSection splits it with a heading
- **Hub**: `Logo` — The official Ventora logo files, embedded exactly as supplied: the mark, and the full logo with its own "VENTORA" wordmark · `AppIcon` — One of the fifteen Ventora app icons — a navy plate with off-white shapes and a single peach part, drawn on a shared 48-unit grid as an echo of the Ventora mar… · `AppTile` — One app in the Hub, in exactly one of four access states — only "Disponibilă" opens · `AppLaunch` — Opening an app from the Hub (version 2, direction B): the tapped icon swells, the app grows out of the card you pressed, the icon rides in its centre and settl… · `AddonPurchase` — The dialog in which the business owner buys an extra pack ("pachet în plus") with the card: review → processing → success or error · `AccessBadge` — The label for an app's access state, used on AppTiles and in the owner's access settings · `OrgSwitcher` — Shows the business you are working in and your role; switches between the businesses you belong to · `NotificationsPanel` — The bell in the ContextBar and its panel: All / Unread, mark all as read, settings, items with person or app icon · `AccountMenu` — The avatar in the ContextBar: who is signed in, account, theme, language, support, sign out · `BrandZone` — A brand zone: the only place navy is a surface · `AppDock` — The launcher's "Aplicațiile tale": a row of app icons on one raised sheet; on hover or keyboard focus an icon opens into the app's card above the row · `PortalPresence` — Portal in the business launcher: not an app the business works in, but its page for clients — shown as its own card under the AppDock, never as one more icon · `AppIconContext` (showcase page) — The app icons where they live, in light and dark: browser tabs (favicon at 16px), the Hub launcher with "Aplicațiile tale" and "Alte aplicații Ventora", the Sp… · `AppIconGrid` (showcase page) — The construction grid of the app-icon family: 48 × 48 units, plate corners r12, keyline square 10–38 and keyline circle r15, diagonals that align the V facets,…
- **Comercial**: `GrowthSlot` — The container an app puts in a permitted place (the side column of "Azi", a settings page) · `RecommendationCard` — One recommendation in a page, tied to what the business already does · `RecommendationLabel` — The small neutral Badge "Recomandare" on anything commercial — RecommendationCard, a commercial DiscoveryTooltip, HubRecommendation, a recommended AppTile · `UpgradeDialog` — The pack / plan / trial dialog · `DiscoveryTooltip` — A one-off hint next to the thing it explains: an arrow to the element, a short title, one sentence, "Am înțeles" and, optionally, "Vezi cum funcționează" · `HubRecommendation` — Recommendations in the Hub notifications panel · `RuleBuilder` — Eligibility rules for a Growth campaign: criterion, operator, value, joined by "all" or "any", with the estimated number of eligible businesses · `CatalogRecommendation` — A recommended app in the launcher ("Alte aplicații Ventora") and in the catalog: the existing AppTile with its access state, plus the "Recomandare" label, the… · `CommercialPreferences` — Account settings → Notifications → "Recomandări Ventora": in-app recommendations on or off; e-mail switched off and locked with "Disponibil în curând"; and a n… · `CommercialStates` (showcase page) — The states that complete the commercial components: catalog search without results; the trial ending in 3 days and the trial ended (the app pauses, data stays,… · `HubCatalog` (showcase page) — Hub — the full catalog: all 15 Ventora apps, grouped by category (Programări și clienți, Echipă, Operațiuni, Bani și documente, Proiecte și date, Comunitate),… · `HubCatalogApp` (showcase page) — Hub — one app's catalog page: what it does, what it connects to, why it is recommended for this business, and on the side the price, how it is paid, the setup…
- **Foundations**: `Icon` — Lucide icons, inlined — the only interface icon set; no emoji anywhere · `Glosar` (showcase page) — The single list of terms for every screen, in the six languages, with the writing rules (who we talk to, tone, buttons, errors, active voice, names from data,… · `Italiano` (showcase page) — The sixth language checked on the components that carry built-in text — field errors, password toggle, date range with Monday-first calendar, character counter…
- **Ecrane aplicații**: `AnalyticsDashboard` (showcase page) — DataView — Overview: four Stat tiles with change against last year, revenue per month over 12 months (grey comparison, October still running in peach), revenu… · `AppStates` (showcase page) — The states that complete the Stage 4 screens, with the approved copy: ClientDesk (empty pipeline, empty stage, moved, lost with an optional reason, stages chosen by t… · `CrmPipeline` (showcase page) — ClientDesk — Pipeline: open opportunities by stage with each stage's value, the next step on every card (peach only when it is today or overdue), "Câștigate în octomb… · `FinanceDue` (showcase page) — MoneyDesk — Due and overdue: what is still to be collected, overdue (peach, with the oldest age), due in 7 days, collected this month with its change; "Au nevoie… · `HrAttendance` (showcase page) — TeamSpace — Attendance: who is at work now (peach, the only "now"), lateness this week, leave, hours worked; "Au nevoie de tine" (leave to approve, a missing clock-ou… · `InventoryStock` (showcase page) — StockDesk — Stock with alerts: a peach Notice that names what ran out and what depends on it, with "Pregătește comanda"; each product's stock as a number and a… · `ProjectsBoard` (showcase page) — TaskBoard — Board: one project's tasks by stage with tag, people, sub-task progress and due date (peach only for today or late) · `ProjectsTimeline` (showcase page) — TaskBoard — Timeline: the project's stages across weeks with the peach today line, a late stage in peach, the launch as a milestone, and one sentence under it s…
- **Ecrane Booking**: `BookingCalendar` (showcase page) — EasyBook — Calendar with Schedule: resources (one column per person), week (today marked, Sunday closed) and day (pick the person) · `BookingDetail` (showcase page) — EasyBook — an appointment's detail in a Drawer over the list: status, when, service, person, client, the attention notice with its actions, team notes and histo… · `BookingLimit` (showcase page) — EasyBook — the monthly appointment limit reached when creating an appointment: existing ones stay editable; the owner buys more right there or requests a plan c… · `BookingList` (showcase page) — EasyBook — the appointments list: search, period, person and status filters with removable filter pills, sorting, selection with the bulk bar (confirm, send rem… · `BookingNew` (showcase page) — EasyBook — creating an appointment: client (search or new), service and person, date and the SlotPicker of free times, notes and confirmation/reminder options,… · `BookingSettings` (showcase page) — EasyBook — app settings: opening hours per day (toggle + time range), booking rules (notice, free cancellation, buffer, confirmation mode), automatic reminders… · `BookingSmsSettings` (showcase page) — EasyBook — Settings · "Trimitere SMS": how the business's SMS leave (Ventora, the business phone, or off), the business phone's live state, what happens when th… · `BookingStates` (showcase page) — The states that complete the EasyBook screens, with the approved copy: empty day, nothing that needs you, loading error, appointment marked done (with undo); fi… · `BookingToday` (showcase page) — EasyBook — Today: greeting and the day's sentence, "Au nevoie de tine" (unconfirmed appointments, unpaid visits, reschedule requests, each with its action), the…
- **Founder**: `FounderBusiness` (showcase page) — One business: usage against limits (exceptions included, with the estimated date the limit is reached), per-business exceptions (value, until, reason, who adde… · `FounderBusinesses` (showcase page) — Founder Control Center: every Ventora business with plan version, apps, highest usage, client-since and status · `FounderNewBusiness` (showcase page) — New business + owner invitation in one step: business, plan (always the current version), optional 14-day trial without a card, included apps, owner name and e… · `FounderPacks` (showcase page) — Catalogue of "Pachete în plus": price, periodicity, setup cost, plans where available, direct purchase or on request · `FounderPlanEditor` (showcase page) — Draft of a new plan version with the differences from the current one marked, the price, apps and available "Pachete în plus" · `FounderPlans` (showcase page) — Plans with versions: price, limits, apps, and how many businesses sit on each version · `FounderStates` (showcase page) — States for Stage 5: invitation sent, add exception, publish a plan version, global stop confirmation, publish blocked until RO texts are approved, campaign sto… · `FounderUsage` (showcase page) — Usage monitoring: businesses above 80% of a limit (in attention), charts by resource and by day, and a table with the estimated date each limit is reached · `GrowthAudiences` (showcase page) — Saved audiences: name, rules in short, estimated count only, where they are used · `GrowthCampaignEditor` (showcase page) — Campaign editor: mode (signal or period), offer, slots, eligibility via RuleBuilder (only allowed criteria; the estimate is a count, never a list), priority, t… · `GrowthCampaigns` (showcase page) — Campaigns list: mode (automatic on a signal, or scheduled), offer, slots, disturbance rate and status · `GrowthControl` (showcase page) — Control: global, per-campaign and per-slot kill switches (confirmation, immediate effect; account-limit messages stay), global caps (1 a day, 3 a week, 30 days… · `GrowthOfferEditor` (showcase page) — Offer editor: type, commercial object, action (always opens UpgradeDialog), costs read only from the commercial model, texts in 6 languages with approval statu… · `GrowthOffers` (showcase page) — Offers list: type, action, approved texts out of 6, status · `GrowthResults` (showcase page) — Results: disturbance rate first, in attention against the threshold, then impressions, clicks, conversions, attributed revenue and opt-outs; a weekly chart and…
- **Ecrane Hub**: `HubAccount` (showcase page) — Account settings in the Hub shell: profile, preferences (theme, language), notifications per channel, security (password, two-step sign-in, active sessions) · `HubAddonPurchase` (showcase page) — The extra-pack purchase flow over the plan screen, at desktop (review with a saved card), tablet (processing; payment refused) and phone (success with the limi… · `HubAdminAccess` (showcase page) — Business administration — roles and app access: a role × app matrix on desktop and tablet; on phones you pick a role and switch apps one by one · `HubAdminPlan` (showcase page) — Business administration — plan and usage: the current plan and its apps, the card used for purchases (brand and last four digits, or "Adaugă card"), this month… · `HubAdminTeam` (showcase page) — Business administration for the owner — team and invitations: members with role, apps and status; pending invitations with sent and expiry dates, resend and ca… · `HubChooseBusiness` (showcase page) — Choosing the business for people who belong to several: each row shows the business, your role there, the number of apps and when you last used it · `HubEmpty` (showcase page) — The launcher when no app is available (direction B): the brand band with the date, the greeting and "Bine ai venit în Salon Aurora · `HubInvite` (showcase page) — Accepting an invitation and setting the password: who invited you, the business and your role, the apps you will get, live password requirements (lime when met… · `HubLauncher` (showcase page) — The launcher (direction B "Navy de comandă"): a brand band with the date and business, the greeting and the day's sentence; "Aplicațiile tale" as an AppDock la… · `HubSignIn` (showcase page) — Sign-in, invitation only (direction B): a brand panel on 46% of the width (logo, "Afacerea ta. Într-un singur loc." in display-xl; the title "Bine ai revenit"… · `HubStates` (showcase page) — The states that complete the Hub screens, with the approved copy: sign-in in progress, too many attempts, offline; invitation request sent, cancelled, already… · `HubSupport` (showcase page) — Support: "Solicitările mele" with states (new reply in peach, solved in lime) and a new-request form ("Solicitare nouă")
