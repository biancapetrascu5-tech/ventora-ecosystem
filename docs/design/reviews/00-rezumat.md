# Ventora — fișe de review (Product Experience)

Oct 24, 2026 · @Bianca Petrascu

## Cum citești fișele

Am făcut 18 fișe (11 Hub, 7 Booking) după noul standard. Nu am schimbat nimic în ecrane. Ai de aprobat modificările recomandate și 15 decizii (P1–P15). Textele aprobate deja rămân cum sunt; etapa D le menționează doar unde apare ceva nou.

- **Cele 10 întrebări**, pe scurt, în tabelul de sus al fiecărei fișe.
- **Modificări pe etape:** A Functional UX · B Behavioral & Cognitive · C Marketing & Conversion · D UX Writing · E Accessibility & Trust. Fiecare are o propoziție despre de ce e utilă.
- **„Nimic” la C** e un răspuns, nu o omisiune: autentificarea, formularele în lucru, plata, suportul și listele de lucru nu primesc nimic comercial.
- **Upsell și cross-sell** apar doar ca slot Growth Engine (RecommendationCard, CatalogRecommendation, UpgradeDialog), niciodată desenate direct în ecran.
- **Eficiența înaintea conversiei:** acolo unde o modificare ar ajuta vânzarea, dar ar încetini munca, am lăsat-o deoparte.

## Deciziile tale

Toate cele 15 decizii, cu recomandarea mea. Nouă dintre ele adaugă o funcționalitate (marcate „nouă”): dacă le aprobi, le desenez fără să schimb ce e deja aprobat.

| # | Ecran | Întrebarea | Recomand |
| --- | --- | --- | --- |
| P1 | Autentificare | „Ține-mă minte” spune durata (30 de zile)? | Da |
| P2 | Invitație | „Arată parola” în loc de „Repetă parola”? | Da |
| P3 | Invitație | După accept, direct în aplicația principală a rolului? | Da |
| P4 | Launcher | Ordinea aplicațiilor: fixă cu reordonare manuală sau după frecvență? | Fixă cu reordonare manuală (nouă) |
| P5 | Contul tău | Autentificarea în doi pași obligatorie pentru proprietar? | Da |
| P6 | Echipa | Invitațiile expirate se șterg după 30 de zile? | Da |
| P7 | Roluri și acces | „Vezi ca {rol}” — previzualizarea launcher-ului unui rol | Da (nouă) |
| P8 | Abonament | Estimarea datei la care se atinge limita, de la 50% consum | Da (nouă) |
| P9 | Suport | Sugestii de articole de ajutor în formular | Da, când există centrul de ajutor (nouă) |
| P10 | Booking · Azi | Cardul „Următoarea programare” pe telefon | Da (nouă) |
| P11 | Booking · Calendar | Butonul „Primul loc liber” | Da (nouă) |
| P12 | Booking · Listă | „{n} rezultate în alte zile” când filtrul ascunde rezultatul | Da (nouă) |
| P13 | Booking · Detaliu | „Programează din nou” | Da (nouă) |
| P14 | Booking · Programare nouă | Ordinea serviciu → oră → client și „Oricine e liber” | Da (nouă) |
| P15 | Booking · Setări | Estimarea consumului de SMS lângă reamintiri | Da |

## Ce se repetă pe toate ecranele

Pe cele 18 ecrane există doar 5 locuri în care o ofertă răspunde unei nevoi reale. Toate trec prin componentele comerciale, cu plafoane și „Nu mă interesează”.

| Loc | Slot | Cine îl vede | De ce e legitim |
| --- | --- | --- | --- |
| Launcher · „Alte aplicații Ventora” | CatalogRecommendation într-un GrowthSlot, cel mult una | Proprietar, admin | Descoperire legată de aplicațiile pe care le are afacerea |
| Booking · Azi, sub „Au nevoie de tine” | RecommendationCard | Proprietar, admin | Cross-sell legat de lucrul zilnic, după muncă |
| Abonament și consum | RecommendationCard pentru consumul de peste 80% | Proprietar | Pagina e despre bani |
| Echipa · limita de angajați | UpgradeDialog, la apăsarea „Invită o persoană” | Proprietar (ceilalți văd cine decide) | Pornit de omul care are nevoia |
| Booking · limita atinsă | UpgradeDialog | Proprietar (ceilalți văd cine decide) | Pornit de omul care are nevoia |

**Fără nimic comercial:** autentificarea, invitația, alegerea afacerii, starea goală, rolurile, plata, suportul, calendarul, lista, detaliul, formularul de programare.

**Măsurare comună.** Propun aceleași evenimente în toate aplicațiile, ca cifrele să se poată compara:

- ecran deschis și timpul până la prima acțiune principală;
- acțiune principală finalizată sau abandonată;
- eroare afișată (pe tip) și reușita după eroare;
- pentru sloturile comerciale: afișare, „Vezi detaliile”, „Nu mă interesează”, „Amintește-mi mai târziu”, conversie și rata de deranjare („Nu mă interesează” la 100 de afișări), care alimentează plafoanele din Founder Control Center.
