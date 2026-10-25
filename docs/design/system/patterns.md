# Patterns

Cum se compun componentele în ecrane. Fiecare regulă de aici se aplică identic în Hub și în toate cele 15 aplicații.

## Structura unui ecran

- **AppShell** = `Spine` (stânga) + `ContextBar` (sus) + conținut. Conținutul începe cu `PageHeader`, apoi una sau mai multe `Sheet` / `DataTable` pe `canvas`.
- **Un singur titlu pe ecran.** Spine numește aplicația, `PageHeader` numește pagina. ContextBar arată afacerea (OrgSwitcher), nu un titlu; pe mobil arată numele aplicației.
- **O singură acțiune principală pe ecran.** În ContextBar ea e „Creează” (meniu cu ce se poate crea în aplicația curentă). Dacă pagina are propria acțiune principală, „Creează” rămâne, iar acțiunile din `PageHeader` sunt secundare. În dialoguri și drawere, primary e butonul din dreapta jos.
- **Sheet-ul e foaia de lucru:** formularele și setările stau într-un `Sheet`, împărțit în `SheetSection` cu titlu. Nu pune carduri în carduri și nu colora secțiunile.

## Navigație

- **Hub → aplicație:** launcher-ul arată „Aplicațiile tale” (AppTile disponibile) și „Alte aplicații Ventora” (fără acces, cu motivul). Click pe AppTile deschide aplicația; în aplicație, numele aplicației din Spine duce înapoi în Hub.
- **Ești aici:** elementul activ din Spine are fundal `selected`, etichetă puternică și bara peach `attention-mark`. E singurul loc unde peach marchează locația. Taburile folosesc sublinierea navy.
- **De la 1024px:** Spine extins. **Tabletă portret 768–1023px:** Spine ca bară de iconuri (tooltip cu numele), căutarea devine icon, OrgSwitcher rămâne în ContextBar. **Telefon sub 768px:** bottom nav cu patru destinații (etichete scurte, `short`) + „Mai multe” (toată navigația pe tot ecranul), ContextBar cu numele aplicației, căutare, „Creează” rotund, notificări, cont; schimbarea afacerii se face din AccountMenu.
- **Căutare globală:** ⌘K / Ctrl+K sau butonul de căutare deschid `CommandPalette` cu pagini, persoane, înregistrări și comenzi (inclusiv „Schimbă afacerea”, „Temă întunecată”).
- **Afaceri multiple:** `OrgSwitcher` în ContextBar arată afacerea curentă și rolul tău în ea. Schimbarea afacerii reîncarcă aplicația în contextul noii afaceri și al rolului de acolo. Pe mobil, schimbarea se face din `AccountMenu`.

## Acces și cont

- **B2B doar prin invitație.** Nu există „Creează cont” și nici „Adaugă afacere”. Afacerile le creează echipa Ventora; proprietarul primește o invitație, apoi își invită echipa. Ecranul de autentificare are doar e-mail, parolă, „Ai uitat parola?” și selectorul de limbă.
- **Cele patru stări ale unei aplicații** (`AppTile` + `AccessBadge`), niciodată confundate:
  - *Disponibilă* — se deschide.
  - *Temporar indisponibilă* — „Lucrăm la ea acum. Revine în curând.” + „Vezi starea”.
  - *Nu e în rolul tău* — „Rolul tău nu include această aplicație. {Nume} îți poate da acces.” + „Cere acces”.
  - *Nu e în abonament* — „Nu e inclusă în abonamentul afacerii. Scrie-ne și o activăm.” + „Scrie-ne”.
  Doar prima se poate deschide. Toate patru sunt neutre: nu sunt nici „atenția ta” (peach), nici „gata” (lime).

## Limite de plan

`UsageMeter` arată consumul liniștit, în patru pași:
1. **Sub 80%:** bară navy, „312 din 1.000 · Mai ai 688”.
2. **De la 80%:** bară peach, „Te apropii de limita abonamentului · Mai ai 138” și „Cumpără un pachet în plus” (secundar). În Spine apare varianta compactă; un Toast `attention` anunță o singură dată.
3. **La 100% — blocare controlată:** „Nu se pierde nimic din ce ai.” Ce există rămâne editabil; doar crearea a ceva nou e oprită. Butonul de creare deschide un Dialog cu `UsageMeter` la limită, nu dispare.
4. **Mai mult:** proprietarul cumpără direct un pachet în plus cu cardul („Cumpără campanii în plus” → AddonPurchase), iar limita crește imediat; ceilalți văd cine poate cumpăra („Pachetele în plus le poate cumpăra doar {nume} (proprietar).”) și pot anunța proprietarul. Schimbarea abonamentului rămâne o cerere („Cere alt abonament”).
Niciodată roșu, niciodată „Eroare”.

