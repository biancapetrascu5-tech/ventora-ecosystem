# SMS DE PE NUMĂRUL PROPRIU AL AFACERII — Core Messaging + Ventora Booking

**Versiune:** 1.1
**Data:** 26 octombrie 2026
**Status:** APROBAT CONDIȚIONAT de fondatori (D-SMS-1…9). Condiția: validarea tehnică (experimentul E-SMS-1) și validarea juridică (D-SMS-7).
**Implementare:** NU începe înainte de E-SMS-1. Faza 0 nu se întrerupe.
**Legături:** `ARCHITECTURE.md` v0.3.1 (§4, §8.5, §11.5, §12, §15, §17.15) · `checklists/01-booking.md` (secțiunea „Comunicare & Automatizări”) · `design/SPEC_ECRANE_SMS.md`

## Istoric

| Versiune | Data | Modificare |
|---|---|---|
| 0.1 | 24.10.2026 | Propunere (`proposals/PROPUNERE_SMS_NUMAR_PROPRIU.md`, înlocuită de acest document) |
| 1.0 | 24.10.2026 | Aprobare condiționată, cu cele 13 clarificări ale fondatorilor (§0). Corectate: politica Google Play (verificată pe text), limita Android (nu e universală), stările (`UNKNOWN` separat de `FAILED`). Extins E-SMS-1. Adăugată verificarea gateway-ului înainte de integrare. |
| 1.1 | 26.10.2026 | Regula textului SMS (§3.10, D-SMS-10): fără diacritice românești, cel mult 160 de caractere GSM-7 (1 SMS), contor afișat. Mai multe telefoane (§3.5, D-SMS-11): același client pe același telefon, preluarea mesajelor nepredate la deconectare. Decizii din designul ecranelor (S1–S41). |

---

## 0. Deciziile fondatorilor (24.10.2026)

| # | Decizie | Status |
|---|---|---|
| 1 | SMS de pe numărul propriu e **obligatoriu pentru lansarea comercială a Ventora Booking**, cu condiția validării tehnice și juridice. Dacă una dintre validări pică, decizia revine fondatorilor (lansare fără funcționalitate / amânare / altă soluție). | CONFIRMAT (condiționat) |
| 2 | Arhitectura Core Messaging cu adaptoarele `SMS_PROVIDER` și `ANDROID_SIM` (D-SMS-1) | CONFIRMAT |
| 3 | Ordinea de evaluare: **SMS Gateway for Android**, apoi **textbee** dacă e necesar. Aplicația proprie rămâne alternativă, nu implementare implicită (D-SMS-2). | CONFIRMAT |
| 4 | Distribuirea prin **APK** e acceptată ca opțiune inițială. Distribuirea prin Google Play **nu e exclusă**: se verifică eligibilitatea exactă (§5) (D-SMS-3). | CONFIRMAT |
| 5 | Limita de trimitere a sistemului Android **nu e universală**. Se folosește un plafon conservator, configurabil, validat pe dispozitivele testate (§3.5). | CONFIRMAT |
| 6 | Model comercial: **un dispozitiv inclus** în planurile Booking eligibile; **dispozitive suplimentare ca add-on**. Prețurile și planurile eligibile se stabilesc ulterior (D-SMS-4). | CONFIRMAT (modelul); prețurile: NECESITĂ DECIZIE |
| 7 | Fără rezervă cu cost implicită. Emailul e opțional. SMS prin furnizor doar cu acord explicit (D-SMS-5). | CONFIRMAT |
| 8 | În MVP, SIM-ul propriu trimite **doar mesaje operaționale**: remindere, confirmări, modificări, anulări (D-SMS-6). | CONFIRMAT |
| 9 | E-SMS-1 extins: SMS-uri lungi, diacritice, multipart, restartarea telefonului, actualizări Android, pierderea conexiunii, confirmări de stare întârziate (§7). | CONFIRMAT |
| 10 | Rezultatele incerte sunt `UNKNOWN`, separat de `FAILED`. Nu se afirmă că un mesaj nu a plecat dacă asta nu se poate confirma (§3.3). | CONFIRMAT |
| 11 | Înainte de integrare se verifică licența, securitatea, mentenanța și mecanismul real de autentificare al gateway-ului ales (§6). | CONFIRMAT |
| 12 | Cele 7 funcționalități se adaugă în checklistul Booking (59 → 66), cu dependența de experiment documentată (D-SMS-9). | CONFIRMAT |
| 13 | Cerințele pentru ecranele suplimentare se pregătesc pentru Claude Design (`design/SPEC_ECRANE_SMS.md`). | CONFIRMAT |

