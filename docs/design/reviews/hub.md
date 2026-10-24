# Hub — 11 fișe

## 1. Autentificare — HubSignIn

Ecranul e scurt și corect. Recomand doar mici ajustări care scurtează intrarea și previn blocarea contului.

| Întrebare | Răspuns |
| --- | --- |
| Obiectivul utilizatorului | Să intre repede în cont, fără să se blocheze. |
| Obiectivul de business și alinierea | Acces sigur și cât mai puține solicitări de tip „nu pot intra”. Aliniate complet. |
| Primele secunde | Logo, „Bine ai revenit”, cele două câmpuri, „Intră în cont”. |
| Acțiunea principală | „Intră în cont”. |
| Esențial | E-mail, parolă, „Ai uitat parola?”, limba. Nota despre invitații și subsolul sunt secundare. |
| Bariere | Parola uitată, tastatura nepotrivită pe telefon, blocarea după prea multe încercări, căutarea unui buton de înscriere care nu există. |
| Încredere | Brandul, un mesaj de eroare care nu acuză, linkul de confidențialitate. |
| Formulări | Aprobate. |
| Oportunități | Niciuna comercială: autentificarea e loc interzis pentru Growth Engine. |
| Măsurare | Rata de reușită la prima încercare; „Ai uitat parola?” la 100 de intrări; timpul până la launcher. |

| Etapă | Modificare | De ce |
| --- | --- | --- |
| A | Câmpurile primesc `type=email`, `autocomplete=username` și `current-password`; Enter trimite formularul. | Managerele de parole și tastatura potrivită scurtează intrarea, mai ales pe telefon. |
| A | După a doua încercare greșită, mesajul de eroare include linkul „Ai uitat parola?”. | Omul ajunge la soluție înainte de blocare, nu după. |
| B | „Ține-mă minte pe acest dispozitiv” rămâne nebifat implicit. | E alegerea omului și protejează calculatoarele comune de la recepție. |
| C | Nimic. | Ecranul nu vinde. |
| D | Nimic nou. | Textele sunt aprobate. |
| E | Eroarea e anunțată de cititorul de ecran (`aria-live`), iar focusul revine pe primul câmp greșit. | Cine folosește cititor de ecran află imediat ce s-a întâmplat. |

**Decizie P1.** „Ține-mă minte” spune cât ține (de exemplu, „…timp de 30 de zile”)? Recomand da: omul știe la ce să se aștepte.

## 2. Invitație — HubInvite

Invitația spune clar cine te cheamă și ce vei face. Cel mai mult câștigăm după accept: primul ecran trebuie să fie locul de lucru al rolului.

| Întrebare | Răspuns |
| --- | --- |
| Obiectivul utilizatorului | Să intre în echipă și să înceapă lucrul, înțelegând ce rol are. |
| Obiectivul de business și alinierea | Activarea invitaților: fiecare cont activ crește valoarea pentru afacere. Aliniate. |
| Primele secunde | Cine a invitat, numele afacerii, rolul și aplicațiile. |
| Acțiunea principală | „Acceptă invitația”. |
| Esențial | Numele, parola, termenii. |
| Bariere | Regulile parolei, parola tastată de două ori, invitația expirată. |
| Încredere | Numele persoanei care invită, numele afacerii, data de expirare. |
| Formulări | Aprobate. |
| Oportunități | Onboarding: după accept, un singur DiscoveryTooltip în aplicația principală a rolului. Nimic comercial. |
| Măsurare | Invitații acceptate în 7 zile; timpul de la deschiderea linkului la primul ecran de lucru; cereri de invitație nouă. |