## Liste și detalii

- Orice listă de înregistrări e un `DataTable`: căutare și filtre în `toolbar`, filtrele active ca pill-uri care se pot șterge, sortare și paginare pe server (skip/take).
- **Click pe rând → Drawer** cu detaliul, peste listă; rândul deschis e marcat cu `activeRow`. Pe tabletă Drawer-ul e un panou lateral de 560px și lista rămâne vizibilă; pe telefon e un ecran complet cu săgeată înapoi.
- **Selecție → bulk bar** deasupra tabelului cu acțiunile comune; acțiunea distructivă e ultima, în `danger-ink`.
- **Acțiuni pe rând** în kebab (`ellipsis-vertical`): ordinea e deschide → acțiuni frecvente → separator → distructiv.
- **Când tabelul are sub 640px lățime** (pe telefon, sau într-un Drawer îngust) rândurile devin o listă: nume, linia meta (coloanele `secondary`), stare la dreapta, kebab.
- Starea fiecărei înregistrări e un `StatusPill` cu unul din cele patru tonuri; fiecare aplicație își mapează stările pe ele (ex. Booking: „În desfășurare” = attention, „Confirmată” = done, „De plată” = attention, „Anulată” = neutral).

## Formulare

- Fiecare câmp stă într-un `FormField`. Etichetele sunt substantive scurte; placeholderul arată un exemplu, nu repetă eticheta.
- **Obligatoriu:** marchează câmpurile obligatorii cu „*”; dacă aproape toate sunt obligatorii, marchează-le pe cele opționale cu „(opțional)”.
- **Validare:** la ieșirea din câmp și la trimitere, nu la fiecare tastă. Mesajul înlocuiește helperul și spune ce să faci. La trimitere cu erori, focusul merge pe primul câmp greșit.
- **Salvare:** formularele din Drawer și Dialog au butoane în footer (secundar „Renunță”, primary cu verbul: „Salvează programarea”). Setările cu `Toggle` se salvează imediat (spinner în toggle, Toast la eroare).
- **Două coloane** pe desktop și pe tabletă doar pentru câmpuri scurte și înrudite (oră început / oră sfârșit, telefon / e-mail); pe telefon totul e pe o coloană, iar butonul de salvare ocupă toată lățimea la finalul formularului.
- Nu folosi niciodată `<select>` nativ: `Select` pentru liste scurte, `Combobox` pentru liste lungi sau căutare.

## Feedback

- **Acțiune reversibilă → Toast cu „Anulează”**, nu dialog de confirmare: mutare, arhivare, ștergere din coș.
- **Acțiune ireversibilă → Dialog `danger`** cu titlu-întrebare, consecința concretă și butoane cu verbe („Anulează programarea” / „Păstrează programarea”).
- **Încărcare:** `Skeleton` cu forma conținutului care vine; spinner doar în controlul ocupat (`loading`). Peste 10 secunde, `ProgressBar`.
- **Erori:** în câmp (FormField), în listă (EmptyState de eroare cu „Încearcă din nou” și „Scrie-ne”), sau Toast `danger` pentru acțiuni eșuate.
- **Stări goale:** prima utilizare (cu acțiunea de creare), niciun rezultat (cu „Șterge filtrele”), eroare.

## „Azi” și timpul

- Fiecare aplicație cu activitate zilnică începe cu „Azi”: salut în `display-l` + fraza zilei, „Au nevoie de tine” (peach), apoi programul zilei.
- Ce se întâmplă **acum** e peach: linia „acum” din calendar (`attention-mark`), programarea în desfășurare (`StatusPill attention`), ziua de azi din calendar.
- Ce e **gata** e lime: confirmat, plătit, încheiat.

## Limbă, temă, dispozitive

- Limba și tema se schimbă din `AccountMenu` și din setările contului; alegerea se păstrează per utilizator. Tema implicită e „Automată” (urmează setarea dispozitivului).
- Construiește fiecare ecran cu texte germane alături de cele românești: etichetele trec pe două rânduri, butoanele din antete trec sub titlu, taburile se derulează orizontal. Nimic nu are lățime fixă calculată pe textul românesc.
- Fiecare ecran se verifică în light și dark, la 360, 390, 430, 768, 820, 1024, 1180, 1280, 1440 și 1920px: fără scroll orizontal, ținte de atingere ≥44px pe telefon și tabletă, nicio acțiune doar la hover.

