# Booking — 7 fișe

## 1. Azi — BookingToday

„Azi” răspunde bine la „ce urmează”. Pe telefon, următoarea programare ar trebui să fie primul lucru de pe ecran, iar lista „Au nevoie de tine” să rămână scurtă.

| Întrebare | Răspuns |
| --- | --- |
| Obiectivul utilizatorului | Să știe ce urmează și să rezolve ce blochează ziua. |
| Obiectivul de business și alinierea | Folosire zilnică, mai puține neprezentări, încasări. Aliniate. |
| Primele secunde | Fraza zilei, programarea în desfășurare, „Au nevoie de tine”. |
| Acțiunea principală | Primul lucru din „Au nevoie de tine” (de obicei „Confirmă”). |
| Esențial | Ce e în desfășurare, programul zilei, ce așteaptă o acțiune. |
| Bariere | Pe telefon, programul zilei e mult mai jos; lista de atenție poate crește. |
| Încredere | Stări cu cuvânt, linia „acum”, orele exacte. |
| Formulări | Aprobate. |
| Oportunități | Retenție: o zi utilă. Cross-sell legitim: un GrowthSlot sub „Au nevoie de tine” (de exemplu, CRM), niciodată deasupra. |
| Măsurare | Cât din „Au nevoie de tine” se rezolvă în aceeași zi; neprezentări; timpul până la confirmare. |

| Etapă | Modificare | De ce |
| --- | --- | --- |
| A | „Confirmă” și „Acceptă” din listă dau un Toast cu „Anulează”. | Acțiunile rapide trebuie să poată fi întoarse la fel de rapid. |
| A | Pe telefon, primul card e „Următoarea programare”: cine, când, peste cât. | E întrebarea numărul unu la recepție. |
| B | „Au nevoie de tine” arată cel mult 5 lucruri, apoi „Vezi toate”. | O listă scurtă se termină; una lungă descurajează. |
| C | GrowthSlot doar sub „Au nevoie de tine” și doar pentru proprietar și admin. | Munca vine înaintea ofertei. |
| D | Nou: „Următoarea programare” · „peste 25 min” · „Vezi toate ({n})”. | Din glosar, cu plural corect. |
| E | Toast-urile cu „Anulează” rămân cel puțin 6 secunde și nu dispar cât sunt în focus. | Ai timp să citești și să anulezi. |

**Decizie P10.** Adăugăm cardul „Următoarea programare” pe telefon? Recomand da.

## 2. Calendar — BookingCalendar

Calendarul e un instrument de lucru, deci nu vinde nimic. Cel mai util lucru de adăugat e un drum rapid spre primul loc liber.

| Întrebare | Răspuns |
| --- | --- |
| Obiectivul utilizatorului | Să găsească un loc liber sau să vadă ziua ori săptămâna. |
| Obiectivul de business și alinierea | Ocupare mai mare. Aliniate. |
| Primele secunde | Grila, linia „acum”, data. |
| Acțiunea principală | Un loc liber (creează) sau o programare (deschide). |
| Esențial | Data, vederea, coloanele (oameni sau resurse). |
| Bariere | Pe telefon săptămâna nu încape; mutarea prin tragere e grea pe ecranul tactil. |
| Încredere | Stări clare; suprapunerile se văd. |
| Formulări | Aprobate. |
| Oportunități | Descoperire: DiscoveryTooltip la prima folosire (deja). Nimic comercial. |
| Măsurare | Programări create din calendar; timpul până la găsirea unui loc liber. |

| Etapă | Modificare | De ce |
| --- | --- | --- |
| A | Butonul „Primul loc liber” sare la următorul interval liber pentru serviciul ales. | E întrebarea cea mai frecventă la telefon. |
| A | Pe ecranele tactile, mutarea se face și din detaliu („Mută programarea”), nu doar prin tragere. | Tragerea precisă cu degetul e greu de făcut. |
| B | Locurile libere din programul de lucru au un fundal discret, diferit de orele închise. | Liberul se vede mai repede decât golul. |
| C | Nimic. | Instrument de lucru. |
| D | Nou: „Primul loc liber” · „Următorul loc liber: joi, 14:30, la Ioana.” | Spune exact unde a sărit. |
| E | Programarea se parcurge și cu tastatura (săgeți între programări, Enter deschide). | Grila e folosibilă și fără mouse. |

**Decizie P11.** Adăugăm „Primul loc liber”? E o funcționalitate nouă. Recomand da.

## 3. Lista de programări — BookingList

Lista e eficientă. Riscul principal e ca filtrul implicit („azi, active”) să ascundă programarea căutată.

