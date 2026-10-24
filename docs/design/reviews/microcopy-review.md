# Ventora — revizuire microcopy

Oct 24, 2026 · @Bianca Petrascu

## Ce ai de aprobat

Hub și Booking sunt aprobate și aplicate: D1–D14, corecturile și stările lipsă (cardurile HubStates și BookingStates din design system). Etapa 4 (E1–E5) și componentele comerciale (C1–C6) sunt aprobate și aplicate pe 24 octombrie. Stările lipsă sunt pe cardurile AppStates și CommercialStates.

- **Acum** = textul din ecran, extras din toate cadrele: telefon, tabletă, desktop, light și dark.
- **Propunere** = ce aș pune în loc. Rândurile lipsă din tabele înseamnă că textul rămâne așa cum e.
- **Dn** = formularea depinde de o decizie din secțiunea 2. Propunerea urmează recomandarea mea.
- **Stări lipsă** = texte pentru stări care nu sunt încă desenate (gol, eroare, succes, confirmare). Le desenez după aprobare.

Glosarul unic în 6 limbi e în design system, pe cardul **Glosar**. Termenii marcați acolo cu „în decizie” se închid odată cu D1–D14 de aici.

## Decizii pentru tine

Ai aprobat pe 24 octombrie: D1 A, D2 „Pachete în plus” peste tot, D3 A, D4 A, D5 C („Resurse” rămâne, cu explicația „camere, echipamente sau spații pe care le rezervă clienții” în setări), D6 A, D7 B, D8 A, D9 (textul de anulare depinde de setarea afacerii; dialogul pomenește mesajul către client doar dacă notificarea e pornită), D10–D14 A. Toate sunt aplicate în ecrane, în componente și în glosar.

| # | Unde | Acum | Opțiuni (prima e recomandarea) | De ce |
| --- | --- | --- | --- | --- |
| D1 | Peste tot unde e vorba de bani și limite | „abonament” și „plan” amestecate: „Nu e în abonament”, dar „limita planului”, „Planul tău”, „Cere schimbarea planului” | **A.** Doar „abonament”: „limita abonamentului”, „Abonamentul tău: Business”, „Cere alt abonament”. **B.** Ambele, cu regulă: plan = nivelul (Business), abonament = plata lunară | Un singur cuvânt pentru același lucru. „Abonament” e cuvântul din starea de acces pe care ai definit-o tu și cel folosit de oameni în România. „Cere schimbarea planului” l-ai cerut explicit, de aceea îl supun deciziei. |
| D2 | Pagina de abonament, dialogul de cumpărare, facturi | „Add-on-uri” (titlu), dar „pachet în plus” în texte | **A.** „Extraopțiuni”. **B.** „Opțiuni în plus”. **C.** Rămâne „add-on-uri” | „Add-on” e engleză și se declină greu („add-on-urile”). „Extraopțiuni” e termenul pe care clienții îl știu de la operatorii de telefonie, cu exact acest sens. |
| D3 | Toast-uri, lista de programări, dialoguri | „Anulează” înseamnă și „undo”, și „anulează programarea”; „Renunță” închide dialogul | **A.** Undo = „Anulează” doar în toast-uri; anularea unei programări e mereu „Anulează programarea” (cu obiect); în dialogurile distructive butonul sigur spune ce păstrează: „Păstrează programarea”. **B.** Undo = „Revino” | Într-un dialog „Anulezi programarea?”, butoanele „Renunță” și „Anulează” se confundă ușor. |
| D4 | Booking — Azi | „Necesită atenția ta” | **A.** „Au nevoie de tine”. **B.** „De rezolvat”. **C.** Rămâne | „Necesită atenția ta” e traducerea lui „Needs your attention”. Aceeași listă va apărea în CRM, HR și Finance. |
| D5 | Booking — Calendar | Vederea „Resurse” (Coafor, Manichiură, Frizerie) | **A.** „Spații”. **B.** „Posturi”. **C.** Rămâne „Resurse” | „Resurse” e jargon de software. „Spații” se potrivește și la salon, și la clinică (cabinete), și la săli. |
| D6 | Hub — Suport | „Tichetele mele”, „Tichet nou”, „Trimite tichetul” | **A.** „Solicitările mele”, „Solicitare nouă”, „Trimite”. **B.** „Mesajele mele”. **C.** Rămâne „tichet” | „Tichet” e cuvântul echipei de suport, nu al clientului. |
| D7 | Hub — Suport | „Răspundem în aceeași zi lucrătoare.” | **A.** Păstrezi promisiunea, dacă o poți ține. **B.** „Îți răspundem în cel mult o zi lucrătoare.” | E un angajament față de clienți; tu știi ce capacitate de suport ai. |
| D8 | Booking — Setări, mesajele către clienții afacerii | „Te așteptăm mâine la 12:30… Răspunde DA ca să confirmi.” | **A.** Implicit „dumneavoastră” în mesajele către clienți: „Vă așteptăm mâine la 12:30 la Salon Aurora. Răspundeți DA ca să confirmați.”; afacerea îl poate schimba. **B.** Implicit „tu” | Interfața vorbește cu echipa, la „tu”. Mesajele pleacă însă în numele afacerii către clienți pe care echipa nu-i cunoaște neapărat. |
| D9 | Booking — Setări, Detaliu, Lista | „Anulare gratuită până la 24 de ore înainte”; anularea nu spune dacă merge un SMS | Două întrebări: **(a)** Booking percepe taxe de anulare? Dacă nu: „Clienții pot anula online cu cel puțin 24 de ore înainte”. **(b)** La anulare, clientul primește automat un SMS? | „Gratuită” promite că există și anulare cu plată. Textul dialogului de anulare depinde de (b). |
| D10 | Hub — Contul tău | „La fiecare autentificare nouă îți cerem și un cod…” | **A.** Codul se cere doar pe un dispozitiv nou: „Când intri de pe un dispozitiv nou, îți cerem și un cod…”. **B.** La fiecare intrare: „De fiecare dată când intri, îți cerem și un cod…” | „Autentificare nouă” e ambiguu; textul trebuie să spună exact când. |
| D11 | Temă (Contul tău, ThemeSwitcher) | „Ca sistemul” | **A.** „Automată”, cu explicația „urmează setarea dispozitivului”. **B.** „Ca pe dispozitiv”. **C.** Rămâne | „Ca sistemul” e traducerea lui „System”. |
| D12 | Hub — Echipă | Starea „Suspendat” | **A.** „Acces oprit”. **B.** „Inactiv”. **C.** Rămâne | „Suspendat” sună a sancțiune; omul e adesea doar în concediu sau a plecat. |
| D13 | Booking — Programare nouă | „Creează programarea”, pe telefon „Creează · 13:15” | **A.** „Programează”, pe telefon „Programează · 13:15”. **B.** „Salvează programarea” | Un verb concret în loc de „Creează”, care e generic. „Creează” din bara de sus rămâne: e meniul comun tuturor aplicațiilor. |
| D14 | Spaniolă, peste tot | „empresa” | **A.** „negocio”. **B.** Rămâne „empresa” | Pentru un salon sau o clinică mică, „negocio” e firesc; „empresa” sună corporatist. |