Rămân deschise: prețurile și planurile eligibile (D-SMS-4), validarea juridică (D-SMS-7), furnizorul SMS (D-SMS-8), gateway-ul final (după E-SMS-1).

---

## 1. Scop

Afacerea poate trimite automat reminderele și mesajele operaționale din Booking **de pe numărul ei de telefon**, folosind un SIM pus într-un telefon Android conectat securizat la Ventora.

**Criteriul de acceptare:** un reminder programat în Booking este trimis efectiv de pe SIM-ul conectat, fără intervenție manuală, iar administratorul poate verifica starea expedierii.

**De ce Android:** iOS nu permite unei aplicații să trimită SMS fără ca utilizatorul să apese „Trimite” pentru fiecare mesaj. Clienții cu iPhone folosesc un telefon Android dedicat, ieftin, sau trimit prin furnizorul SMS Ventora.

---

## 2. Opțiunile pentru telefon (ordinea aprobată)

| Ordine | Opțiune | Ce e | Observații |
|---|---|---|---|
| 1 | **SMS Gateway for Android** (sms-gate.app), server privat găzduit de noi | Aplicație Android open-source (Apache 2.0) + server propriu; stări Pending / Processed / Sent / Delivered / Failed; webhook-uri `sms:sent`, `sms:delivered`, `sms:failed`; ID de mesaj unic (duplicatul e respins); `validUntil` / `ttl`; criptare end-to-end; citește SMS-urile primite | Autentificarea dispozitivelor în modul privat: **neconfirmată**, se verifică (§6) |
| 2 | **textbee**, găzduit de noi (doar dacă 1 nu trece) | Open-source (MIT); stări pending / dispatched / sent / delivered / failed; webhook-uri semnate HMAC-SHA256; alegerea SIM-ului pe dual-SIM; heartbeat | Stack separat: MongoDB, Redis, proiect Firebase propriu, build propriu de APK |
| — | Cloud-ul public al gateway-ului | Serviciul găzduit de autori | Doar pentru o probă cu **date fictive**. În producție, numerele clienților nu trec prin terți fără contract de procesare. |
| Alternativă | **Aplicație companion proprie** | Scrisă de noi, eventual pornind de la codul opțiunii 1 (licența permite) | Doar dacă 1 și 2 eșuează la criteriile E-SMS-1. Efort suplimentar estimat: 4–6 săptămâni + întreținere. |

---

## 3. Arhitectura

### 3.1 Poziția în sistem

Mesageria e un serviciu **Core** (`core/messaging`), folosit de `core/notifications`. Booking cere doar „trimite acest mesaj operațional”; nu știe pe ce canal pleacă. Celelalte aplicații primesc aceeași capabilitate fără reconstrucție.

```
Booking (reminder programat)
   │ contract: notifications.send({ category: 'operational', channel: 'sms',
   │            template, recipient, idempotencyKey, validUntil })
   ▼
core/notifications ── limba, șablonul, preferințele ──► core/messaging
                                                        │
                                  setarea organizației: messaging.sms.method
                                  ┌──────────────────────┴───────────────────────┐
                                  ▼                                              ▼
                       adaptor SMS_PROVIDER                           adaptor ANDROID_SIM
                       (furnizor: D-SMS-8)                            (gateway găzduit de noi;
                                                                       aplicația proprie doar
                                                                       ca alternativă)
                                                                              │
                                                                   telefonul Android al afacerii
```

- **Interfața comună** `SmsChannel`: `send`, `cancel`, `getStatus`, plus evenimentele de stare.
- **Setarea pe organizație:** `messaging.sms.method = 'SMS_PROVIDER' | 'ANDROID_SIM' | 'DISABLED'`, aleasă de Owner/Admin în setările Booking.
- **Fluxul:** outbox → Inngest → adaptor (ARCHITECTURE §11.2–11.3). Nimic nu se trimite direct dintr-un request.
- **Restricția MVP:** adaptorul `ANDROID_SIM` acceptă doar mesaje cu `category: 'operational'` și un tip din lista permisă (`reminder`, `confirmation`, `change`, `cancellation`). Orice altceva e respins de server, nu doar ascuns în interfață.