## Ecranele Hub

- **Intrarea** e doar prin invitație: autentificare (e-mail, parolă, „Ai uitat parola?”, limbă), acceptarea invitației cu setarea parolei (cerințele parolei se bifează în lime pe măsură ce sunt îndeplinite; invitația expirată spune ce poți face), alegerea afacerii pentru cine are mai multe (fără „Adaugă afacere”).
- **Launcher-ul (direcția B):** antetul și banda de sus sunt o zonă de brand (`BrandZone`). Pe bandă: data și afacerea în `eyebrow`, salutul în `display-l`, fraza zilei în `lead`, cu legăturile ca jetoane (iconul aplicației, textul și, când te așteaptă ceva, punctul peach), apoi titlul „Aplicațiile tale” cu „Reordonează”. Aplicațiile sunt un `AppDock`: rând de iconuri pe o foaie ridicată peste marginea benzii; la hover sau focus iconul se deschide în fișa aplicației. Sub el, Portal are cardul lui (`PortalPresence`). „Alte aplicații Ventora” sunt rânduri compacte, cu numele în față. Deschiderea unei aplicații folosește `AppLaunch` (v2), pornind din cardul apăsat.
- **Pe telefon** banda ține doar data, salutul și fraza zilei; „Aplicațiile tale” stă pe canvas, ca grilă de iconuri; cardul Portal e compact, cu butoanele unul sub altul.
- **Autentificarea (direcția B):** panoul de brand ocupă 46% din lățime pe desktop (logo, „Afacerea ta. Într-un singur loc.” în `display-xl`, modelul de chevroni, „© 2026 Ventora Systems”); formularul stă pe `sheet`, fără card. Pe telefon panoul devine o bandă sus, cu logo-ul și limba, iar formularul urcă peste ea.
- **Starea goală:** banda și salutul rămân (fraza zilei devine „Bine ai venit în Salon Aurora. Aplicațiile apar aici imediat ce primești acces.”), EmptyState urcă peste marginea benzii, spune cine alege aplicațiile și oferă „Cere acces”.
- **Setări și administrare** folosesc AppShell cu Spine-ul Hub (`hub`): Contul tău (profil, preferințe, notificări, securitate), Afacerea — doar pentru proprietar (echipă și invitații, roluri și acces la aplicații, abonament și consum), Suport (solicitările mele + solicitare nouă; „Îți răspundem în cel mult o zi lucrătoare.”).
- **Accesul la aplicații** se editează ca matrice rol × aplicație pe desktop și tabletă; pe telefon alegi rolul și comuți aplicațiile una câte una. Aplicațiile din afara abonamentului sau temporar indisponibile apar cu AccessBadge și nu se pot bifa.
- **Abonamentul** se schimbă doar prin cerere către echipa Ventora („Cere alt abonament”).
- **Pachetele în plus** le cumpără proprietarul direct, cu cardul afacerii: „Cumpără · 49 lei” deschide AddonPurchase (cantitate, total, cardul salvat — doar ultimele 4 cifre — sau locul formularului Stripe, „Plătește X lei”), apoi „Procesăm plata…”, reușește („Limita a crescut deja.”, apare factura) sau eșuează („Banca spune: …”, „Nu ți s-a retras niciun ban de pe card.”, ce poți face). Pachetele „Doar la cerere” și orice pachet cât timp afacerea nu are card salvat rămân „Cere activare”. Fiecare cumpărătură are factura ei („Pachet în plus · 500 SMS”).
- **Datele cardului** nu trec niciodată prin componentele Ventora: formularul e al Stripe și se montează în `StripeSlot`.

## În interiorul aplicațiilor (Booking ca model)

Fiecare aplicație urmează aceeași schemă; Booking e modelul.