## Corecturi fără decizie

Sunt 11 reguli de limbă și localizare. Le aplic peste tot, inclusiv în textele interne ale componentelor, și le-am trecut în glosar ca să le respectă și ecranele noi.

| Regulă | Acum | Corect |
| --- | --- | --- |
| Pluralul românesc are trei forme: 1, 2–19, de la 20 cu „de” | „1 necitite”, „1 selectate” (bug în textul pentru cititoarele de ecran) | „1 necitită”, „2 necitite”, „20 de necitite”; același mecanism pentru afaceri, aplicații, programări, persoane |
| Fără dativ și fără gen lângă un nume care vine din date | „Îi trimitem Biancăi Petrașcu o cerere”; „Bianca Petrașcu, proprietarul afacerii”; „proprietara”; „Le cumperi singur” | „Trimitem cererea către Bianca Petrașcu”; „Bianca Petrașcu (proprietar)”; „Le cumperi direct”. Un nume oarecare nu se poate declina corect automat. |
| „Cumpărături”, nu „cumpărări” | „Metoda de plată pentru cumpărări”; „Salvează cardul pentru cumpărări viitoare” | „Cardul pentru cumpărături”; „Păstrează cardul pentru plățile următoare” |
| Un singur cuvânt pentru limită | „Cota a crescut imediat” | „Limita a crescut imediat” |
| Diateza activă: spunem cine face | „Factura … a fost emisă”; „Se procesează plata…”; „Invitația a fost trimisă pe această adresă” | „Am emis factura …”; „Procesăm plata…”; „Pe această adresă ai primit invitația” |
| Etichetele pentru cititoarele de ecran sunt traduse și spun ce fac | „Breadcrumb” (în engleză); „Golește” pe câmpul Client; „Scade” / „Crește” | „Unde ești”; „Șterge clientul ales”; „Scade cantitatea” / „Crește cantitatea” |
| Fără calchieri din engleză | „să-ți setezi parola”; „Un print screen ajută”; „Se resetează pe 1 noiembrie”; starea „Neprezentare” | „să-ți alegi parola”; „O captură de ecran ajută”; „De la 1 noiembrie, pornim de la zero”; „Nu a venit” |
| Un text nu se contrazice | Setări Booking: „Cu cât timp înainte se poate rezerva”, cu explicația „Cel mai devreme, față de ora programării” (înseamnă de fapt „cel mai târziu”) | „Rezervare cu cel puțin” → „2 ore înainte”; explicația: „Mai aproape de ora programării, clienții nu mai pot rezerva online.” |
| Cantitățile se scriu cu cifre | „Cu două ore înainte” lângă „24 de ore înainte” | „Cu 2 ore înainte” |
| Același tipar pentru lucruri de același fel | „+5 angajați” lângă „500 SMS în plus” | „5 angajați în plus” |
| Celelalte limbi se scriu pentru limba lor, nu se traduc cuvânt cu cuvânt | FR „Seul(e) {who}, propriétaire…” | FR „Seul le propriétaire peut acheter plus : {who}.” Același tipar în EN, ES, DE și IT |

## Hub

Cele 11 ecrane Hub sunt deja în tonul potrivit: scurte, la persoana a doua, fără jargon. Cele mai multe schimbări sunt corecturile din secțiunea 3 și textele pentru stările care lipsesc.

### Autentificare

| Acum | Propunere | Notă |
| --- | --- | --- |
| Intră în contul Ventora al afacerii tale. | Intră în contul tău Ventora. | Contul e al persoanei; o persoană poate lucra în mai multe afaceri. |
| Conturile Ventora se creează doar prin invitație. Ai primit una? Deschide linkul din e-mail ca să-ți setezi parola. | Nu ai cont? Conturile se fac doar prin invitație. Dacă ai primit una, deschide linkul din e-mail și îți alegi parola. |  |
| E-mailul sau parola nu se potrivesc | E-mailul sau parola nu sunt corecte |  |