### 3.2 Dispozitivul: împerechere, autentificare, revocare

1. Owner/Admin: Booking → Setări → Trimitere SMS → „Conectează un telefon”.
2. Apare un **cod QR cu un cod de împerechere de unică folosință** (10 minute, stocat ca hash, legat de organizație).
3. Telefonul primește o **credențială de dispozitiv**, separată de sesiunile utilizatorilor:
   - o singură organizație, scopuri `sms:send` și `sms:status`;
   - pe server doar hash-ul;
   - rotire periodică;
   - revocare oricând, cu efect la următorul apel.
4. Webhook-urile de stare sunt **semnate** și verificate; unul nesemnat sau pentru alt dispozitiv e respins.
5. Toate acțiunile (împerechere, revocare, schimbarea metodei, retrimiterea manuală) se auditează.
6. Telefonul primește doar numărul destinatarului și textul. Nicio altă dată a organizației.

Mecanismul exact depinde de gateway: dacă autentificarea lui nativă nu atinge nivelul de mai sus, se completează cu un strat propriu sau gateway-ul e respins (§6).

### 3.3 Stările mesajului

| Stare | Când | Ce înseamnă sigur | Afișat |
|---|---|---|---|
| `QUEUED` | În coada noastră | Nu a plecat la telefon | „În așteptare” |
| `DISPATCHED` | Telefonul a confirmat primirea | Telefonul îl are | „Predat telefonului” |
| `SENT` | Telefonul confirmă trimiterea în rețea | A plecat | „Trimis” |
| `DELIVERED` | Raport de livrare de la operator (dacă există) | A ajuns | „Livrat” |
| `FAILED` | Eșec **confirmat**: nu a plecat | Nu a plecat | „Nu s-a trimis” + motivul |
| `UNKNOWN` | Rezultat **neconfirmat**: predat telefonului, dar fără confirmare de trimitere sau eșec în timpul așteptat | Nu știm | „Stare neconfirmată” + explicația |
| `CANCELLED` | Programarea anulată sau mutată înainte de trimitere | Nu a plecat | „Anulat” |

**Regula `FAILED` vs. `UNKNOWN`:**
- `FAILED` doar când există o dovadă că mesajul nu a plecat: nu a ajuns niciodată la telefon (expirat în coada noastră), telefonul raportează eroare de trimitere (fără semnal, fără credit, SIM blocat, refuzat de sistem), gateway-ul l-a respins.
- `UNKNOWN` când mesajul a ajuns la telefon și nu avem confirmare nici de trimitere, nici de eșec. Interfața nu spune „nu s-a trimis”; spune „Nu am primit confirmarea de la telefon. Mesajul poate să fi plecat.”
- `UNKNOWN` poate deveni ulterior `SENT`, `DELIVERED` sau `FAILED` dacă sosește o confirmare întârziată (§3.4). Tranziția inversă nu există.
- Motivele `FAILED`, tipizate: `EXPIRED_IN_QUEUE`, `DEVICE_REVOKED`, `NO_SIGNAL`, `NO_CREDIT`, `SIM_ERROR`, `REJECTED_BY_GATEWAY`, `REJECTED_BY_SYSTEM`, `DELIVERY_FAILED`.

### 3.4 Fără duplicate, retry controlat, confirmări întârziate

