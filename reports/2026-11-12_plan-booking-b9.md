# Planul B.9 — programările complexe (B.9a–e)

Data: 2026-11-12. Status: **PROPUS**; aștept aprobarea Biancăi pe deciziile de mai jos.

**Designurile (S126):** `BookingMultiService`, `BookingRecurring`, `BookingWaitlist`, `BookingClasses`, `BookingPackages`.

Ca la B.8–B.12, fiecare sublot are doar backend (migrare, server, contract, teste); ecranele vin în loturi UI separate. Fiecare sublot e un PR „[SQL de revizuit]” cu baza `main`. Niciunul nu recreează `erase_client`, cu excepția B.9c (lista de așteptare are notițe libere) și B.9e (vânzările de pachete).

## B.9a — mai multe servicii într-o vizită

**Modelul.** Fiecare pas e o programare obișnuită (are membrul lui, coloana lui în calendar, stările lui, istoricul lui). Pe `booking.appointment` se adaugă patru coloane:
- `visit_id` (id-ul vizitei);
- `visit_step` (1..n);
- `visit_steps` (n);
- `break_after_minutes` (0, 5, 10, 15, 30).

CHECK-urile țin coloanele împreună. Fără tabel nou.

**Crearea:** `createVisit`:
- primește clientul, ora de început și pașii (serviciu + membru, opțional durata, pauza de după);
- un pas începe la sfârșitul pasului precedent plus pauza;
- toți pașii se scriu într-o singură tranzacție, cu aceleași verificări ca la o programare (programul membrului, suprapunerile, resursele, locația);
- **la conflict:** eroarea spune pasul (`Conflict('visit_step_unavailable:<n>')`), iar `findVisitStart` găsește prima oră din aceeași zi la care încap toți pașii („Folosește 11:15”).

**Calendarul și detaliul:**
- `Appointment` primește `visit: { id, step, steps, breakAfterMinutes } | null` (pentru „1/3 · Vopsit rădăcină”);
- `getVisit` întoarce pașii, durata totală cu pauze și totalul prețului.

**Deciziile tehnice (le propun eu):**

| | Propunere | De ce |
|---|---|---|
| T-9a-1: cota `booking.appointments` | **o unitate pe pas** | Fiecare pas e o programare, iar rezervarea, confirmarea și reconcilierea cotei merg deja pe id-ul programării; anularea la timp dă unitatea înapoi tot pe programare. O unitate pe vizită ar cere schimbări în saga cotei și în jobul de reconciliere. Alternativa e de discutat dacă salonul pierde prea multe unități |
| T-9a-2: „Oricine e liber” pe un pas | **nu în B.9a**; fiecare pas are un membru ales | Designul arată un membru pe pas |
| T-9a-3: câți pași | **2–5** | — |

**DE DECIS (S126), aplicate ca PROPUS:**
- **D-9a-1, mutarea / anularea:** toată vizita se mută sau se anulează împreună (`moveVisit`, `cancelVisit`); un singur pas se schimbă doar din detaliu, de către echipă (mutarea și anularea unei programări obișnuite rămân valabile pe pas).
- **D-9a-2, online:** nu pe pagina publică în pilot.

## B.9b — programările recurente

**Modelul:**
- tabelul `booking.appointment_series`: regula (săptămânal / la 2 săptămâni / lunar), până când (o dată sau un număr), membrul, serviciul, ora;
- pe programare: `series_id` + `series_index`;
- programările seriei se creează toate odată, după verificarea fiecărei date;
- conflictele se întorc înainte de salvare, cu motivul fiecărei date și cele trei opțiuni: sare data, ora liberă cea mai apropiată, alt membru.

**Modificarea / anularea:** „Doar aceasta”, „Aceasta și următoarele”, „Toate din serie” (cele care au avut loc rămân în istoric).

**DE DECIS (S126), PROPUS:**
- **D-9b-1:** cel mult 52 de programări sau 12 luni;
- **D-9b-2:** lunar = „a treia marți a lunii”; o dată care nu există se sare;
- **D-9b-3:** avansul se plătește pe fiecare programare, la confirmarea ei (B.22).

**Cota:** o unitate pe programare, rezervate toate la creare. La limita cotei, seria nu se creează (QuotaExceeded, cu câte unități ar trebui).

## B.9c — lista de așteptare

**Modelul:**
- tabelul `booking.waitlist_entry`: clientul, serviciul, membrul sau „oricine”, zilele, intervalul, nota, starea;
- tabelul `booking.waitlist_offer`: ora oferită, valabilitatea, canalul, starea; un token doar ca hash, ca la B.11b;
- jobul `booking.waitlist-offers` închide ofertele expirate și pe cele al căror loc a fost luat;
- pagina clientului: `/r/<slug>/w/<token>`, cu „Iau locul” / „Nu mai am nevoie”.