Stări lipsă: butonul în așteptare „Intri în cont…”; prea multe încercări „Ai încercat de prea multe ori. Mai încearcă peste 5 minute sau alege o parolă nouă.”; fără conexiune „Nu te putem conecta acum. Verifică internetul și încearcă din nou.”

### Invitație

| Acum | Propunere | Notă |
| --- | --- | --- |
| Invitația a fost trimisă pe această adresă. | Pe această adresă ai primit invitația. | Diateza activă |
| O literă mare | Cel puțin o literă mare | La fel ca celelalte două reguli de parolă |
| Confirmă parola | Repetă parola |  |
| Invitația expiră pe 31 octombrie 2026. | Invitația e valabilă până pe 31 octombrie 2026. |  |
| Invitațiile sunt valabile 7 zile. Îi trimitem Biancăi Petrașcu o cerere și primești un link nou pe e-mail. | Invitațiile sunt valabile 7 zile. Cere una nouă: trimitem cererea către Bianca Petrașcu, iar linkul nou îl primești pe e-mail. | Fără dativ; nu sugerează că cererea a plecat deja |

Stări lipsă: după cerere „Am trimis cererea. Primești linkul nou pe e-mail imediat ce Bianca Petrașcu îl retrimite.”; invitație anulată „Invitația nu mai e valabilă. Dacă e o greșeală, cere-i o invitație nouă celui care te-a invitat.”; invitație folosită deja „Ai folosit deja această invitație. Intră în cont cu e-mailul și parola ta.”

### Alegerea afacerii

| Acum | Propunere | Notă |
| --- | --- | --- |
| Faci parte din 3 afaceri. O poți schimba oricând din bara de sus. | Lucrezi în 3 afaceri. Treci de la una la alta oricând, din bara de sus. | „O poți schimba” nu are la ce se referi |
| ultima dată azi, 09:12 | deschisă azi, 09:12 |  |

### Launcher

| Acum | Propunere | Notă |
| --- | --- | --- |
| Nu sunt active pentru tine acum. Fiecare spune de ce și ce poți face. | Nu le poți deschide acum. La fiecare scrie de ce și ce poți face. |  |
| Lucrăm la ea acum. Revine în curând. | Facem lucrări la ea. Revine în curând. |  |

Stări lipsă: notificarea după „Cere acces” „Am trimis cererea către Bianca Petrașcu.”; cerere deja trimisă „Ai cerut acces pe 22 octombrie. Așteptăm răspunsul.”

### Nicio aplicație

| Acum | Propunere | Notă |
| --- | --- | --- |
| Bine ai venit în Salon Aurora. Aplicațiile tale apar aici imediat ce proprietarul ți le activează. | Bine ai venit în Salon Aurora. Aplicațiile apar aici imediat ce primești acces. |  |
| Bianca Petrașcu, proprietara afacerii, alege ce aplicații folosește fiecare rol. Îi putem trimite noi o cerere. | Bianca Petrașcu (proprietar) alege ce aplicații folosește fiecare rol. Putem trimite noi cererea ta. | Gen și dativ |

### Contul tău

| Acum | Propunere | Notă |
| --- | --- | --- |
| Alege unde afli de fiecare lucru. | Alege pe unde vrei să afli de fiecare. |  |
| Ca sistemul | Automată | D11 |
| La fiecare autentificare nouă îți cerem și un cod din aplicația de autentificare. | Când intri de pe un dispozitiv nou, îți cerem și un cod din aplicația de autentificare. | D10 |
| Sesiuni active | Dispozitive conectate |  |
| Acum — acest dispozitiv | Activ acum · acest dispozitiv |  |
| Ieși de pe dispozitiv | Deconectează |  |

Stări lipsă: salvat „Am salvat profilul.”; eroare la salvare „Nu am putut salva. Verifică internetul și încearcă din nou.”; parolă schimbată „Parola e schimbată. Pe celelalte dispozitive va trebui să intri din nou.”

### Echipa

| Acum | Propunere | Notă |
| --- | --- | --- |
| Suspendat | Acces oprit | D12 |
| Trimisă (starea invitației) | În așteptare | Se potrivește cu titlul „Invitații în așteptare” |

Stări lipsă: confirmare „Oprești accesul pentru Radu Matei?”, cu textul „Nu mai poate intra în Salon Aurora. Datele lui rămân; îi poți reda accesul oricând.” și butoanele „Oprește accesul” / „Renunță”; invitație trimisă „Am trimis invitația la andreea.v@gmail.com. E valabilă 7 zile.”; listele goale „Deocamdată ești doar tu aici. Invită colegii ca să lucrați împreună.” și „Nicio invitație în așteptare.”

### Roluri și acces

| Acum | Propunere | Notă |
| --- | --- | --- |
| Schimbările se aplică imediat pentru toți membrii rolului. | Ce schimbi aici se aplică imediat tuturor celor cu acest rol. |  |
| Aplicațiile care nu sunt în abonament se activează prin „Scrie-ne”. | Aplicațiile care nu sunt în abonament le activăm noi: folosește „Scrie-ne”. |  |

### Abonament și consum