- **Cheia de idempotență** deterministă: `booking.reminder:{appointmentId}:{reminderRuleId}:{scheduledFor}`, cu constrângere unică în baza de date, trimisă și ca ID de mesaj către gateway.
- **Retry doar înainte de predare** (`QUEUED`), cu backoff și un număr limitat de încercări.
- **După `DISPATCHED` nu se retrimite automat.** Fără confirmare în fereastra stabilită → `UNKNOWN`. Preferăm o stare neconfirmată, semnalată, unui SMS primit de două ori.
- **Confirmările întârziate** sunt acceptate și aplicate pe orice mesaj care nu e în stare finală confirmată (inclusiv `UNKNOWN`), cu ora reală a evenimentului. Confirmările duplicate sau în ordine greșită nu dau înapoi starea (ex. un `SENT` care sosește după `DELIVERED` e ignorat).
- **Expirarea:** `validUntil` = ora programării. Un mesaj expirat în coada noastră nu mai pleacă și devine `FAILED (EXPIRED_IN_QUEUE)`. Același `validUntil` se trimite și gateway-ului, ca telefonul să nu-l trimită după ce revine online.
- **Reprogramare / anulare:** mesajele `QUEUED` se anulează; cele `DISPATCHED` primesc cerere de anulare la gateway, iar rezultatul se raportează exact (anulat / trimis deja / `UNKNOWN`).
- **Retrimiterea manuală** de către administrator: pentru `FAILED` și `UNKNOWN`, cu confirmare. Pentru `UNKNOWN`, dialogul avertizează că mesajul poate să fi plecat deja. Cheie nouă, auditată.

### 3.5 Eșalonarea și plafonul de trimitere

- Android standard (AOSP) are o verificare implicită de **30 de SMS-uri în 30 de minute** pe aplicație; la depășire, sistemul cere confirmarea utilizatorului, ceea ce oprește trimiterea automată. Producătorii pot modifica această valoare, deci **nu e universală**.
- Plafonul nostru e **conservator și configurabil pe dispozitiv**: valoarea inițială propusă e 20 de mesaje la 30 de minute, ajustată de Founder după măsurătorile E-SMS-1 pe fiecare model testat. Valoarea nu poate fi ridicată de client.
- Reminderele cu o zi înainte se împrăștie într-o fereastră (de exemplu 10:00–19:00), nu pleacă toate odată.
- Ore de liniște implicite 09:00–20:00, în fusul organizației.
- Dacă volumul estimat al unei zile depășește capacitatea dispozitivelor conectate, administratorul vede avertismentul **înainte**, în setări și în Booking · Azi.
- Cu mai multe dispozitive (add-on), coada le împarte; un mesaj e legat de un singur dispozitiv după predare.
- **Același client, același telefon (D-SMS-11):** când e posibil, mesajele unui client pleacă mereu de pe același telefon (de exemplu, telefonul de pe care a primit primul mesaj), ca să nu primească de pe numere diferite și ca răspunsurile lui să ajungă în același loc. Dacă telefonul acela e deconectat, se aplică regula de mai jos.
- **Un telefon se deconectează (D-SMS-11):** mesajele încă nepredate lui (în coada noastră) trec automat pe celelalte telefoane conectate, în limita capacității lor. Mesajele deja predate lui rămân ale lui: pleacă dacă revine înainte de termen, altfel devin `FAILED` sau `UNKNOWN` după regulile din §3.3–3.4. Nu se retrimit automat pe alt telefon, ca să nu existe duplicate. Capacitatea afișată scade corespunzător și apare alerta obișnuită.

### 3.6 Monitorizarea și alertele

- **Heartbeat** periodic: online, baterie, încărcare, semnal, SIM activ, versiunea aplicației, versiunea Android.
- „Deconectat” după 15 minute fără heartbeat (configurabil).
- **Alertă către Owner/Admin** (notificare operațională în aplicație + email + rând în „Au nevoie de tine” din Booking · Azi) când:
  - telefonul e deconectat și sunt mesaje programate în următoarele ore;
  - 3 eșecuri consecutive;
  - mesaje `UNKNOWN` acumulate peste un prag;
  - baterie sub 15% fără încărcare;
  - versiunea aplicației e prea veche sau Android s-a actualizat și telefonul nu a mai raportat corect.
- Alertele sunt **operaționale**: nu intră sub plafoanele Growth și nu se opresc din preferințele comerciale.

### 3.7 Costuri și rezerve

- **Implicit: nicio rezervă cu cost.** Telefonul indisponibil → mesajul rămâne în așteptare până expiră → `FAILED (EXPIRED_IN_QUEUE)` → alertă.
- **Opțiuni setate explicit de Owner:**
  - rezervă prin **email** (gratuită), dacă clientul are email;
  - rezervă prin **furnizorul SMS cu cost**, doar bifată explicit, cu prețul afișat, consumând din cota de SMS a abonamentului.