**DE DECIS (S126), PROPUS:**
- **D-9c-1:** echipa alege cui oferă; fără oferte automate în pilot (lista e în ordinea adăugării);
- **D-9c-2:** o singură ofertă activă pe un loc eliberat;
- **D-9c-3:** SMS-ul ofertei intră în cota de SMS a afacerii. Trimiterea reală rămâne oprită până la B.17/B.13; în pilot ofertele pleacă doar pe e-mail.

**GDPR:** `erase_client` șterge nota și închide intrările clientului.

## B.9d — grupurile / clasele

**Modelul:**
- o clasă e un serviciu cu „Clienți în același timp” > 1 (capacitatea există deja din B.1);
- tabelul `booking.class_session`: serviciul, membrul, sala (resursă), locurile (implicit din catalog), ora;
- participanții sunt programări legate de sesiune (`class_session_id`), una pe client; „Plin” la capacitate;
- „Se repetă săptămânal” refolosește seria din B.9b.

**DE DECIS (S126), PROPUS:**
- **D-9d-1:** o clasă e un serviciu cu capacitate > 1;
- **D-9d-2:** lista de așteptare a unei clase e automată: primul de pe listă primește oferta (prin B.9c);
- **D-9d-3:** rezervarea online e permisă, cu locurile rămase afișate; se închide la „Plin” sau la ora-limită online.

**Ordinea:** după B.9b și B.9c, de care depinde.

**Împărțirea (12.11):** B.9d are două părți:
- **B.9d1**, cu baza `main`:
  - sesiunile, participanții, calendarul;
  - sala și membrul ocupate de sesiune, ca reguli ale bazei de date;
  - anularea sesiunii;
  - „Se repetă săptămânal”, ca grup de sesiuni.
- **B.9d2**, după merge-ul #187 (B.9c):
  - lista de așteptare automată a clasei (D-9d-2);
  - rezervarea online a unui loc (D-9d-3).

## B.FK — aceeași afacere pe toate legăturile (cerut de Bianca pe 12.11, după B.9d)

Legăturile spre `client`, `service` și `staff_member` trebuie să garanteze aceeași afacere. Lotul acoperă tabelele noi (`appointment_series`, `waitlist_entry`, `waitlist_offer`, `class_session`) și pe cele vechi (`appointment`, `appointment_resource` și celelalte):
- `UNIQUE (organization_id, id)` pe `client`, `service`, `staff_member` (și `resource`, unde lipsește);
- FK-urile simple înlocuite cu FK compuse `(organization_id, …)`;
- un test care refuză, la nivelul bazei de date, id-urile altei afaceri pe fiecare legătură.

## B.9e — pachetele de ședințe

**Modelul:**
- tabelul `booking.package` (definiția): serviciul, numărul de ședințe, valabilitatea, prețul;
- tabelul `booking.package_sale`: clientul, de la / până la, cum a plătit (prin încasările B.21);
- tabelul `booking.package_use`: programarea, momentul folosirii, dacă s-a dat înapoi;
- pe programare: „Din pachet”.

**DE DECIS (S126), PROPUS:**
- **D-9e-1:** o ședință se consumă când programarea e marcată finalizată; neprezentarea sau anularea târzie consumă și ele; anularea la timp o dă înapoi;
- **D-9e-2:** ședințele expirate se pierd; owner-ul poate prelungi un pachet manual, cu motiv jurnalizat. **Prelungirea doar pentru owner: CONFIRMAT** (fondatoarea, 12.11, #195);
- **D-9e-3:** pachetele se vând doar la salon în pilot; vânzarea online, cu Stripe, mai târziu;
- **D-9e-4, contabilitatea: NECESITĂ DECIZIE (contabil).** Pachetul se facturează la vânzare (avans), nu pe ședință. Până la confirmare, B.9e nu emite documente fiscale, ci doar încasarea (B.21).

**GDPR:** `erase_client` anonimizează notele vânzărilor.

**Auditul B.9e cu codurile existente (`booking.service_updated` / `client_updated` / `appointment_updated`): CONFIRMAT** (fondatoarea, 12.11). D-9e-4 rămâne NECESITĂ DECIZIE, la contabil: nu se emit documente fiscale pentru pachete până atunci.

## Ordinea și PR-urile

**Ordinea:** B.9a → B.9b → B.9c → B.9d1 → B.9d2 → B.FK → B.9e. Câte un PR pe sublot, cu baza `main`, cel mult 3 PR-uri deschise.

**Corectura din 12.11 (fondatoarea):** B.9e a intrat înaintea lui B.9d2 (abatere acceptată). Ordinea de acum: **B.9d2 → B.FK → B.13**.

**Testele locale:** doar testele lotului (`b-files.mjs`), cu regula pentru Docker din 12.11.

**Cer aprobarea Biancăi pentru:**
- T-9a-1 (cota: o unitate pe pas);
- deciziile D-9a…D-9e;
- D-9e-4, care rămâne la contabil.