- **Azi** e primul element din Spine: salut + fraza zilei, „Au nevoie de tine” (AttentionList, 3–5 lucruri cu acțiunea lor), ce e „în desfășurare” (peach, cu timpul scurs) și programul zilei (Agenda cu linia „acum”). Pe desktop atenția stă în dreapta; pe tabletă și telefon vine prima.
- **Calendarul** folosește Schedule: zi, săptămână și resurse (camere, echipamente sau spații pe care le rezervă clienții, definite în Setări → Resurse). Linia „acum” e peach; programările din trecut sunt stinse, cea în desfășurare e peach, cele neconfirmate au contur punctat. Click pe un spațiu liber creează o programare la ora aceea.
- **Lista** e un DataTable cu filtre ca pill-uri, selecție și bulk bar; coloanele secundare sunt `optional` ca să încapă pe tabletă. Click pe rând → Drawer cu detaliul.
- **Crearea** e o pagină, nu un dialog, când are mai mult de 4–5 câmpuri: formular în Sheet + rezumat cu prețul. Orele libere se aleg cu SlotPicker. Pe telefon acțiunile stau fixate jos.
- **Setările aplicației** sunt ultimul element din Spine, în taburi; consumul legat de o setare (SMS-urile reamintirilor) apare lângă ea.
- **Limita atinsă** apare în momentul creării, ca dialog, nu ca eroare: ce există rămâne la locul lui; proprietarul cumpără pe loc, ceilalți află cine poate.
- **Anularea** e mereu „Anulează programarea” (cu obiect), confirmată într-un dialog al cărui buton sigur spune ce păstrează („Păstrează programarea”). Dialogul spune că pleacă un mesaj către client doar dacă notificarea e pornită în setările afacerii, pe canalul ales (SMS sau e-mail). Textul pentru clienți depinde de setarea afacerii: fără taxă — „Clienții pot anula online cu cel puțin 24 de ore înainte.”; cu taxă — „Anulare gratuită cu cel puțin 24 de ore înainte. După aceea se reține {suma}.”
- **Stările fiecărui ecran** se desenează înainte ca ecranul să fie gata: gol, încărcare, eroare, succes, confirmare, limită atinsă, acces lipsă (vezi HubStates și BookingStates).

## Celelalte aplicații — ecranele reprezentative

Toate stau pe același shell și folosesc aceleași piese ca Booking; diferă doar conținutul.

- **Panou pe etape** (CRM — pipeline, Projects — sarcini): `Kanban`. Fiecare coloană are numărul de carduri și, unde contează, valoarea; „Gata” și „Câștigate” poartă bifa lime. Mutarea se face și din meniul cardului („Mută în „…””), nu doar prin tragere. Sub 640px se vede o etapă odată, aleasă din bara de etape.
- **Cronologie** (Projects): `Timeline` — etapele ca bare pe săptămâni, eticheta lângă bară, linia de azi peach, lansarea ca romb. Etapele întârziate sunt peach („Întârziată 2 zile”), cele gata lime, cu bifă.
- **Cifrele de sus** (HR, Finance, Analytics): 3–4 `Stat` într-un rând (`v-stats`), apoi lista sau graficele. Peach pe un Stat doar când cifra cere o acțiune (restanțe).
- **„Au nevoie de tine”** e aceeași AttentionList în toate aplicațiile: concedii de aprobat, pontaje de corectat, facturi restante. Lângă tabel pe desktop când tabelul are puține coloane (Finance); deasupra lui când tabelul are nevoie de toată lățimea (HR).
- **Stări în tabele:** „La lucru” și „Scadentă azi” sunt peach (acum), „Plătită” lime, „Epuizat” și „Absență” roșu (o problemă reală), „Sub minim” și „Restantă” peach (de făcut ceva, nu o eroare), „Concediu” și „Comandat” neutre. Întârzierile mici sunt text `attention-ink`, nu alarme.

## Date vizuale

- **Forma întâi:** o singură cifră → `Stat`; evoluție în timp → `LineChart`; comparație între categorii → `BarChart` orizontal, sortat descrescător; zile sau perioade → `BarChart` vertical.
- **Culoare:** o serie = `chart-1`. Comparația (anul trecut, perioada anterioară) e mereu gri, `chart-compare`. Perioada în curs e peach, `chart-now`, cu linie punctată spre ea. Mai multe serii folosesc `chart-1` … `chart-5` în ordinea fixă; a șasea devine „Altele”. Peach și lime nu sunt niciodată culori de serie.
- **Mărci:** bare de cel mult `chart-bar-max` (24px), cu capătul rotunjit de 4px și baza dreaptă; linii de `chart-line-width` (2px); puncte de `chart-marker` (8px) cu inel în culoarea suprafeței; grilă `chart-grid` de 1px; axa de bază `chart-axis`.
- **Text:** etichetele și valorile sunt în `ink` / `chart-label`, niciodată în culoarea seriei. Legendă doar de la două serii; o serie se numește din titlu.
- **O singură axă.** Două măsuri diferite înseamnă două grafice.
- **Fiecare grafic** are tooltip la hover și focus și „Vezi ca tabel”, ca datele să fie accesibile fără culoare și fără mouse.