| Etapă | Modificare | De ce |
| --- | --- | --- |
| A | E-mailul apare ca text, nu ca câmp editabil. | Contul se face pe adresa invitată și nu pe una greșită. |
| B | „Repetă parola” dispare; câmpul de parolă are „Arată parola”. | Dispare o tastare dublă, iar lista de reguli arată deja când parola e bună. |
| B | După accept, omul ajunge direct în aplicația principală a rolului (Booking pentru Recepție). | Primul minut e lucru, nu căutare în launcher. |
| C | Nimic. | Momentul e despre intrare, nu despre vânzare. |
| D | Nimic nou. | Textele sunt aprobate. |
| E | Regulile parolei sunt anunțate pe măsură ce se bifează (`aria-live="polite"`). | Progresul se aude, nu doar se vede. |

**Decizie P2.** Renunțăm la „Repetă parola” în favoarea lui „Arată parola”? Recomand da.

**Decizie P3.** După accept, invitatul intră direct în aplicația principală a rolului, nu în launcher? Recomand da, cu launcher-ul la un click.

## 3. Alegerea afacerii — HubChooseBusiness

Ecranul e un pas de trecere și trebuie să fie cât mai rapid. Recomand căutarea pentru liste lungi și deschiderea cu Enter.

| Întrebare | Răspuns |
| --- | --- |
| Obiectivul utilizatorului | Să ajungă în afacerea în care lucrează azi. |
| Obiectivul de business și alinierea | Claritate pentru oamenii care lucrează în mai multe afaceri. Nimic de vândut. Aliniate. |
| Primele secunde | Lista afacerilor, cu rolul și „Ultima folosită”. |
| Acțiunea principală | Alegerea unei afaceri (tot rândul e buton). |
| Esențial | Numele afacerii, rolul, ultima folosită. |
| Bariere | Multe afaceri; nume asemănătoare. |
| Încredere | Inițialele sau logo-ul afacerii și rolul pe fiecare rând. |
| Formulări | Aprobate. |
| Oportunități | Retenție: „Deschide direct ultima afacere data viitoare” scoate un pas. Nimic comercial. |
| Măsurare | Câți bifează deschiderea directă; timpul până la intrare. |

| Etapă | Modificare | De ce |
| --- | --- | --- |
| A | Căutare peste 6 afaceri. | Într-o listă lungă găsești mai repede tastând. |
| B | Ultima afacere folosită stă prima și are focusul; Enter o deschide. | Cazul cel mai frecvent cere o singură apăsare. |
| C | Nimic. | Pas de trecere. |
| D | Nimic nou. | Textele sunt aprobate. |
| E | Fiecare rând are nume accesibil complet: „Salon Aurora, Proprietar, deschisă azi la 09:12”. | Cititorul de ecran spune tot rândul, nu doar numele. |

Fără decizii.

## 4. Launcher — HubLauncher

Launcher-ul e ecranul de fiecare zi, așa că aici contează cel mai mult ca aplicațiile tale să rămână în prim-plan. Fraza zilei poate deveni o listă de scurtături. Recomandarea pentru Marketing trece într-un slot comercial, cu plafoane, doar pentru proprietar și admin (ai cerut-o în mesajul tău; o aplic împreună cu stările lipsă).

| Întrebare | Răspuns |
| --- | --- |
| Obiectivul utilizatorului | Să vadă ce are de făcut azi și să deschidă aplicația potrivită dintr-un click. |
| Obiectivul de business și alinierea | Folosire zilnică (retenție) și descoperirea aplicațiilor nedeținute. Aliniere parțială: descoperirea nu trebuie să împingă în jos aplicațiile tale. |
| Primele secunde | Salutul, fraza zilei, „Aplicațiile tale”. |
| Acțiunea principală | Deschiderea unei aplicații sau a unui lucru din fraza zilei. |
| Esențial | Aplicațiile tale cu contoarele lor. „Alte aplicații Ventora” e secundar. |
| Bariere | Fraza zilei nu duce nicăieri; „Alte aplicații” ocupă la fel de mult loc ca aplicațiile tale. |
| Încredere | Motivul scris pe fiecare aplicație blocată; nimic ascuns. |
| Formulări | Aprobate. |
| Oportunități | Descoperire: o singură CatalogRecommendation printr-un slot, doar pentru proprietar și admin. Activare: contoarele. Retenție: fraza zilei cu scurtături. |
| Măsurare | Timpul până la prima aplicație deschisă; sesiuni care folosesc fraza zilei; „Vezi detaliile” față de „Nu mă interesează” (rata de deranjare). |