| Întrebare | Răspuns |
| --- | --- |
| Obiectivul utilizatorului | Să găsească o programare și să lucreze pe mai multe deodată. |
| Obiectivul de business și alinierea | Eficiență. Aliniate. |
| Primele secunde | Căutarea, filtrele active, tabelul. |
| Acțiunea principală | Căutarea sau deschiderea unei programări. |
| Esențial | Clientul, când, starea. |
| Bariere | Filtrele implicite pot ascunde ce caută omul; „nu găsesc”. |
| Încredere | Confirmarea la anularea în bloc; mesajul către client spus doar când pleacă. |
| Formulări | Aprobate. |
| Oportunități | Nimic comercial: listă de lucru. |
| Măsurare | Căutări fără rezultat; acțiuni în bloc folosite; exporturi. |

| Etapă | Modificare | De ce |
| --- | --- | --- |
| A | Când căutarea nu găsește nimic în perioada filtrată, dar găsește în altele: „3 rezultate în alte zile”, cu link. | Elimină „nu găsesc” fără să schimbe filtrele pe ascuns. |
| A | Exportul folosește perioada și filtrele active și le spune în confirmare. | Fișierul conține exact ce vezi. |
| B | Filtrele alese se păstrează pentru fiecare utilizator. | Recepția își regăsește lista cum a lăsat-o. |
| C | Nimic. | Listă de lucru. |
| D | Nou: „{n} rezultate în alte zile” (plural ICU) · „Am exportat {n} programări din {perioadă}.” | Spune ce s-a întâmplat, cu cifre. |
| E | Numărul de rezultate e anunțat după căutare (`aria-live`). | Cititorul de ecran află câte rânduri au rămas. |

**Decizie P12.** Căutarea arată rezultatele din afara perioadei filtrate, ca link separat? Recomand da.

## 4. Detaliul programării — BookingDetail

Detaliul are tot ce trebuie. Câștigăm dacă butonul principal se potrivește stării programării și dacă, la final, oferim „Programează din nou”.

| Întrebare | Răspuns |
| --- | --- |
| Obiectivul utilizatorului | Să vadă tot despre programare și să acționeze: confirmă, mută, anulează, încasează. |
| Obiectivul de business și alinierea | Confirmări, încasări, revenirea clienților. Aliniate. |
| Primele secunde | Cine, când, ce serviciu, starea. |
| Acțiunea principală | Depinde de stare: „Confirmă” pentru o programare neconfirmată. |
| Esențial | Clientul și telefonul, serviciul, ora, starea. |
| Bariere | Istoricul lung; același buton principal în toate stările. |
| Încredere | Istoricul cu cine și când a modificat; „a 6-a vizită”. |
| Formulări | Aprobate. |
| Oportunități | Retenție legitimă: „Programează din nou” după o vizită încheiată. Niciun slot comercial în drawer: e loc de lucru. |
| Măsurare | Confirmări după reamintire; programări reluate din detaliu. |

| Etapă | Modificare | De ce |
| --- | --- | --- |
| A | Butonul principal urmează starea: neconfirmată → „Confirmă”; în desfășurare → „Încasează”; încheiată → „Programează din nou”. | Un singur buton, cel potrivit momentului. |
| B | „Programează din nou” deschide formularul cu clientul, serviciul și angajatul completate. | Revenirea clientului costă două apăsări. |
| B | Istoricul arată ultimele 3 evenimente, apoi „Vezi tot istoricul”. | Detaliul rămâne scurt. |
| C | Nimic. | Drawer de lucru. |
| D | Nou: „Programează din nou” · „Vezi tot istoricul”. | Verbe concrete, din glosar. |
| E | La deschidere, focusul merge pe titlul drawerului; Esc îl închide și focusul revine pe rând (deja). | Navigarea nu se pierde. |

**Decizie P13.** Adăugăm „Programează din nou”? Recomand da.

## 5. Programare nouă — BookingNew

Formularul e complet și protejat de suprapuneri. La telefon însă, oamenii întreabă întâi ce serviciu vrea clientul și când, iar formularul ar trebui să permită ordinea asta.

| Întrebare | Răspuns |
| --- | --- |
| Obiectivul utilizatorului | Să creeze rapid o programare corectă, fără suprapuneri. |
| Obiectivul de business și alinierea | Programări și confirmări. Aliniate. |
| Primele secunde | Clientul, serviciul, data, ora. |
| Acțiunea principală | „Programează”. |
| Esențial | Clientul, serviciul, angajatul, ora. |
| Bariere | Clientul nou cere date în plus; un angajat anume poate fi ocupat când altul e liber. |
| Încredere | Rezumatul cu prețul; SMS-ul de confirmare spus explicit. |
| Formulări | Aprobate. |
| Oportunități | Nimic comercial: formular în lucru (loc interzis). |
| Măsurare | Timpul de creare; abandonul; erorile de suprapunere. |