| Acum | Propunere | Notă |
| --- | --- | --- |
| Planul tău / Cere schimbarea planului | Abonamentul tău / Cere alt abonament | D1 |
| Metoda de plată pentru cumpărări | Cardul pentru cumpărături |  |
| Se resetează pe 1 noiembrie. | De la 1 noiembrie, pornim de la zero. |  |
| Ai atins limita planului. Ce ai deja rămâne neatins. Ca să adaugi altele, cumpără un pachet în plus sau cere schimbarea planului. | Ai atins limita abonamentului. Nu se pierde nimic din ce ai. Ca să adaugi altele, cumpără un pachet în plus sau cere alt abonament. | D1; tonul rămâne calm |
| Add-on-uri / Le cumperi singur, cu cardul afacerii. | Extraopțiuni / Le cumperi direct, cu cardul afacerii. | D2; fără gen |
| 49 lei · pachet · luna curentă | 49 lei · valabil luna aceasta |  |
| 60 lei · pe lună, cu abonamentul | 60 lei pe lună, plătit odată cu abonamentul |  |
| +5 angajați | 5 angajați în plus |  |
| Abonamentul și fiecare cumpărare au factura lor. | Abonamentul și fiecare cumpărătură au factura lor. |  |
| Ce (coloană în facturi) | Pentru |  |
| Achitată | Plătită | Cuvântul de zi cu zi |
| Niciun card salvat. Fără card, add-on-urile se activează la cerere. | Nu ai încă un card salvat. Până adaugi unul, extraopțiunile le activăm la cerere. | D2 |

### Cumpărarea unei extraopțiuni

| Acum | Propunere | Notă |
| --- | --- | --- |
| Pachet pentru luna curentă · se adaugă imediat | Valabil luna aceasta · intră imediat |  |
| Preț final, fără TVA adăugat. | Prețul e final, nu se adaugă TVA. |  |
| Se procesează plata… | Procesăm plata… |  |
| Cota a crescut imediat. Factura a ajuns și pe e-mail. | Limita a crescut deja. Ți-am trimis factura și pe e-mail. |  |
| Factura VNT-2026-0204 a fost emisă | Am emis factura VNT-2026-0204 |  |
| Motivul transmis de bancă: fonduri insuficiente. Nu ți-am luat niciun ban. | Banca spune: fonduri insuficiente. Nu ți s-a retras niciun ban de pe card. | „Nu ți-am luat” sugerează că noi am fi putut lua |
| Salvează cardul pentru cumpărări viitoare | Păstrează cardul pentru plățile următoare |  |

### Suport

| Acum | Propunere | Notă |
| --- | --- | --- |
| Tichetele mele / Tichet nou / Trimite tichetul | Solicitările mele / Solicitare nouă / Trimite | D6 |
| Răspundem în aceeași zi lucrătoare. | (rămâne sau se schimbă după D7) | D7 |
| Spune-ne ce ai încercat și ce ai văzut. Un print screen ajută. | Spune-ne ce ai încercat și ce ai văzut. O captură de ecran ajută. |  |

Stări lipsă: trimisă „Am primit mesajul. Îți răspundem aici și pe e-mail.”; fără solicitări „Nu ai nicio solicitare. Dacă ceva nu merge, scrie-ne de aici.”

## Booking

Textele din Booking sunt concrete și aproape de limbajul unei recepții, de exemplu „Azi ai 14 programări…”. Cel mai mult lipsesc stările: ziua goală, eroarea, confirmările de anulare și mesajele de succes.

### Azi

| Acum | Propunere | Notă |
| --- | --- | --- |
| Marchează încheiată | Marchează ca încheiată |  |
| Toți (filtru de angajați) | Toată echipa |  |
| Necesită atenția ta | Au nevoie de tine | D4 |
| Dan Stoica are 120 lei neachitați | Dan Stoica mai are de plătit 120 lei | Mai blând, același sens |
| Din mâine 10:00 pe sâmbătă 11:00 · cerere online | De mâine, 10:00, pe sâmbătă, 11:00 · cerere online | Punctuație |

Stări lipsă:

- **Zi goală:** „Azi nu ai nicio programare.”, cu textul „Adaugă una sau deschide calendarul ca să vezi restul săptămânii.”
- **Lista goală:** „Nimic de rezolvat acum.”
- **Eroare:** „Nu am putut încărca programul zilei. Verifică internetul și încearcă din nou.”, cu butonul „Încearcă din nou”.
- **Încărcare:** fără text vizibil; pentru cititoarele de ecran, „Se încarcă programul zilei”.
- **După „Marchează ca încheiată”:** „Programare încheiată · Andrei Ionescu”, cu „Anulează” (D3).

### Calendar

| Acum | Propunere | Notă |
| --- | --- | --- |
| Resurse | Spații | D5 |
| Vizualizare (etichetă pentru cititoarele de ecran) | Cum arăt calendarul |  |

Stări lipsă: indicii la locurile libere „Apasă pe un loc liber ca să adaugi o programare.” (doar la prima folosire); eroare la fel ca la Azi; zi fără programări — grila rămâne goală, fără mesaj.

### Lista de programări

| Acum | Propunere | Notă |
| --- | --- | --- |
| Toate programările afacerii. Filtrează, selectează mai multe sau deschide una ca să vezi detaliile. | Toate programările, cu filtre și acțiuni pentru mai multe deodată. | Mai scurt; nu explică interfața |
| Anulează (acțiune în bloc) | Anulează programările | D3 |
| Toți angajații | Toată echipa |  |

Stări lipsă:

- **Golă, cu filtre:** „Nicio programare pentru filtrele alese.”, cu butonul „Șterge filtrele”.
- **Golă de tot:** „Încă nu ai nicio programare.”, cu textul „Adaugă prima programare sau pornește rezervările online ca să te găsească clienții.”
- **Confirmare anulare în bloc:** „Anulezi 2 programări?”, cu textul „Clienții primesc un SMS că programarea s-a anulat.” (după D9b) și butoanele „Anulează programările” / „Păstrează-le”.
- **Export:** „Am pregătit exportul. Fișierul s-a descărcat.”

### Detaliul programării

