# SPECIFICAȚIE: ECRANE „SMS DE PE NUMĂRUL PROPRIU” — pentru Claude Design

**Data:** 24 octombrie 2026
**Surse:** `docs/SMS_NUMAR_PROPRIU.md` (specificația aprobată condiționat, D-SMS-1…9), `DESIGN_RULES.md` §13 (UX writing), §14 (componente comerciale), §15 (Product Experience), designul unificat aprobat (`docs/design/system/`).
**Familia vizuală:** business (Booking, Hub, Founder).

> Instrucțiune pentru Claude Design: construiește ecranele de mai jos **doar din tokenii și componentele existente** (BookingSettings, BookingDetail, BookingToday, AttentionList, StatusPill, StatusDot, Notice, Dialog, Sheet, SegmentedControl, Radio, Toggle, UsageMeter, Toast, EmptyState, DataTable, Timeline, Stat, UpgradeDialog etc.). Nu crea variante noi de Button, Dialog sau Card. Fiecare ecran: light + dark, telefon / tabletă / desktop, cele 6 limbi (test cu etichete DE și IT), toate stările. După fiecare ecran: fișa de review A–E (§15) și revizuirea de microcopy (§13), apoi aștepți aprobarea. Exemplele de text de aici sunt orientative.

---

## Principii

- **Utilizatorul e proprietarul sau administratorul unui salon, nu un tehnician.** Fără termeni ca „gateway”, „webhook”, „APK”, „heartbeat”. Spunem „telefonul afacerii”, „aplicația Ventora pentru telefon”, „conectat”.
- **Onestitate despre stare.** Nu afirmăm niciodată că un mesaj nu a plecat dacă nu știm sigur. Starea „Neconfirmat” e distinctă vizual și textual de „Nu s-a trimis”.
- **Fără costuri ascunse.** Orice opțiune care costă (dispozitiv suplimentar, rezervă prin furnizor) își arată prețul înainte de activare.
- **Culori:** peach doar pentru „are nevoie de tine acum” (telefon deconectat cu mesaje în așteptare); lime doar pentru „trimis/livrat”; „Neconfirmat” e neutru, nu roșu și nu peach.
- **Fiecare stare are icon + text**, nu doar culoare.

---

## 1. Booking · Setări · Trimitere SMS (secțiune nouă în BookingSettings)

**Rol:** alegerea metodei și starea permanentă a trimiterii.

- **Alegerea metodei** (Radio cu descriere, nu SegmentedControl, pentru că opțiunile au explicații):
  - „Prin Ventora”: mesajele pleacă de la un expeditor Ventora; consumă din SMS-urile abonamentului (UsageMeter existent).
  - „De pe telefonul afacerii”: mesajele pleacă de pe numărul tău; nu consumă din SMS-urile abonamentului; cere un telefon Android conectat.
  - „Dezactivat”.
- **Când metoda e „De pe telefonul afacerii”:**
  - cardul telefonului: nume (editabil, de ex. „Telefon recepție”), număr afișat (dacă e cunoscut), StatusDot (Conectat / Deconectat / Niciun telefon), ultima conectare, baterie, semnal, versiunea aplicației;
  - azi: trimise, în așteptare, neconfirmate, eșuate (Stat);
  - **capacitatea**: „Poți trimite aproximativ {n} mesaje pe oră de pe acest telefon.” + avertisment dacă programările de mâine depășesc capacitatea;
  - acțiuni: „Trimite un SMS de probă”, „Deconectează telefonul”, „Conectează alt telefon” (dacă ai dispozitive disponibile; altfel deschide UpgradeDialog pentru add-on, §6);
  - **Rezervă când telefonul nu e disponibil**: implicit „Nicio rezervă: te anunțăm și mesajul nu pleacă”; Toggle „Trimite reminderul pe email, dacă clientul are email (gratuit)”; Toggle „Trimite prin Ventora, din SMS-urile abonamentului”, cu costul afișat și o confirmare la activare.
- **Ore de trimitere:** interval (implicit 09:00–20:00) și fereastra pentru reminderele „cu o zi înainte”.
- **Stări de arătat:** nicio metodă aleasă · prin Ventora · telefon neconectat încă · conectat (normal) · deconectat cu mesaje în așteptare · baterie scăzută · aplicație veche (cere actualizare) · capacitate depășită mâine · fără drept (membru: vede starea, nu poate schimba) · funcționalitate neinclusă în abonament (AccessBadge „notInPlan” + cine decide).

## 2. Conectarea telefonului (flux în Sheet pe telefon, Dialog pe desktop)

Pași, cu indicator de progres:

1. **Ce îți trebuie:** un telefon Android (recomandat dedicat, nu cel personal), SIM-ul afacerii cu credit, încărcător, internet (Wi-Fi sau date). Notă discretă: „Pe iPhone nu se poate: Apple nu permite trimiterea automată de SMS-uri.” Link „Vezi telefoanele recomandate”.
2. **Instalează aplicația:** buton/QR spre pagina de descărcare + pașii pentru „instalare din afara Magazin Play” (ilustrați simplu, pe mărcile principale), până când există varianta din Google Play.
3. **Scanează codul:** cod QR mare + un cod scurt de rezervă (pentru cine nu poate scana), cronometru „Codul expiră în 9:41”, „Generează alt cod”.
4. **Setările telefonului:** ghid scurt pe marcă (excepție de la economisirea bateriei, pornire automată), cu bife „Am făcut asta”.
5. **Declarație:** casetă (nebifată implicit) „Folosesc un SIM al afacerii și respect condițiile operatorului meu de telefonie.” + link spre detalii.
6. **SMS de probă:** câmp cu numărul tău (precompletat cu numărul proprietarului, dacă există) → „Trimite proba” → stările în timp real: predat telefonului → trimis → livrat (dacă vine confirmarea).
7. **Gata:** rezumat (telefon conectat, ce mesaje vor pleca de pe el, unde vezi starea).