- Mesajele `UNKNOWN` **nu declanșează** nicio rezervă automată (risc de dublură).
- SMS-urile trimise de pe SIM-ul propriu **nu consumă** din cota de SMS Ventora; se contorizează separat, pentru statistică.
- **Model comercial (D-SMS-4):** funcționalitatea `booking.sms.ownNumber` în planurile Booking eligibile; numărul de dispozitive e o **cotă de stoc** (`booking.sms.devices`, 1 inclus); dispozitivele suplimentare sunt **add-on**, cumpărabile de Owner (D-COM-6). Prețurile și planurile eligibile: NECESITĂ DECIZIE.

### 3.8 Confidențialitate, securitate, operatori

- Conținutul și numerele sunt criptate între serverul nostru și telefon.
- Pe server: textul mesajului doar cât e nevoie (retenția: ARCHITECTURE §17.4 punctul 8); istoricul păstrează starea, ora și destinatarul.
- SMS-urile rămân și în istoricul telefonului: clientul e informat la activare; recomandăm telefon dedicat, cu PIN.
- Răspunsurile „STOP” primite pe SIM se pun pe lista de excludere, dacă gateway-ul ales citește SMS-urile primite.
- **Condițiile operatorilor** și **baza legală pentru remindere**: validare juridică obligatorie înainte de lansare (D-SMS-7). La activare, clientul acceptă o declarație că folosește un SIM al afacerii și respectă condițiile operatorului său.

### 3.9 Configurarea în Booking

Fluxul și ecranele: `design/SPEC_ECRANE_SMS.md`. Pe scurt: alegerea metodei → ce îți trebuie → instalarea aplicației → codul QR → SMS de probă → starea permanentă a telefonului și a fiecărui mesaj.

### 3.10 Textul SMS-urilor (D-SMS-10, CONFIRMAT 26.10.2026)

- **SMS-urile către clienți folosesc doar alfabetul GSM-7:** fără diacritice românești (ă, â, î, ș, ț), fără ghilimele „” și apostrof ’. Un singur caracter din afara GSM-7 trece mesajul pe UCS-2, unde un SMS are 70 de caractere în loc de 160, deci costul și timpul de trimitere cresc de până la 3 ori.
- **Ținta: un SMS (≤ 160 de caractere GSM-7).** Șabloanele se scriu sub această limită, cu variabilele la lungime realistă.
- Germana și italiana își păstrează literele care sunt în GSM-7 (ä, ö, ü, ì, ò…); franceza și spaniola la fel pentru literele din GSM-7. Ce nu e în GSM-7 se transliterează.
- **Pe server:** textul final trece printr-o normalizare GSM-7 (transliterare, înlocuirea ghilimelelor), apoi se calculează segmentele; dacă depășește 1 SMS, se loghează un avertisment (nu se blochează trimiterea). Interfața arată „1 SMS · {n} caractere”.
- E-mailurile și interfața rămân cu diacritice.

---

## 4. Dependențe

| Dependență | De ce | Când |
|---|---|---|
| Outbox + Inngest (E7) | Coada, retry-ul | Validat în F0, construit în F4 |
| `core/notifications` | Șabloane, limbă, categoria operațională | F4 |
| Credențiale revocabile (E9) | Credențiala dispozitivului | Validat în F0, construit în F2 |
| `core/commercial` | Funcționalitatea pe plan, cota de dispozitive, add-on-ul | F3 |
| Furnizorul SMS (D-SMS-8) | Adaptorul `SMS_PROVIDER` | Decizie înainte de F4 |
| Ecranele (Claude Design) | §3.9 | Înainte de implementarea Booking |
| Validarea juridică (D-SMS-7) | §3.8 | Înainte de lansarea comercială |
| Telefoane Android de test (cel puțin 2 mărci) + SIM-uri cu credit | E-SMS-1 | Înainte de E-SMS-1 |

---

## 5. Distribuirea aplicației Android (verificat pe politica Google Play)

**Opțiunea inițială: APK** descărcat de pe domeniul Ventora, cu ghid de instalare, semnătură verificată și verificarea versiunii în aplicație.

**Google Play nu e exclus.** Politica „Use of SMS or Call Log permission groups” cere ca aplicația să fie handler-ul SMS implicit, **cu excepții** aprobate de Google după declarație în Play Console. Verificat pe textul politicii:
- `SEND_SMS` e eligibil pentru excepțiile **„Device automation”** și **„Connected device companion apps that enable sending/receiving of SMS or calls”**, ambele „subject to Google Play review and approval”;
- excepția pentru **CRM / enterprise** nu include `SEND_SMS` (pentru CRM sunt permise doar `READ_CALL_LOG` și `PROCESS_OUTGOING_CALLS`);
- nu există o excepție numită „SMS gateway”.