| Etapă | Modificare | De ce |
| --- | --- | --- |
| A | Serviciul și ora se pot alege înaintea clientului. | La telefon, întâi afli ce vrea și când, abia apoi notezi numele. |
| A | Angajatul poate fi „Oricine e liber”. | Apar mai multe ore disponibile. |
| B | În câmpul Client apar întâi clienții recenți. | Clienții care revin se aleg dintr-o atingere. |
| C | Nimic. | Formular în lucru. |
| D | Nou: „Oricine e liber” · „Clienți recenți”. | Scurt și firesc. |
| E | Erorile sunt legate de câmpul lor, iar la trimitere focusul merge pe prima eroare (deja). | Corectarea e directă. |

**Decizie P14.** Permitem ordinea serviciu → oră → client și opțiunea „Oricine e liber”? Recomand da, pentru amândouă.

## 6. Setări — BookingSettings

Setările se fac o dată, așa că valorile implicite bune contează mai mult decât orice. Pe o pagină lungă, salvarea trebuie să fie mereu la vedere, iar costul reamintirilor trebuie spus dinainte.

| Întrebare | Răspuns |
| --- | --- |
| Obiectivul utilizatorului | Să configureze o dată și să uite. |
| Obiectivul de business și alinierea | Reamintiri pornite (mai puține neprezentări) și consum de SMS-uri. Aliniate, dacă costul e spus. |
| Primele secunde | Programul de lucru. |
| Acțiunea principală | „Salvează schimbările”. |
| Esențial | Programul, regulile de rezervare, reamintirile. |
| Bariere | Pagina lungă; o singură salvare pentru mai multe secțiuni. |
| Încredere | Textul SMS-ului afișat; consumul la vedere. |
| Formulări | Aprobate. |
| Oportunități | Upsell legitim, deja existent: „Cumpără SMS-uri în plus” lângă consum. Rămâne singurul. |
| Măsurare | Afaceri cu reamintirile pornite; neprezentări înainte și după. |

| Etapă | Modificare | De ce |
| --- | --- | --- |
| A | Când modifici ceva, apare jos o bară fixă: „Ai schimbări nesalvate” + „Salvează schimbările”. | Salvarea se vede oriunde ai fi pe pagină. |
| B | Pentru o afacere nouă, reamintirea prin SMS cu 24 de ore înainte e pornită implicit. | Valoarea vine din prima zi, iar omul o poate opri oricând. |
| C | Estimarea consumului lângă comutator: „Aproximativ 420 de SMS-uri pe lună, la programul de acum”. | Costul se vede înainte, fără surprize la limită. |
| D | Nou: textul estimării, cu plural ICU. | Cifre și plural corect. |
| E | Descrierea fiecărui comutator e legată de el (`aria-describedby`). | Cititorul de ecran spune și ce face comutatorul, nu doar numele lui. |

**Decizie P15.** Afișăm estimarea de SMS-uri lângă reamintiri? Recomand da.

## 7. Limită atinsă — BookingLimit

E momentul în care o ofertă răspunde unei nevoi reale. Recomand să treacă pe UpgradeDialog, ca să fie un singur flux, și să păstreze programarea începută.

| Întrebare | Răspuns |
| --- | --- |
| Obiectivul utilizatorului | Să adauge totuși programarea sau să știe ce are de făcut. |
| Obiectivul de business și alinierea | Venit din pachet. Aliniate, dacă drumul e scurt și onest. |
| Primele secunde | Titlul, consumul, variantele. |
| Acțiunea principală | Proprietar: „Cumpără 200 de programări · 39 lei”. Ceilalți: „Anunță proprietarul”. |
| Esențial | Ce s-a întâmplat și ce poți face. |
| Bariere | Teama că se pierde programarea începută. |
| Încredere | „Nu se pierde nimic din ce ai”, prețul complet. |
| Formulări | Aprobate. |
| Oportunități | Upsell legitim, la cererea omului: UpgradeDialog cu pachetul și abonamentul. |
| Măsurare | Câți continuă după limită; timpul până la programarea salvată; abandonul. |

| Etapă | Modificare | De ce |
| --- | --- | --- |
| A | Programarea începută se păstrează și se salvează după cumpărare, cu „Adaugă programarea”. | Nimic din munca omului nu se pierde. |
| A | Dialogul de limită trece pe UpgradeDialog. | Un singur flux și aceleași texte în toate aplicațiile. |
| B | La 80% consum, un singur Toast pe lună (în plus față de Spine). | Limita nu vine prin surprindere, dar nici nu deranjează zilnic. |
| C | Pachetul e prima variantă, abonamentul a doua. | Oferă întâi soluția mică, care rezolvă exact nevoia de acum. |
| D | Membrul vede „Ajunge la Bianca Petrașcu (proprietar).”, conform C2. | Același text ca în componentele comerciale. |
| E | Focusul intră în dialog și revine pe formular la închidere. | Formularul început rămâne la îndemână. |

Fără decizii.