| Acum | Propunere | Notă |
| --- | --- | --- |
| Sună clientul | Sună | Butonul are deja iconița de telefon; evită genul |
| Mută | Mută programarea | Butonul stă singur pe telefon |

Stări lipsă:

- **Confirmare anulare:** „Anulezi programarea?”, cu textul „Cristina Dobre · vineri, 23 octombrie, 12:30.” și fraza despre SMS (D9b); butoanele „Anulează programarea” / „Păstrează programarea”.
- **Nu a venit:** acțiunea „Marchează: nu a venit”.
- **Mutare reușită:** „Am mutat programarea pe sâmbătă, 11:00.”

### Programare nouă

| Acum | Propunere | Notă |
| --- | --- | --- |
| Creează programarea / Creează · 13:15 | Programează / Programează · 13:15 | D13 |
| Orele tăiate sunt ocupate la Ioana în ziua aleasă. | Orele tăiate sunt deja ocupate la Ioana. |  |
| Cu (în rezumat) | Cu cine |  |
| Breadcrumb / Golește (etichete pentru cititoarele de ecran) | Unde ești / Șterge clientul ales | Corectură |

Stări lipsă: validare „Alege clientul.”, „Alege o oră liberă.”; suprapunere „Ioana are deja o programare la 13:15. Alege altă oră sau alt coleg.”; salvată „Am salvat programarea · marți, 27 octombrie, 13:15”, cu „Vezi programarea”.

### Setări

| Acum | Propunere | Notă |
| --- | --- | --- |
| Salvează | Salvează schimbările |  |
| Cu cât timp înainte se poate rezerva / Cu două ore înainte / Cel mai devreme, față de ora programării. | Rezervare cu cel puțin / 2 ore înainte / Mai aproape de ora programării, clienții nu mai pot rezerva online. | Corectură (textul se contrazicea) |
| Anulare gratuită până la | Clienții pot anula online cu cel puțin | D9a |
| Se confirmă singure / Le confirm eu | Se confirmă automat / Le confirmă cineva din echipă | „eu” nu se potrivește când lucrează mai mulți |
| Se trimit automat; consumă SMS-uri din plan. | Pleacă automat și consumă din SMS-urile incluse în abonament. | D1 |
| „Te așteptăm mâine la 12:30 la Salon Aurora. Răspunde DA ca să confirmi.” | „Vă așteptăm mâine la 12:30 la Salon Aurora. Răspundeți DA ca să confirmați.” | D8 |

Stări lipsă: salvat „Am salvat setările.”; plecare fără salvare „Ai schimbări nesalvate.”, cu butoanele „Salvează” / „Pleacă fără să salvezi”.

### Limită atinsă

| Acum | Propunere | Notă |
| --- | --- | --- |
| Programările existente rămân neatinse și le poți edita. Ca să adaugi una nouă luna aceasta, ai nevoie de mai multe programări în plan. | Programările pe care le ai rămân la locul lor și le poți modifica în continuare. Ca să adaugi una nouă luna aceasta, cumpără un pachet de programări sau cere alt abonament. | D1; spune ce poți face, nu doar ce lipsește |
| Doar Bianca Petrașcu, proprietarul afacerii, poate cumpăra în plus. | Pachetele în plus le poate cumpăra doar Bianca Petrașcu (proprietar). | Gen |

Stare lipsă: după „Anunță proprietarul” „Am trimis cererea către Bianca Petrașcu.”

## Componente comune

Aceste texte stau în componente, nu în ecrane, așa că o schimbare aici ajunge peste tot, în toate cele 6 limbi. Sunt doar rândurile pe care le-aș schimba.

| Componentă | Acum | Propunere | Notă |
| --- | --- | --- | --- |
| UsageMeter | Te apropii de limita planului / Ai atins limita planului | Te apropii de limita abonamentului / Ai atins limita abonamentului | D1 |
| UsageMeter | Cere schimbarea planului | Cere alt abonament | D1 |
| UsageMeter | Doar {nume}, proprietarul afacerii, poate cumpăra în plus. | Pachetele în plus le poate cumpăra doar {nume} (proprietar). | Gen; FR fără „Seul(e)” |
| AppTile | Nu e inclusă în abonamentul afacerii. Scrie-ne și o activăm. | (rămâne) | Exemplu bun de ton: spune motivul și ce poți face |
| AddonPurchase | Plătești cu | Plătești cu cardul | Mai clar când lipsește cardul |
| Schedule, Agenda | Neprezentare | Nu a venit | Corectură |
| Schedule | Indisponibil (interval blocat) | Blocat | Spune de ce nu se poate rezerva |
| ThemeSwitcher | Ca sistemul | Automată | D11 |
| Toast | Anulează (undo) | (rămâne, doar în toast-uri) | D3 |
| Combobox | Golește | Șterge alegerea | Spune ce șterge |
| FileUpload | Maximum {size} per fișier | Până la {size} de fiecare fișier | Mai firesc |
| FileUpload | Eliberează pentru a încărca | Dă drumul ca să încarci | „Pentru a” + infinitiv sună a traducere |
| NotificationsPanel | Îți spunem aici când ceva are nevoie de tine. | (rămâne) | Se potrivește cu D4 A |

După ce aprobi, aplic în aceeași trecere: textele din ecrane, textele interne ale componentelor în toate cele 6 limbi, glosarul și stările lipsă. Apoi re-verific contrastul, lățimile și țintele de atingere.

## Etapa 4 — ecranele celorlalte aplicații

Cele șapte ecrane noi (CRM, HR, Inventory, Projects × 2, Finance, Analytics) sunt scrise direct după glosar, așa că textele de mai jos sunt deja propunerea mea. Ai de luat 5 decizii (E1–E5) și de aprobat textele. Stările lipsă le desenez după aprobare, ca la Booking.