| Etapă | Modificare | De ce |
| --- | --- | --- |
| A | Fraza zilei are linkuri: „8 programări” → Booking · Azi; „2 facturi scadente” → Finance; „o cerere de concediu” → HR. | Rezumatul devine scurtătură spre ce ai de făcut. |
| B | Pe desktop, „Alte aplicații Ventora” trec în rânduri compacte, sub aplicațiile tale. | Aplicațiile de zi cu zi rămân în prim-plan. |
| C | Recomandarea din launcher trece într-un GrowthSlot: doar pentru proprietar și admin, cu „Nu mă interesează”, „Amintește-mi mai târziu” și plafoanele globale; cel mult una pe ecran. | Descoperirea rămâne utilă și controlată de om, nu un element fix al ecranului. |
| D | Nimic nou. | Textele sunt aprobate. |
| E | Ordinea tab: aplicațiile tale înaintea celorlalte și înaintea slotului comercial. | Cine navighează cu tastatura ajunge întâi la lucru. |

**Decizie P4.** Ordinea aplicațiilor: fixă, cu reordonare manuală, sau după frecvență? Recomand fixă cu reordonare manuală: iconițele care se mută singure strică memoria locului.

## 5. Nicio aplicație — HubEmpty

Ecranul explică bine de ce nu vezi nimic. Lipsește doar urma cererii: după ce o trimiți, ecranul trebuie să spună că a plecat.

| Întrebare | Răspuns |
| --- | --- |
| Obiectivul utilizatorului | Să afle de ce nu vede nicio aplicație și cum primește acces. |
| Obiectivul de business și alinierea | Activarea contului nou. Aliniate. |
| Primele secunde | Salutul, starea goală, „Cere acces”. |
| Acțiunea principală | „Cere acces”. |
| Esențial | Cine decide și butonul. |
| Bariere | Nu știe dacă cererea a plecat; așteaptă fără semn. |
| Încredere | Numele persoanei care decide. |
| Formulări | Aprobate. |
| Oportunități | Activare: starea „Am trimis cererea” (desenată în HubStates). Nimic comercial: membrul nu cumpără. |
| Măsurare | Timpul de la cerere la primul acces; cereri repetate. |

| Etapă | Modificare | De ce |
| --- | --- | --- |
| A | După cerere, butonul devine „Cerere trimisă · 22 oct.” și nu mai poate fi apăsat. | Nu mai pleacă cereri duble, iar omul vede când a cerut. |
| B | Sub starea goală, o legătură discretă spre „Contul tău” (fotografie, limbă). | Așteptarea devine timp util, fără să inventeze lucru. |
| C | Nimic. | Membrul nu cumpără. |
| D | Nou: „Cerere trimisă · {data}”. | Textul stării de după cerere. |
| E | Starea „Am trimis cererea” anunțată de cititorul de ecran. | Confirmarea nu e doar vizuală. |

Fără decizii.

## 6. Contul tău — HubAccount

Pagina are tot ce trebuie, dar pe telefon e lungă. Recomand o listă de secțiuni pe telefon și o sugestie discretă pentru autentificarea în doi pași.

| Întrebare | Răspuns |
| --- | --- |
| Obiectivul utilizatorului | Să-și ajusteze datele, aspectul, notificările și securitatea fără să caute. |
| Obiectivul de business și alinierea | Încredere și notificări reglate fin, ca oamenii să nu le oprească pe toate. Aliniate. |
| Primele secunde | Profilul. |
| Acțiunea principală | Nu există una singură; fiecare secțiune are salvarea ei. |
| Esențial | Limba, tema, notificările, parola. |
| Bariere | Pagina lungă pe telefon; tabelul notificărilor, 4 × 3, pe ecran mic. |
| Încredere | Dispozitivele conectate, autentificarea în doi pași, recomandările care se pot opri. |
| Formulări | Aprobate. |
| Oportunități | Retenție: notificări reglate fin. Comercial: doar preferința „Recomandări Ventora”. |
| Măsurare | Câți au autentificarea în doi pași; dezactivări pe tip de notificare; opriri ale recomandărilor. |

