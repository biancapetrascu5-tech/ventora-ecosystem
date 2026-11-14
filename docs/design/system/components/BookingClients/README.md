# BookingClients

EasyBook — lista de clienți (`/booking/clients`, S149), intrarea „Clienți” din Spine. Cheile sunt `booking.clients.*` în `i18n/booking.json`, în cele 6 limbi. UI-ul e intern, cu „tu”; în DE se folosește Sie, în IT Lei, ca în restul EasyBook.

**Tabelul.** DataTable cu căutare după nume, telefon sau e-mail. Filtrele sunt Tabs cu număr: Toți, Cu programări viitoare, Risc ridicat (număr cald), Blocați, Fără vizite de 6 luni.

Pe fiecare rând:

- numele, cu avatar;
- telefonul;
- ultima vizită („Încă nu a venit” dacă nu a avut niciuna);
- următoarea programare („Nicio programare” dacă nu are);
- numărul de vizite;
- nota: StatusPill „Risc ridicat” sau Badge „Blocat”.

Sortarea se face din antetul coloanei pe desktop, iar pe telefon din lista „Sortează după”; implicit, după ultima vizită, descrescător. Paginarea e câte 20.

**Telefon.** Lista arată numele, sub el „telefon · următoarea programare”, iar nota în dreapta.

**Clic pe rând.** Deschide fișa clientului (BookingClientCard), cu breadcrumb înapoi la „Clienți”. Meniul rândului are „Deschide fișa” și „Programare nouă”.

**Acțiuni.**

- „Client nou”.
- „Importă clienți”, care deschide importul existent (BookingClientImport).

**Proprietar / admin / recepție față de membru.** Proprietarul, adminii și recepția văd toți clienții, nota și filtrele de risc și blocați. Membrul vede doar clienții cu care a avut sau are programări (Notice „Vezi doar clienții…”), fără coloana de notă, fără filtrele „Risc ridicat” și „Blocați” și fără import. „Client nou” rămâne disponibil și pentru membru. Regula e aceeași ca în fișă: nota de risc și informațiile medicale nu ajung la membru. Nota „Risc ridicat” și clienții blocați nu ies din EasyBook: nu apar în ClientDesk, CampaignKit, API sau webhooks.

**Stări:**

- lista;
- filtrul „Risc ridicat”;
- membru;
- căutare fără rezultat, cu „Șterge filtrele”;
- goală la proprietar, cu „Client nou” și „Importă clienți”;
- goală la membru;
- se încarcă;
- eroare la încărcare, cu „Încearcă din nou” (numerele de pe taburi nu se arată).

Desenată la 1280 și 390, light și dark, cu test DE / IT (inclusiv membru în DE și starea goală în IT).

**DE DECIS:**

- **„Fără vizite de 6 luni” ca filtru.** Recomandare: da, e lista naturală pentru reactivare (aceeași perioadă ca nota de risc).
- **Dacă membrul poate adăuga „Client nou”.** Recomandare: da, la recepția unui salon mic membrul face și programarea.
- **Coloana de telefon pentru membru.** Recomandare: da, îl sună pentru programările lui.
- **Exportul listei.** Recomandare: nu în v1, doar proprietarul și numai după decizia de date personale.