| # | Unde | Întrebarea | Opțiuni (prima e recomandarea) |
| --- | --- | --- | --- |
| E1 | CRM — Pipeline | Etapele sunt fixe sau le alege afacerea? | **A.** Implicit „Contact nou”, „Ofertă trimisă”, „Negociere”, „Câștigate în {luna}”, „Pierdute”, editabile din Setări. **B.** Fixe |
| E2 | HR — Prezență | Întârzierile apar cu cuvântul „întârziere”? | **A.** Da, ca text discret: „09:17 · întârziere 17 min”. **B.** Doar ora de intrare: „09:17” |
| E3 | Inventory — Stoc | Avertizarea leagă stocul de programări („ai 2 programări de vopsit mâine care o folosesc”). Există legătura Booking ↔ Inventory (consum pe serviciu)? | **A.** Da, păstrez fraza. **B.** Nu: „Comandă înainte să rămâi fără.” |
| E4 | Finance — Scadențe | „am trimis 2 reamintiri” presupune reamintiri automate către clienți din Finance. Există? | **A.** Da, la 3 și la 7 zile după scadență, la „dumneavoastră” (D8). **B.** Nu: fără mențiune, doar „Trimite reamintire” manual |
| E5 | Analytics | „+3 pp” la „Clienți care revin” | **A.** „+3 puncte”. **B.** „+3 pp” |

### CRM — Pipeline

- Titlu și frază: „Pipeline” · „12 oportunități deschise, în valoare de 77.900 lei. Două așteaptă un telefon azi.”
- Control: „Panou” / „Listă”, „Toată echipa” / „Doar ale mele”.
- Pe card: client, ce vrea („Abonament lunar pentru 10 angajați”), valoarea, pasul următor („Sună azi” peach, „Fără răspuns de 9 zile” peach, „Întâlnire mâine, 10:00”), „Câștigată pe 21 oct.”; meniul „Mută în „Negociere””.
- Stări de desenat: pipeline gol („Încă nu ai nicio oportunitate.” + „Adaugă o oportunitate”), etapă goală („Nicio oportunitate aici.”), oportunitate mutată (toast „Am mutat oportunitatea în „Negociere”.” + „Anulează”), pierdută (dialog „Marchezi oportunitatea ca pierdută?” cu „Marchează ca pierdută” / „Păstrează-o deschisă” și motiv opțional).

### HR — Prezență

- Frază: „Săptămâna 19–23 octombrie. Intrările și ieșirile vin din pontaj; le poți corecta de aici.”
- Cifre: „La lucru acum · 4 din 6 · Sorin începe la 11:00”, „Întârzieri săptămâna aceasta · 2 · Radu Matei, de 2 ori”, „În concediu · 1 · Ana Ilie, până pe 30 oct.”, „Ore lucrate · 138 h · din 168 h planificate”.
- Celule: „La lucru din 08:57” (peach), „09:17 · întârziere 17 min” (E2), „10:02 · fără ieșire”, „Concediu”, „Absență”, „Liber”, „Începe la 11:00”. „Absență”, nu „Absentă”: numele vine din date și nu-i știm genul.
- „Au nevoie de tine”: „Ioana Pavel cere concediu · 2–6 noiembrie · 5 zile lucrătoare · îi rămân 9 zile” cu „Aprobă” / „Refuză”; „Mara Enache nu a pontat ieșirea” cu „Corectează pontajul”.
- Stări de desenat: concediu aprobat (toast „Am aprobat concediul. Ioana Pavel primește o notificare.”), refuz (dialog cu motiv obligatoriu: „Spune-i de ce, ca să poată alege alte zile.”), pontaj corectat („Am corectat pontajul. Modificarea apare în istoric.”), săptămână fără pontaj („Încă nu există intrări săptămâna aceasta.”).

### Inventory — Stoc

- Frază: „128 de produse, în valoare de 18.420 lei.” · butoane „Înregistrează o mișcare”, „Exportă”.
- Avertizare: „4 produse sub minim, unul epuizat” + fraza din E3 + „Pregătește comanda”.
- Coloane: Produs, Categorie, Stoc („3 flacoane · minim 8”), Furnizor, Ultima mișcare, Stare („Epuizat”, „Sub minim”, „Comandat”, „În stoc”). Filtru: „Doar ce trebuie comandat”.
- Meniu pe rând: „Ajustează stocul”, „Comandă de la furnizor”, „Istoricul mișcărilor”.
- Stări de desenat: nicio alertă (avertizarea dispare; nu apare „Totul e în regulă”), stoc gol („Încă nu ai produse. Adaugă primul produs sau importă lista dintr-un fișier.”), stoc ajustat (toast cu „Anulează”), comandă pregătită („Am pregătit comanda pentru Beauty Pro Distribution: 2 produse. Verific-o înainte să o trimiți.”).

### Projects — Panou și Cronologie

- Antet: „Site nou pentru Salon Aurora” · „Lansare vineri, 20 nov.” · „10 sarcini deschise din 16” · taburi „Panou”, „Cronologie”, „Fișiere”.
- Etape: „De făcut”, „În lucru”, „De verificat”, „Gata”. Pe card: eticheta, titlul, progresul („2/5”), termenul („Azi” și „Întârziată 2 zile” peach), „3 comentarii”, „Gata pe 16 oct.”.
- Cronologie: etapele cu „Gata”, „85%”, „Întârziată 2 zile”, „9–20 nov.”, lansarea „Vin, 20 nov.”, linia „Azi”, apoi o frază: „Fotografiile au întârziat 2 zile. Dezvoltarea are încă rezervă până la testare, așa că lansarea rămâne pe 20 noiembrie.”
- Stări de desenat: proiect fără sarcini („Împarte proiectul în sarcini ca să vezi cine ce face.” + „Adaugă o sarcină”), lansare în pericol (fraza devine „Dezvoltarea nu mai are rezervă: dacă nu recuperează 3 zile, lansarea se mută pe 27 noiembrie.”).