| Etapă | Modificare | De ce |
| --- | --- | --- |
| A | Pe telefon, secțiunile devin o listă (Profil, Preferințe, Notificări, Recomandări, Securitate), fiecare cu pagina ei. | Mai puțin scroll; omul intră direct unde vrea. |
| B | Tema și limba se aplică imediat, fără „Salvează”. | Vezi efectul pe loc și poți reveni la fel de ușor. |
| B | Dacă autentificarea în doi pași e oprită, Securitatea are un Notice neutru cu „Pornește-o”. | Crește securitatea fără presiune și fără pop-up. |
| C | Nimic nou. | Preferința comercială există deja. |
| D | Nou: „Autentificarea în doi pași e oprită. Cu ea pornită, contul e greu de folosit de altcineva, chiar dacă află parola.” + „Pornește-o”. | Spune beneficiul concret, fără alarmă. |
| E | Tabelul notificărilor leagă fiecare bifă de rând și coloană (deja), iar pe telefon devine listă cu trei comutatoare pe rând. | Se folosește ușor și cu degetul, și cu cititorul de ecran. |

**Decizie P5.** Autentificarea în doi pași e obligatorie pentru proprietar? Recomand da: proprietarul poate plăti și schimba accesul altora.

## 7. Echipa — HubAdminTeam

Lista e clară. Limita de angajați trebuie să se vadă înainte de invitație, nu după, iar invitațiile expirate trebuie să se poată retrimite dintr-un click.

| Întrebare | Răspuns |
| --- | --- |
| Obiectivul utilizatorului (proprietar) | Să vadă cine are acces și să invite repede. |
| Obiectivul de business și alinierea | Mai mulți utilizatori activi; locurile din abonament. Aliniate, dacă limita e la vedere. |
| Primele secunde | Lista membrilor și „Invită o persoană”. |
| Acțiunea principală | „Invită o persoană”. |
| Esențial | Numele, rolul, starea. |
| Bariere | Limita de angajați descoperită abia după completarea invitației; invitații expirate. |
| Încredere | Oprirea accesului se confirmă, iar datele rămân. |
| Formulări | Aprobate. |
| Oportunități | Upsell legitim, doar când e nevoie: la limită, „Invită o persoană” deschide UpgradeDialog (pachetul „5 angajați în plus”). |
| Măsurare | Invitații trimise și acceptate; timpul până la prima invitație într-o afacere nouă. |

| Etapă | Modificare | De ce |
| --- | --- | --- |
| A | „Retrimite” stă la vedere pe invitațiile expirate, nu doar în meniu. | E acțiunea cea mai frecventă pe ele. |
| A | Consumul de locuri („10 din 10 angajați”) stă lângă „Invită o persoană”. | Limita se vede înainte de formular, nu după. |
| C | La limită, „Invită o persoană” deschide UpgradeDialog, nu un formular care eșuează la final. | Drumul spre soluție, fără muncă pierdută. |
| D | Nou: „Retrimite”; „10 din 10 angajați”. | Texte scurte, din glosar. |
| E | În dialogul de oprire a accesului, focusul pornește pe „Renunță”. | Acțiunea are efect imediat; Enter din greșeală nu trebuie să o pornească. |

**Decizie P6.** Invitațiile expirate se șterg singure după 30 de zile? Recomand da: lista rămâne curată, iar istoricul păstrează urma.

## 8. Roluri și acces — HubAdminAccess

Matricea e corectă, dar fiecare bifă are efect imediat pentru toți. Lipsesc o cale de întoarcere și o privire în ce vede un rol.