## Scriere și microcopy

- **Glosarul** (`glossary.md`, cardul Glosar) e sursa unică pentru termeni, în 6 limbi. Un termen nou intră întâi acolo.
- **Fluxul pentru fiecare ecran sau componentă nouă:** prezinți ecranul; extragi toate textele vizibile din toate stările; propui textele revizuite; marchezi ce cere o decizie; ecranul e gata doar după aprobarea textelor.
- **Ton:** prietenos la intrare și în stările goale; precis în Finance, HR și Contracts; calm în erori; fără umor în mesajele critice.
- **Reguli fixe:** diateza activă („Am emis factura”); plural ICU cu cele trei forme românești („1 necitită”, „2 necitite”, „20 de necitite”); fără dativ și fără gen lângă un nume din date („Trimitem cererea către {nume}”, „{nume} (proprietar)”); cantitățile cu cifre; fără calchieri din engleză („captură de ecran”, nu „print screen”).


## Comercial (recomandări)

- **Discret și util, nu insistent.** O recomandare arată ca o informație bună la momentul potrivit: e legată de ce face deja afacerea și are mereu eticheta neutră „Recomandare”.
- **Unde apare:** doar în locurile permise, prin `GrowthSlot` (coloana din „Azi”, setări), în secțiunea „Recomandări” din notificări, în launcher la „Alte aplicații Ventora” și în catalog. **Niciodată** în formulare în lucru, plăți, erori, confirmări, autentificare sau în acțiunile sensibile din Finance, HR și Contracts. Un tooltip de descoperire pe ecran, cel mult.
- **Doar aplicații nedeținute.** O aplicație din abonament nu e niciodată recomandare.
- **Închiderea e mereu la vedere** pe recomandările care vin singure: „Nu mă interesează” și „Amintește-mi mai târziu”, fiecare cu un Toast care se poate anula.
- **Costul e întreg înainte de confirmare:** preț, cât de des se plătește, costul de implementare, condițiile perioadei de probă („Gratuit 14 zile. Apoi 79 lei pe lună, doar dacă alegi să continui.”).
- **Nicio activare dintr-un click:** recomandarea deschide `UpgradeDialog`; plata sau perioada de probă se confirmă într-un pas separat. Schimbarea abonamentului rămâne o cerere.
- **Rolul decide acțiunea:** proprietarul (și adminul cu drept de cumpărare) cumpără, încearcă sau cere; ceilalți văd opțiunile și „Recomandă aplicația”, cu „Ajunge la {nume} (proprietar).”. Adminul primește recomandările echipei în notificări („Vezi aplicația” / „Respinge”). Membrul vede starea fiecărei recomandări („În așteptare”, „Activată”, „Nu acum”) și primește notificare doar la activare.
- **Perioada de probă** nu cere card și nu trece singură la plată: la final aplicația se oprește, datele rămân, iar continuarea e o alegere explicită.
- **Plafoane:** cel mult un slot comercial pe ecran; global 1 pe zi și 3 pe săptămână; o respingere ține 30 de zile. Când plafonul e atins, slotul nu se afișează deloc.
- **Catalogul** se deschide din launcher („Vezi toate aplicațiile Ventora”), din paleta de comenzi și din meniul contului.
- **Fără dark patterns:** fără numărători inverse, fără „ultimele locuri”, fără refuz culpabilizant, fără opțiuni pre-bifate, fără culori de brand ca decor (navy doar pe acțiunea principală, peach doar pentru limită și „acum”).
- **Preferințe:** în Contul tău → Notificări, „Recomandări Ventora” se pot opri; mesajele despre limitele contului rămân, pentru că sunt informații despre cont.

## Founder Control Center și Growth