### Finance — Scadențe și restanțe

- Frază: „Facturile emise care așteaptă plata, de la cea mai veche.” · „Exportă pentru contabil”.
- Cifre: „De încasat · 15.930 lei · 8 facturi”, „Restante · 4.310 lei · 4 facturi, cea mai veche de 14 zile” (peach), „Scadente în 7 zile · 6.900 lei · 2 facturi”, „Încasat în octombrie · 31.250 lei · +8% față de septembrie”.
- Stări pe rând: „Restantă · 14 zile”, „Scadentă azi” (peach), „Scadentă în 5 zile”, „Plătită pe 12 oct.” (lime). Filtre: „Toate”, „Restante · 4”, „Următoarele”, „Plătite”.
- „Au nevoie de tine”: „Clinica Dentis Sibiu · 1.250 lei · Restantă de 14 zile · am trimis 2 reamintiri” (E4) cu „Sună” / „Marchează plătită”.
- Stări de desenat: nicio restanță („Nicio factură restantă.”), marcată plătită (toast „Am marcat factura AUR-2026-114 ca plătită.” + „Anulează”), reamintire trimisă („Am trimis reamintirea către Clinica Dentis Sibiu.”).

### Analytics — Prezentare generală

- Frază: „Octombrie 2026, până azi, comparat cu octombrie 2025.” · „Luna”, „Trimestrul”, „Anul” · „Față de anul trecut” / „Față de luna trecută”.
- Cifre: „Venituri · 48.250 lei · +12% față de oct. 2025”, „Programări · 862 · +5%”, „Clienți noi · 64 · −8%”, „Clienți care revin · 71% · +3 pp” (E5).
- Grafice: „Venituri pe lună · Ultimele 12 luni · octombrie e încă în curs” (legendă „Venituri 2025–2026”, „Cu un an înainte”; în tooltip „oct. · în curs”), „Venituri pe serviciu · Octombrie, până azi”, „Programări pe zi a săptămânii · Media pe ultimele 4 săptămâni”; pe fiecare, „Vezi ca tabel” / „Vezi graficul”.
- Stări de desenat: prea puține date („Graficele apar după prima lună de activitate.”), eroare la încărcare („Nu am putut încărca cifrele. Încearcă din nou.”), perioadă fără activitate („Nicio programare în perioada aleasă.”).

## Comercial — componentele 1–8 (Growth Engine)

Cele opt componente sunt în grupul „Comercial” din design system, construite doar din componentele și tokenii existenți. Au textele scrise după glosar și după direcția de ton din specificație. Ai de luat 6 decizii (C1–C6) și de aprobat textele. Partea 9 (Growth & Campaigns) intră în Etapa 5.

| # | Unde | Întrebarea | Opțiuni (prima e recomandarea) |
| --- | --- | --- | --- |
| C1 | Peste tot | „trial” în română | **A.** „perioadă de probă” în text, butonul „Încearcă gratuit 14 zile”, confirmarea „Începe perioada de probă”. **B.** „trial”, ca în specificație („Activează trialul”) |
| C2 | RecommendationCard, UpgradeDialog, catalog | Acțiunea membrului | **A.** „Recomandă aplicația” (în dialog: „Recomandă”) și dedesubt „Decide Bianca Petrașcu (proprietar).”. **B.** „Recomandă-i administratorului”, ca în specificație: nu se potrivește când decide proprietarul |
| C3 | Perioada de probă | Cere cardul și trece singură la plată? | **A.** Nu: „Nu ai nevoie de card. La final alegi tu dacă vrei să continui.” (se potrivește cu „doar dacă alegi să continui”). **B.** Da: cardul se cere la început și textul spune data primei plăți |
| C4 | „Amintește-mi mai târziu” | Intervalul | **A.** Meniu cu „Peste o săptămână” / „Peste o lună”. **B.** Un singur interval, fix |
| C5 | HubRecommendation — „Respinge” | Membrul află că recomandarea a fost respinsă? | **A.** Nu, ca să nu devină un refuz personal. **B.** Da, cu o notificare neutră |
| C6 | Catalogul | Unde se intră în catalog | **A.** „Vezi toate aplicațiile Ventora” la finalul launcher-ului și din „Vezi detaliile” pe orice recomandare. **B.** Și un element permanent în meniul contului |

### 1. GrowthSlot

- Fără text propriu. Gol sau în încărcare nu afișează nimic; cu conținut apare lin.
- În README e lista locurilor unde nu apare niciodată: formulare în lucru, plăți, erori, confirmări, autentificare și acțiunile sensibile din Finance, HR și Contracts.

### 2. RecommendationCard