| Întrebare | Răspuns |
| --- | --- |
| Obiectivul utilizatorului | Să stabilească cine vede ce, fără greșeli. |
| Obiectivul de business și alinierea | Mai puține cereri de acces și de suport. Aliniate. |
| Primele secunde | Matricea rol × aplicație. |
| Acțiunea principală | O bifă în matrice. |
| Esențial | Rolurile, aplicațiile, bifele. |
| Bariere | Efectul imediat pentru toți (teamă de greșeală); nu vezi ce va vedea un rol. |
| Încredere | Proprietarul păstrează mereu accesul; aplicațiile din afara abonamentului nu se pot bifa din greșeală. |
| Formulări | Aprobate. |
| Oportunități | Descoperire: aplicațiile din afara abonamentului apar cu AccessBadge (deja). Niciun slot comercial: e un ecran de configurare. |
| Măsurare | Cereri de acces după schimbări; schimbări anulate. |

| Etapă | Modificare | De ce |
| --- | --- | --- |
| A | După fiecare bifă, un Toast „Am dat acces la HR pentru Recepție” cu „Anulează”. | O schimbare cu efect imediat cere o cale de întoarcere la fel de rapidă. |
| B | „Vezi ca Recepție”: previzualizarea launcher-ului pentru un rol. | Proprietarul vede rezultatul înainte să-l afle de la colegi. |
| C | Nimic. | Ecran de configurare. |
| D | Nou: „Am dat acces la {aplicație} pentru {rol}.” / „Am scos accesul la {aplicație} pentru {rol}.” · „Vezi ca {rol}”. | Fraze cu variabile întregi, ușor de localizat. |
| E | Grila se parcurge cu săgețile, iar fiecare celulă are nume complet (deja). | Matricea se folosește integral de la tastatură. |

**Decizie P7.** Adăugăm „Vezi ca {rol}”? E o funcționalitate nouă. Recomand da.

## 9. Abonament și consum — HubAdminPlan

Pagina e despre bani, așa că vinde legitim. Totuși, ce cere acțiune trebuie să urce primul, iar ofertele să răspundă consumului real.

| Întrebare | Răspuns |
| --- | --- |
| Obiectivul utilizatorului | Să știe ce plătește, cât a consumat și să rezolve repede o limită. |
| Obiectivul de business și alinierea | Venit din pachete și încredere în facturare. Aliniate când prețurile sunt clare. |
| Primele secunde | Abonamentul și prețul, apoi consumul. |
| Acțiunea principală | Contextuală: „Cumpără” pe consumul aproape de limită. |
| Esențial | Consumul, limitele, facturile. |
| Bariere | Lipsa cardului; prea multe pachete afișate deodată. |
| Încredere | Prețul final fără TVA adăugat, factura pentru fiecare cumpărătură, data reînnoirii. |
| Formulări | Aprobate. |
| Oportunități | Upsell legitim: o RecommendationCard într-un slot, doar pentru pachetul care rezolvă un consum de peste 80%. |
| Măsurare | Cumpărături din pagină față de cele din dialogul de limită; erori de plată; descărcări de facturi. |

| Etapă | Modificare | De ce |
| --- | --- | --- |
| A | Consumul aproape de limită urcă primul în lista de consum. | Ce cere acțiune se vede în primele secunde. |
| A | Fiecare factură are „Descarcă” direct, nu doar în meniu. | E motivul principal pentru care se deschide lista de facturi. |
| C | Pachetele sunt ordonate după relevanță: cel legat de un consum de peste 80% vine primul, prin slot. | Oferta răspunde unei nevoi reale, nu unui catalog. |
| D | Nou: „La ritmul de acum, ajungi la limită pe 27 octombrie.” (dacă aprobi P8). | Estimarea spune când, nu doar cât. |
| E | Prețurile se citesc complet de cititorul de ecran: „49 lei, valabil luna aceasta”. | Separatorul „·” nu se pronunță clar. |

