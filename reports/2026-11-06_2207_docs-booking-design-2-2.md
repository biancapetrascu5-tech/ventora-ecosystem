# Raport: BOOKING.md §2.2 cu componentele de design existente

**Data:** 06.11.2026, 22:07 · **Ramura:** `docs/booking-design-2-2` · **Fișier:** `docs/plans/BOOKING.md`

## Componente adăugate în tabelul „Există”
Pe baza `docs/design/system/components/<Componentă>/README.md` (plus cheile i18n din `preview.html`, unde a fost nevoie):
- `BookingStatuses`: cele 7 stări, pastilele, tranzițiile, corectarea stării finale.
- `BookingClientCard`: fișa clientului, statisticile, istoricul programărilor, eticheta „Risc ridicat” cu motivul, ștergerea notei, cine vede ce.
- `BookingHealthFields`: configurarea, secțiunea din pagina publică, consimțământul, vizibilitatea, retragerea.
- `BookingPublic`: fluxul paginii publice, verificarea anti-robot (Turnstile), codul din e-mail, stările.
- `BookingDeposit`: pasul de avans prin Stripe și stările lui.
- `BookingPayments`: Stripe Connect în 4 stări, setările avansului, politica de rambursare.
- `BookingClientEmails`: e-mailurile către clienții afacerii.

Celelalte componente `Booking*` (Today, Calendar, List, New, Detail, Settings, Limit, States, Sms*) erau deja în tabel.

## Puncte scoase sau reformulate în „Lipsește din design”
- **Scos:** „conectarea contului Stripe Connect al salonului și plata avansului”. `BookingPayments` desenează conectarea în 4 stări; `BookingDeposit` desenează plata.
- **Fișa clientului**, reformulat: istoricul programărilor și eticheta cu motivul sunt în `BookingClientCard`. Rămân istoricul încasărilor (fișa arată doar suma pe programare și totalul încasat) și lista de clienți blocați.
- **Câmpurile medicale**, reformulat: formularul separat, bifa de consimțământ și vizibilitatea pe roluri sunt în `BookingHealthFields`. Rămâne jurnalul citirilor.
- **Pagina publică**, reformulat: captcha (README: „anti-robot check”, S116-D2 Cloudflare Turnstile), verificarea e-mailului și pasul de avans pentru „Risc ridicat” (`BookingPublic`, `BookingDeposit`, `BookingPayments`) sunt desenate. Rămâne pagina clientului pentru anulare / mutare.
- **Încasările**, reformulat: avansul și politica lui de rambursare sunt în `BookingDeposit` și `BookingPayments`. Rămân rambursările înregistrate din Hub, soldurile restante, istoricul financiar pe programare și codurile promoționale.
- **§4**: la B.11, „designul paginii publice” a devenit „designul paginii clientului pentru anulare / mutare”.

## Ce am lăsat la „Lipsește” și de ce
- **Catalogul de servicii** **: în `BookingSettings` există doar tab-ul „Servicii”, fără conținut.
- **Programul membrilor** **: niciun README nu descrie pauzele, zilele libere sau excepțiile pe membru.
- **Lista de clienți blocați** **: nu apare în niciun README.
- **Jurnalul citirilor medicale** **: `BookingHealthFields` nu îl descrie.
- **Pagina clientului pentru anulare / mutare** **: `BookingClientEmails` are doar linkul „Modificați sau anulați programarea”; pagina nu e desenată.
- **Istoricul încasărilor pe fișă, rambursările din Hub, soldurile, codurile promoționale**: nu sunt desenate.
- Recurente, mai multe servicii, liste de așteptare, clase, pachete, locații, formulare personalizate, rapoarte, automatizări / șabloane (follow-up, recenzii, notificări interne), asistentul AI: neschimbate. Nu există design pentru ele.

## Observații
- Diferență de semnalat: planul (D-B-6, B.11) spune că verificarea e-mailului e „opțională, pornită de salon”. În `BookingPublic`, codul e pasul standard, iar e-mailul verificat e reținut 90 de zile (S116-D1, S116-D3). N-am schimbat nicio decizie.
- Conform cerinței, §3 nu a fost atinsă. Câteva rânduri din loturi spun încă „designul lipsește” pentru elemente care acum sunt desenate: B.7 (fișa și eticheta), B.11, B.22. Se pot corecta într-o trecere separată, dacă fondatoarea vrea.