- Comune: „Recomandare”, meniul „Amintește-mi mai târziu” cu „Peste o săptămână” / „Peste o lună”, „Nu mă interesează”.
- Booking → CRM: „Ține istoricul clienților în CRM” · „Clienții tăi din programări pot avea istoric, note și follow-up în CRM.” · „69 lei pe lună · fără cost de implementare” · „Vezi opțiunile”. „Follow-up” vine din specificație; alternativa ar fi „pașii următori”.
- Analytics, cu perioadă de probă: „Vezi ce aduce fiecare serviciu” · „Analytics îți arată venitul pe servicii și pe angajați, din programările pe care le ai deja.” · „Gratuit 14 zile. Apoi 79 lei pe lună, doar dacă alegi să continui. Fără cost de implementare.” · „Încearcă gratuit 14 zile” (C1).
- Membru, din catalog: „Marketing” · „Trimite automat reamintiri și campanii clienților din Booking.” · „49 lei pe lună” · „Recomandă aplicația” · „Decide Bianca Petrașcu (proprietar).” → după: „Am trimis recomandarea către Bianca Petrașcu (proprietar).” (C2).
- Pachet în plus: „500 SMS în plus pentru octombrie” · „Ai folosit 862 din 1.000 de SMS-uri, iar reamintirile pentru săptămâna viitoare mai au nevoie de aproximativ 300.” · „49 lei · valabil luna aceasta” · „Cumpără · 49 lei”.
- După alegere: „Am înțeles, nu-ți mai arătăm asta.” / „Bine, îți amintim peste o săptămână.”, ambele cu „Anulează”.

### 3. UpgradeDialog

- Opțiuni: „Ai atins limita de programări din octombrie” · „Ca să adaugi programarea de azi, alege una dintre variante.” · „Alege ce ți se potrivește” · „Pachet de 200 de programări — 39 lei · doar pentru octombrie · fără cost de implementare” („Intră imediat, poți adăuga programarea acum”, „Din noiembrie revii la limita abonamentului”) · „Abonamentul Business Plus — 449 lei pe lună în loc de 349” · „Nu se pierde nimic din ce ai.” · „Renunță” / „Continuă”.
- Membru: aceleași opțiuni, fără alegere, „Decide Bianca Petrașcu (proprietar).” · „Închide” / „Recomandă”.
- Confirmare: „Verifică și plătește” · „Ce activezi”, „Când”, „Preț”, „Cost de implementare”, „Plătești azi” · „Plătești cu cardul” · „Înapoi” / „Plătește 39 lei”.
- Abonament: „Trimite cererea” · „Nu plătești nimic acum. Îți confirmăm noul abonament și prețul înainte să-l pornim, în cel mult o zi lucrătoare.” · „Cere alt abonament”.
- Perioadă de probă: „Începe perioada de probă” · „Nu ai nevoie de card. La final alegi tu dacă vrei să continui.” (C3) → „Perioada de probă a început” · „Ai Analytics până pe 7 noiembrie. Apoi 79 lei pe lună, doar dacă alegi să continui.” · „Îți amintim cu 3 zile înainte de final.” · „Gata” / „Deschide Analytics”.
- Procesare, succes și eroare: aceleași texte ca la cumpărarea pachetelor (deja aprobate), plus „Adaugă programarea” după succes, ca omul să continue ce începuse.

### 4. DiscoveryTooltip

- „Exportul merge și pentru contabil” · „Alegi perioada și primești un fișier pe care contabilul îl deschide direct.” · „Am înțeles” · „Vezi cum funcționează”.
- Comercial: „Clienții din Booking pot intra în CRM” · „Fiecare client primește istoric, note și pasul următor. Vezi detaliile în catalog.”

### 5. HubRecommendation

- Secțiunea „Recomandări” sub notificări · „Ține istoricul clienților în CRM” · „Programările din Booking devin istoric, note și follow-up. 69 lei pe lună.” · „Vezi detaliile” / „Nu mă interesează”.
- Pentru admin: „Recomandare de la echipă” · „Ioana Pavel recomandă Marketing” · nota membrului între ghilimele · „Vezi aplicația” / „Respinge” (C5).

### 6. CatalogRecommendation și catalogul

- Pe tile: „Recomandare” + „Nu e în abonament” · „Se potrivește cu Booking: trimite automat reamintiri și campanii clienților tăi.” · „49 lei pe lună · fără cost de implementare” · „Vezi detaliile”. Launcher-ul se încheie cu „Vezi toate aplicațiile Ventora” (C6).
- Catalog: „Toate aplicațiile Ventora” · „15 aplicații care lucrează împreună. Ai 10 în abonament; la celelalte vezi ce fac, cât costă și dacă au perioadă de probă.” · căutarea „Caută o aplicație sau ce vrei să faci” · „Doar cele pe care nu le ai” · categoriile „Programări și clienți”, „Echipă”, „Operațiuni”, „Bani și documente”, „Proiecte și date”, „Comunitate” · aplicațiile deținute: „… · în abonament”.
- Pagina aplicației: „De ce ți-o recomandăm”, „Ce face”, „Se leagă de” · „Preț · 49 lei pe lună”, „Se plătește · Odată cu abonamentul”, „Cost de implementare · Fără”, „Perioadă de probă · 14 zile, gratuit” · „După perioada de probă continui doar dacă alegi tu. Nu ai nevoie de card ca să o începi.” · proprietar: „Încearcă gratuit 14 zile” / „Activează · 49 lei pe lună”; membru: „Recomandă aplicația”.

### 7. Eticheta „Recomandare”

- Badge neutru, același peste tot. DE „Empfehlung”, IT „Raccomandazione”, FR „Recommandation”, ES „Recomendación”, EN „Recommendation”.

### 8. Preferințe comerciale

- În Contul tău → Notificări: „Recomandări Ventora” · „Sugestii despre aplicații și pachete în plus care se potrivesc cu ce faci deja.” · „În aplicație” („Le vezi în pagini și în notificări, la secțiunea Recomandări.”) · „Pe e-mail” (oprit și blocat, „Disponibil în curând”) · „Mesajele despre limitele contului tău rămân active, pentru că sunt informații despre cont, nu recomandări.”