**Decizie P8.** Afișăm estimarea datei la care se atinge limita? E o funcționalitate nouă. Recomand da, doar de la 50% consum.

## 10. Cumpărarea unui pachet — HubAddonPurchase

Fluxul de plată e sigur și transparent. Mai sunt de prevenit două lucruri: un card expirat, descoperit abia la plată, și o cantitate implicită care nu se potrivește nevoii.

| Întrebare | Răspuns |
| --- | --- |
| Obiectivul utilizatorului | Să cumpere exact cât îi trebuie, în siguranță. |
| Obiectivul de business și alinierea | Plăți finalizate, fără abandon. Aliniate. |
| Primele secunde | Pachetul, prețul, totalul. |
| Acțiunea principală | „Plătește X lei”. |
| Esențial | Cantitatea, totalul, cardul. |
| Bariere | Card expirat; verificarea băncii (3-D Secure). |
| Încredere | Formularul Stripe, „Nu ți s-a retras niciun ban de pe card”, factura emisă imediat. |
| Formulări | Aprobate. |
| Oportunități | Niciuna în plus: plata e loc interzis pentru cross-sell. |
| Măsurare | Rata de finalizare; erorile pe tip; timpul de la deschidere la succes. |

| Etapă | Modificare | De ce |
| --- | --- | --- |
| A | Cardul care expiră luna aceasta e semnalat înainte de plată. | Eroarea se previne, nu se explică după. |
| A | După succes, când dialogul a pornit dintr-o limită, butonul principal reia acțiunea întreruptă („Adaugă programarea”). | Omul revine la ce făcea, fără să caute. |
| B | Cantitatea implicită e cea care acoperă nevoia estimată, nu maximul. | Fără umflare artificială a coșului. |
| C | Nimic. | Plata nu primește oferte. |
| D | Nou: „Cardul expiră luna aceasta. Poți plăti cu el acum sau îl schimbi.” | Avertizare calmă, cu ambele variante. |
| E | Focusul trece pe titlul dialogului la procesare, succes și eroare; procesarea e anunțată (`aria-busy`). | Schimbarea de stare se aude. |

Fără decizii.

## 11. Suport — HubSupport

Formularul e clar, dar cere omului să spună ce știm deja. Contextul din aplicație ar trebui să vină completat.

| Întrebare | Răspuns |
| --- | --- |
| Obiectivul utilizatorului | Să rezolve o problemă sau să primească un răspuns repede. |
| Obiectivul de business și alinierea | Rezolvare rapidă și mai puține solicitări repetate. Aliniate. |
| Primele secunde | Solicitările tale, cu stările lor, și „Solicitare nouă”. |
| Acțiunea principală | „Solicitare nouă”, apoi „Trimite”. |
| Esențial | Aplicația, subiectul, descrierea. |
| Bariere | Nu știe ce să scrie; formularul pare lung. |
| Încredere | Promisiunea de răspuns și stările vizibile. |
| Formulări | Aprobate. |
| Oportunități | Retenție prin rezolvare. Nimic comercial: suportul nu vinde. |
| Măsurare | Timpul până la primul răspuns; solicitări rezolvate fără revenire. |

| Etapă | Modificare | De ce |
| --- | --- | --- |
| A | Când pleci din aplicație, aplicația și pagina vin completate. | Mai puține câmpuri și un diagnostic mai rapid. |
| B | Sub subiect, sugestii de articole de ajutor, pe măsură ce scrii. | O parte din întrebări se rezolvă înainte de trimitere. |
| C | Nimic. | Suportul nu vinde. |
| D | Nou: „Mă blochează” primește explicația „nu poți lucra deloc până se rezolvă”. | Urgența înseamnă același lucru pentru toată lumea. |
| E | Starea solicitării are cuvânt și icon, nu doar culoare (deja). | Culoarea nu e singurul semnal. |

**Decizie P9.** Adăugăm sugestii de articole de ajutor în formular? E o funcționalitate nouă și cere articolele scrise. Recomand da, când există centrul de ajutor.