**Concluzie:** încadrarea noastră într-una din cele două excepții e **incertă**, nu imposibilă. Pași:
1. În E-SMS-1: verificăm dacă aplicația gateway aleasă e publicată în Play și sub ce excepție.
2. Înainte de lansare: evaluăm încadrarea (cu cine e nevoie) și, dacă e realistă, depunem Permissions Declaration Form pentru varianta noastră.
3. Până la un răspuns pozitiv de la Google, APK rămâne calea de distribuire.

---

## 6. Verificarea gateway-ului înainte de integrare

Pentru gateway-ul ales, înainte de orice integrare, raport în `docs/experiments/E-SMS-1.md`:

| Domeniu | Ce se verifică | Respins dacă |
|---|---|---|
| **Licență** | Licența aplicației și a serverului, licențele dependențelor, dreptul de fork și rebranding, obligațiile (atribuire, NOTICE) | Licență incompatibilă cu uzul comercial sau cu modificarea |
| **Securitate** | Autentificarea reală a dispozitivelor în modul server privat (cum se emite, unde se stochează, dacă se poate revoca și roti); semnarea webhook-urilor; criptarea; ce date păstrează telefonul și serverul; suprafața expusă (porturi, API local); istoricul vulnerabilităților | Dispozitivul nu poate fi revocat individual, webhook-urile nu pot fi verificate, sau stochează date pe care nu le putem controla |
| **Mentenanță** | Frecvența release-urilor, ultima versiune, numărul de contributori activi, timpul de răspuns la issue-uri, compatibilitatea cu ultimele versiuni Android, procesul de actualizare a aplicației pe telefoane | Proiect abandonat sau un singur întreținător fără activitate recentă (atunci: fork asumat sau opțiunea următoare) |
| **Operare** | Ce infrastructură cere serverul (bază de date, push, cozi), cum se monitorizează, cât costă găzduirea | Cost sau complexitate disproporționată față de alternativă |
| **Funcțional** | Stări, ID unic, `validUntil`, anulare, multipart, alegerea SIM-ului, SMS-uri primite | Lipsesc stările necesare pentru §3.3 |

---

## 7. Experimentul E-SMS-1

**Când:** după închiderea Fazei 0, înainte de implementarea Booking. Nu întrerupe Faza 0.
**Unde:** `labs/`, ca experimentele Fazei 0.
**Echipament:** cel puțin două telefoane Android de mărci diferite (de preferat unul Samsung și unul Xiaomi), SIM-uri cu credit de la operatori diferiți.

| # | Scenariu | Trece dacă |
|---|---|---|
| 1 | 50 de remindere programate pe 24 de ore | Toate au o stare finală corectă; zero duplicate |
| 2 | **SMS lung** (peste 160 de caractere GSM-7) și **multipart** | Primit întreg, în ordine, ca un singur mesaj; numărul de segmente e înregistrat |
| 3 | **Diacritice** (ă, â, î, ș, ț, inclusiv forma cu virgulă) | Afișate corect pe destinatar; trecerea la UCS-2 (70 de caractere pe segment) e calculată corect în estimarea segmentelor |
| 4 | **Restartarea telefonului** în timpul unei cozi | Aplicația repornește singură; mesajele `QUEUED` pleacă; niciun duplicat; mesajele `DISPATCHED` dinainte de restart au o stare corectă sau `UNKNOWN` |
| 5 | **Actualizare Android** (sau a aplicației) între două loturi | Aplicația funcționează după actualizare sau alerta apare; nicio pierdere tăcută |
| 6 | **Pierderea conexiunii la internet** (Wi-Fi și date oprite), apoi revenire | Alerta de deconectare apare; mesajele expirate nu mai pleacă; cele valide pleacă la revenire, o singură dată |
| 7 | **Confirmări de stare întârziate** (rețeaua revine după ore) | `UNKNOWN` devine `SENT`/`DELIVERED` corect; ora reală e păstrată; confirmările în ordine greșită nu dau starea înapoi |
| 8 | Telefon fără semnal / fără credit / SIM scos | `FAILED` cu motivul corect, unde telefonul îl raportează; altfel `UNKNOWN`, niciodată „nu s-a trimis” fals |
| 9 | Același reminder declanșat de două ori | Un singur SMS primit |
| 10 | Programare anulată după `DISPATCHED` | Rezultatul anulării raportat exact |
| 11 | Revocarea dispozitivului în timpul unei cozi | Următorul apel e respins; nimic nu mai pleacă de pe el |
| 12 | Funcționare în fundal 72 de ore, fără interacțiune, pe fiecare marcă | Heartbeat continuu; ghidul de setări (economisirea bateriei) e scris pentru fiecare marcă testată |
| 13 | **Plafonul real** de trimitere pe fiecare model | Se măsoară pragul la care sistemul cere confirmare; plafonul nostru inițial se ajustează sub el |
| 14 | Rapoartele de livrare pe fiecare operator testat | Se notează ce operatori trimit `DELIVERED` |
| 15 | Verificarea gateway-ului (§6) și disponibilitatea în Google Play (§5) | Raport complet |