Instrumentul intern al echipei Ventora, pe același shell: Spine cu semnul Ventora și numele „Founder”, secțiuni Afaceri · Consum · Model comercial · Growth · Sistem.
- **Afaceri:** lista arată întâi ce cere atenție (plăți eșuate, limite, probe care se încheie), apoi alfabetic; cifrele de sus filtrează lista. La o afacere nouă, un CUI sau un e-mail de proprietar deja folosit dă un avertisment (nu o blocare). O afacere nouă se creează împreună cu invitația proprietarului; contul se face doar din invitație, iar previzualizarea arată exact e-mailul.
- **Excepții per afacere:** au mereu valoare, termen (cel mult 12 luni, prelungibil), motiv și autor; intră în jurnal; cu 7 zile înainte de expirare apar în Prezentare; „Încheie excepția acum”, nu „Șterge”. Suspendarea unei afaceri cere numele ei scris.
- **Planuri cu versiuni:** orice schimbare de preț sau de limite face o versiune nouă, cu creșterile și scăderile marcate față de versiunea curentă. Afacerile noi pornesc pe versiunea curentă; celelalte rămân unde sunt până le muți. Mutarea e o acțiune separată de publicare: dacă e în dezavantajul clientului (preț mai mare sau mai puțin inclus), anunțul pleacă cu 30 de zile înainte; dacă e doar în avantajul lui, se aplică imediat, tot cu anunț. Prețurile pachetelor în plus se scriu într-un singur loc și apar de acolo în toate ofertele.
- **Oferte:** tip, obiect comercial, acțiune (mereu prin UpgradeDialog), costuri citite din modelul comercial, texte în 6 limbi cu stare de aprobare. Titlul are cel mult 48 de caractere; textele se verifică față de glosar. Într-o limbă fără text aprobat oferta nu apare deloc (nu cade pe altă limbă).
- **Campanii:** automat (semnal) sau programat (perioadă); ofertă, sloturi, eligibilitate cu RuleBuilder, prioritate. Criteriile sensibile nu există ca opțiune. Eligibilitatea e doar un număr estimat. Membrii pot fi audiență doar pentru „Recomandă aplicația”, niciodată pentru oferte de cumpărare. Două campanii pe același slot și aceeași audiență dau un avertisment cu prioritatea care câștigă. Publicarea cere textele în română aprobate.
- **Audiențe:** segmente salvate, doar cu numărul estimat; sub 5 afaceri numărul nu se arată și audiența nu se poate folosi într-o campanie.
- **Rezultate:** rata de deranjare („Nu mă interesează” la 100 de afișări) e prima, în atenție, lângă prag; „Nu mă interesează” apare și ca cifră separată. Venitul atribuit = conversii în 7 zile de la click.
- **Control:** oprire globală, pe campanie și pe slot, cu confirmare și efect imediat (pornirea la loc nu cere confirmare); comutatoarele spun starea în cuvinte. Plafoane globale implicite 1 pe zi, 3 pe săptămână, 30 de zile după „Nu mă interesează”; maximele permise sunt 2 pe zi, 5 pe săptămână și cel puțin 14 zile. Prag de oprire automată 5%, pentru campaniile automate și cele programate; la oprire, Founder primește o notificare. Jurnalul păstrează toate schimbările. Mesajele despre limitele contului nu sunt recomandări și nu se opresc de aici.

## Review de produs (Product Experience)

Fiecare ecran nou primește o fișă scurtă înainte să fie gata:
- **Cele 10 întrebări:** obiectivul utilizatorului; obiectivul de business și alinierea lor; ce se vede în primele secunde; acțiunea principală; ce e esențial; barierele; încrederea; formulările; oportunitățile legitime (onboarding, activare, retenție, descoperire, upsell); cum măsurăm.
- **Review-ul în 5 etape:** A Functional UX · B Behavioral & Cognitive · C Marketing & Conversion · D UX Writing & Microcopy · E Accessibility & Trust. Fiecare modificare propusă are o propoziție despre de ce e utilă.
- **Reguli:** fără principii aplicate mecanic; fără pop-up-uri sau elemente comerciale fără context; fără dark patterns; eficiența omului înaintea conversiei; orice upsell sau cross-sell doar ca slot Growth Engine; funcționalitățile aprobate nu se schimbă prin review.

## Măsurare comună

Aceleași evenimente în toate aplicațiile, ca cifrele să se poată compara. Instrumentul de analytics se alege separat.
- ecran deschis și timpul până la prima acțiune principală;
- acțiune principală finalizată sau abandonată;
- eroare afișată (pe tip) și reușita după eroare;
- pentru sloturile comerciale: afișare, „Vezi detaliile”, „Nu mă interesează”, „Amintește-mi mai târziu”, conversie și rata de deranjare („Nu mă interesează” la 100 de afișări), care alimentează plafoanele din Founder Control Center.
