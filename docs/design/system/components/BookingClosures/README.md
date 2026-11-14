# BookingClosures

EasyBook — zilele libere ale afacerii sau ale unei locații (S150, 14.11): sărbători, concedii, inventar. Se găsesc în Setări › General › „Zile libere”. Le pot schimba proprietarul și adminii. Cheile sunt `booking.closures.*` și, pentru pagina publică, `booking.public.closedTitle`, `.closedBody`, `.closedBodyNoReason`, în `i18n/booking.json`, în 6 limbi. UI-ul intern folosește „tu” (DE Sie, IT Lei, ES usted); pagina publică folosește „dumneavoastră”.

**Lista.** Taburile sunt „Următoarele” și „Trecute”. Pe fiecare rând apar:

- perioada („24 dec. – 26 dec. 2026”), cu numărul de zile;
- unde se aplică: „Toată afacerea” sau „Salon Aurora · Turnișor”;
- motivul, sau „—” dacă lipsește.

Meniul rândului are „Editează zilele libere” și „Șterge”. Pe telefon, motivul apare lângă locație.

**Formularul** („Zile libere noi”) are:

- „De la” și „Până la (inclusiv)”; pentru o singură zi, aceeași dată;
- „Unde”: toată afacerea sau o locație; câmpul lipsește când afacerea are o singură locație;
- „Motivul”, opțional, de cel mult 60 de caractere, cu contor.

Clienții văd „Închis” și motivul, dacă există. Dacă în perioadă sunt deja programări, apare Notice-ul „Ai 3 programări în aceste zile”, cu „Vezi programările”. Programările nu se anulează singure.

**Regula.** În zilele libere nu se pot face rezervări, nici online, nici din calendar sau din „Programare nouă”. Zilele libere ale unei locații se adaugă peste programul ei săptămânal (BookingLocations).

**Pagina publică.** Ziua liberă e dezactivată în calendar. Dacă e aleasă (de exemplu din banda de zile, pe telefon), apar „Închis în această zi”, motivul cu „Alegeți altă zi.” și butonul spre ziua următoare liberă. Fără motiv, apare doar „Alegeți altă zi.”.

**Stări:**

- lista;
- formularul cu avertismentul pentru programările existente;
- fără motiv;
- eroare: sfârșitul înaintea începutului;
- eroare: suprapunerea cu alte zile libere;
- eroare la salvare (nimic nu s-a schimbat);
- salvat;
- ștergerea, cu confirmare;
- starea goală;
- pagina publică, cu motiv și fără motiv.

Desenat la 1280 și 390, light și dark, cu test DE / IT.

**DE DECIS:**

- **Ce se întâmplă cu programările existente.** Recomandare: nu se anulează automat; avertisment și listă, decizia rămâne la salon.
- **Sărbătorile legale propuse automat** (după țara afacerii). Recomandare: un buton „Adaugă sărbătorile legale din 2027” într-o versiune următoare, nu în v1.
- **Zile parțial libere** (de exemplu închis de la 14:00). Recomandare: nu în v1; se rezolvă din programul zilei.
- **Dacă motivul se arată clienților.** Recomandare: da, când e completat; altfel doar „Închis”.