**Rezultat:** `docs/experiments/E-SMS-1.md` (ipoteză, setup, rezultate, măsurători, concluzie) + ADR cu gateway-ul ales (D-SMS-2) + plafonul inițial pe modele + lista de telefoane recomandate.

**Dacă E-SMS-1 pică pentru ambele gateway-uri:** se raportează concret, iar fondatorii decid între aplicația proprie și reconsiderarea obligativității pentru lansare (§0, punctul 1).

---

## 8. Efort estimat

Orientativ; se recalibrează cu viteza măsurată în Faza 0.

| Bloc | Efort |
|---|---|
| E-SMS-1 extins (15 scenarii, 2 gateway-uri dacă e nevoie, 72 de ore de test în fundal) | 1–1,5 săptămâni |
| `core/messaging`: interfața, stările (inclusiv `UNKNOWN`), coada, idempotența, eșalonarea | 1–1,5 săptămâni |
| Adaptorul `SMS_PROVIDER` | 2–3 zile |
| Adaptorul `ANDROID_SIM`: împerechere, credențiale, webhook-uri, confirmări întârziate | 1,5–2 săptămâni |
| Monitorizare, alerte, ecranele din Booking | 1 săptămână |
| Teste și ghidurile de instalare (pe mărci de telefon) | 1 săptămână |
| **Total, cu gateway existent** | **≈ 6–8 săptămâni** |
| Dacă e nevoie de aplicația proprie | **+ 4–6 săptămâni** și întreținere continuă |

---

## 9. Teste obligatorii la implementare

- cap-coadă pe telefon real, în staging: programare → reminder → `SENT` (și `DELIVERED` dacă există) → starea vizibilă pe detaliul programării;
- telefon oprit: alerta apare, mesajul nu pleacă după `validUntil`, nicio rezervă cu cost;
- același reminder de două ori: un singur SMS;
- dispozitiv revocat: nimic nu mai pleacă;
- `UNKNOWN` nu e afișat niciodată ca „nu s-a trimis”; o confirmare întârziată îl actualizează;
- adaptorul `ANDROID_SIM` respinge mesajele non-operaționale (test pe server);
- SMS lung cu diacritice: estimarea segmentelor corectă;
- normalizarea GSM-7: un șablon românesc cu diacritice iese fără diacritice, în 1 SMS, cu contorul corect (inclusiv caracterele duble GSM-7: €, [, ], {, }, ~, |, ^);
- nicio rezervă prin furnizor fără opțiunea bifată de Owner.

---

## Surse

- [SMS Gateway for Android — documentație](https://docs.sms-gate.app) · [API](https://context7.com/capcom6/android-sms-gateway)
- [textbee](https://github.com/vernu/textbee)
- [Google Play — Use of SMS or Call Log permission groups](https://support.google.com/googleplay/android-developer/answer/10208820?hl=en)
- [XDA — limita implicită de trimitere SMS pe Android](https://www.xda-developers.com/change-sms-limit-android/amp/)
- [Ghid reglementare SMS România (sent.dm)](https://www.sent.dm/resources/romania-sms-guide) — sursă secundară; regulile se validează juridic