**Stări:** cod expirat · telefonul nu se conectează în timpul așteptat (ce să verifici) · telefon deja conectat la altă afacere · proba eșuează (motivul) · proba rămâne neconfirmată (explicația: „Nu am primit confirmarea de la telefon. Verifică dacă SMS-ul a ajuns.”).

## 3. Starea mesajului pe detaliul programării (BookingDetail)

- Secțiune „Mesaje” în drawer: fiecare mesaj (reminder, confirmare, modificare, anulare) cu tip, canal (telefonul afacerii / Ventora / email), ora programată, StatusPill cu starea și ora ei.
- Stările și formulările de pornire:
  - În așteptare · „Pleacă la {ora}”
  - Predat telefonului
  - Trimis · {ora}
  - Livrat · {ora} (doar dacă există confirmare)
  - Nu s-a trimis · motivul pe înțeles („Telefonul nu avea semnal”, „Fără credit pe SIM”, „Programarea a început înainte ca telefonul să revină online”)
  - **Neconfirmat** · „Mesajul a ajuns la telefon, dar nu avem confirmarea că a plecat. Poate să fi plecat.”
  - Anulat
- Istoric pe stări (Timeline) la deschiderea mesajului.
- „Trimite din nou” pentru „Nu s-a trimis” și „Neconfirmat”; pentru „Neconfirmat”, confirmarea avertizează: „Clientul poate primi mesajul de două ori.”

## 4. Booking · Azi: alerte (AttentionList „Au nevoie de tine”)

- Rânduri noi, doar pentru Owner/Admin:
  - „Telefonul afacerii e deconectat. {n} remindere trebuie să plece până la {ora}.” → „Vezi ce poți face”
  - „{n} mesaje nu au plecat azi.” → lista
  - „{n} mesaje neconfirmate.” → lista
  - „Bateria telefonului: 12%, nu se încarcă.”
  - „Mâine ai mai multe remindere decât poate trimite telefonul.” → setări
- Peach doar pentru primul caz (acțiune urgentă).

## 5. Lista mesajelor (ecran nou, din Setări → Trimitere SMS → „Vezi toate mesajele”)

- DataTable: client, programare, tip, canal, ora, stare; filtre pe stare (inclusiv „Neconfirmate”) și perioadă; căutare după client.
- Pe telefon: listă de carduri.
- Exportul urmează regula existentă (perioada și filtrele în confirmare).
- Stări: gol · încărcare · eroare · fără rezultate în perioada filtrată (regula P12).

## 6. Dispozitiv suplimentar (add-on)

- „Conectează alt telefon” când cota e atinsă → **UpgradeDialog** existent, varianta add-on: „Un telefon în plus” · preț și periodicitate · ce face (împarte mesajele între telefoane, crește capacitatea) · confirmarea plății ca pas separat (regulile §14). Membrii: „Recomandă-i administratorului”.
- Nicio recomandare proactivă pentru add-on în MVP; doar la acțiunea utilizatorului.

## 7. Notificările operaționale (email + panoul Hub)

- Email și notificare în aplicație pentru „Telefonul afacerii e deconectat” și „Mesajele nu pleacă”: subiect, text scurt, ce să verifici, buton spre setări. Categoria `operational` (secțiunea de notificări operaționale din NotificationsPanel, nu „Recomandări”).

## 8. Founder · O afacere (FounderBusiness)

- Secțiune mică „SMS de pe numărul propriu”: telefoane conectate, stare, versiunea aplicației, plafonul de trimitere pe telefon (editabil doar aici, cu limita maximă afișată), mesaje pe ultimele 30 de zile pe stări.

## 9. Pagina de descărcare a aplicației și ghidurile pe mărci

- O pagină simplă (pe domeniul Ventora), localizată în 6 limbi: ce e aplicația, linkul de descărcare, cum se instalează din afara Magazin Play, verificarea autenticității, ghid pe mărci (Samsung, Xiaomi, Motorola, Google Pixel, alte mărci) pentru economisirea bateriei.

## 10. Termeni noi pentru glosar (de propus în revizuirea de microcopy)

telefonul afacerii · aplicația Ventora pentru telefon · conectat / deconectat · predat telefonului · trimis · livrat · nu s-a trimis · neconfirmat · SMS de probă · capacitate de trimitere · rezervă (când telefonul nu e disponibil)

## 11. Ce NU apare

- Nicio ofertă comercială în fluxul de conectare, în starea mesajelor sau în alerte.
- Niciun termen tehnic (gateway, webhook, APK, heartbeat, idempotency).
- Nicio opțiune care să permită trimiterea de mesaje de marketing de pe telefonul afacerii (MVP).
