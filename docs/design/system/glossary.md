# Glosar

Un singur cuvânt pentru fiecare lucru, în toate ecranele și în toate cele 6 limbi. Când un text nou are nevoie de un termen care nu e aici, îl adaugi întâi aici. Versiunea din 24 octombrie 2026, cu deciziile D1–D14 aprobate.

## Reguli de scriere

- **Cui vorbim.** RO „tu”, EN „you”, FR „vous”, ES „tú”, DE „Sie”, IT „Lei”. Mesajele care pleacă de la afacere către clienții ei: „dumneavoastră”.
- **SMS-urile către clienții afacerii (S38).** Fără diacritice și în cel mult 160 de caractere, adică 1 SMS: „Buna ziua! Va reamintim de programarea de vineri, 23 oct., ora 12:30, la Salon Aurora. Pentru modificari: 0722 123 456.” Un singur caracter în afara alfabetului SMS standard (ă, â, î, ș, ț, ghilimelele „”, apostroful ’, liniuța —) face mesajul de 70 de caractere, iar o reamintire obișnuită ar pleca în 3 SMS-uri. Germana (ä, ö, ü, ß) și italiana (à, è, é, ì, ò, ù) își păstrează literele, care sunt în alfabetul SMS. E-mailurile și interfața rămân cu diacritice.
- **Tonul.** Prietenos la intrare și în stările goale; precis în MoneyDesk, TeamSpace și ContractDesk; calm în erori; fără umor în mesajele critice (plăți, ștergeri, acces).
- **Butoane.** Verb la început, concret: „Programează”, „Trimite link de plată”. Niciodată „OK”. Acțiunile cu bani spun suma.
- **Anunțuri automate.** Un dialog spune că pleacă un mesaj către client doar dacă notificarea e pornită în setările afacerii; altfel nu promite nimic.
- **Erori.** Ce s-a întâmplat, apoi ce poți face. Fără vină pe om, fără coduri tehnice. Dacă nu s-au luat bani, spunem asta.
- **Diateza.** Activă: „Am emis factura”, nu „Factura a fost emisă”.
- **Nume din date.** Fără dativ și fără gen lângă un nume variabil: „Trimitem cererea către {nume}”, „{nume} (proprietar)”.
- **Plural.** Trei forme în română: „1 programare”, „2 programări”, „20 de programări”. Se scrie cu plural ICU, niciodată „{n} programări” fix.
- **Cifre.** Cantitățile cu cifre („2 ore”). Bani: „49 lei”, separator de mii punct („1.000”). Date: „23 oct. 2026”, ore „12:30”.
- **Diacritice.** ș și ț cu virgulă dedesubt (U+0219, U+021B), niciodată cu sedilă.
- **Localizare.** Fiecare limbă se scrie pentru limba ei; textele trebuie să suporte cu ~30% mai mult spațiu. Nu lipi bucăți de propoziție; frazele întregi au variabile.

## Ecosistem

| RO | EN | FR | ES | DE | IT | Regulă |
| --- | --- | --- | --- | --- | --- | --- |
| afacere | business | entreprise | negocio | Unternehmen | attività | Spațiul de lucru al unei firme în Ventora. |
| proprietar | owner | propriétaire | propietario | Inhaber | titolare | Lângă un nume, între paranteze: „Bianca Petrașcu (proprietar)”. Nu „proprietara”, nu dativ. |
| echipă | team | équipe | equipo | Team | team | Filtrul „toți oamenii” e „Toată echipa”. |
| angajat | employee | employé | empleado | Mitarbeiter | dipendente | Ca limită de abonament și nume de rol. În filtre folosește „echipa”. |
| coleg | teammate | collègue | compañero | Kollege | collega | Când vorbești despre ceilalți din echipă. |
| rol | role | rôle | rol | Rolle | ruolo |  |
| acces | access | accès | acceso | Zugriff | accesso | „Cere acces”, „Acces oprit”. |
| invitație | invitation | invitation | invitación | Einladung | invito | Singura cale de intrare. Niciodată „Creează cont”. |
| aplicație | app | application | aplicación | App | app | Numele aplicațiilor rămân în engleză în toate limbile, fără traducere și fără articol (D-UX-4): EasyBook, ClientDesk, TeamSpace, MoneyDesk, TaskBoard, ShiftPlan, DocSpace, StockDesk, DataView, CampaignKit, EventSpace, AssetDesk, ContractDesk; plus Portal și Network. Nu „Booking”, „CRM”, „HR”… în ce văd oamenii. |
| Hub | Hub | Hub | Hub | Hub | Hub | Nume propriu, nu se traduce. În texte: „aplicațiile tale”. |
| pagina afacerii (în Portal) | business page (on Portal) | page de l’entreprise (sur Portal) | página del negocio (en Portal) | Unternehmensseite (auf Portal) | pagina dell’attività (su Portal) | Ce văd clienții în Portal. Titlul cardului din launcher: „Pagina afacerii în Portal”. Nu „profil”, nu „vitrină”. |
| Gestionează pagina | Manage page | Gérer la page | Gestionar la página | Seite verwalten | Gestisci la pagina | Deschide gestionarea în platforma de business. Pagina nepublicată: „Termină pagina”. |
| Vezi cum arată în Portal | See it on Portal | Voir sur Portal | Ver cómo se ve en Portal | So sieht es auf Portal aus | Guarda come appare su Portal | Deschide pagina publică într-un tab nou; iconul de link extern spune asta. |
| Publicată / Ascunsă / Nu e publicată încă | Published / Hidden / Not published yet | Publiée / Masquée / Pas encore publiée | Publicada / Oculta / Aún no publicada | Veröffentlicht / Ausgeblendet / Noch nicht veröffentlicht | Pubblicata / Nascosta / Non ancora pubblicata | Starea paginii din Portal: lime, neutru, peach. |

## Abonament și plată

| RO | EN | FR | ES | DE | IT | Regulă |
| --- | --- | --- | --- | --- | --- | --- |
| abonament | plan | abonnement | plan | Abonnement | abbonamento | Singurul cuvânt pentru ce plătește afacerea lunar și limitele lui. Nivelul are nume propriu: „Business”. Butonul: „Cere alt abonament”. Nu „plan”. |
| pachet în plus | extra pack | pack supplémentaire | paquete extra | Zusatzpaket | pacchetto extra | Singurul termen pentru ce se cumpără peste abonament: titlu, butoane, facturi („Pachet în plus · 500 SMS”). Nu „add-on”, nu „extraopțiune”. |
| limită | limit | limite | límite | Limit | limite | Nu „cotă”. |
| consum | usage | consommation | uso | Verbrauch | utilizzo |  |
| factură | invoice | facture | factura | Rechnung | fattura |  |
| card | card | carte | tarjeta | Karte | carta | Doar marca și ultimele 4 cifre. |
| plată | payment | paiement | pago | Zahlung | pagamento |  |
| plătită | paid | payée | pagada | bezahlt | pagata | Nu „achitată”. |
| scadentă | due | à échéance | vence pronto | fällig | in scadenza | Factură cu termen în curând. |
| restantă | overdue | en retard | vencida | überfällig | scaduta | Termenul a trecut. Ton precis, fără reproș. |
| încasează | take payment | encaisser | cobrar | kassieren | incassa |  |

## Comunicare

| RO | EN | FR | ES | DE | IT | Regulă |
| --- | --- | --- | --- | --- | --- | --- |
| solicitare | request | demande | solicitud | Anfrage | richiesta | Mesaj către suportul Ventora. Nu „tichet”. |
| cerere | request | demande | solicitud | Antrag | richiesta | Acces, concediu, mutarea unei programări. |
| notificare | notification | notification | notificación | Benachrichtigung | notifica |  |
| reamintire | reminder | rappel | recordatorio | Erinnerung | promemoria | Și pentru SMS-urile de pe telefonul afacerii: „reamintire”, niciodată „reminder” (S10). Ca tip de mesaj, aceeași formă și în detaliu, și în tabel. |
| confirmarea programării / scurt: confirmare | appointment confirmation / confirmation | confirmation du rendez-vous / confirmation | confirmación de la cita / confirmación | Terminbestätigung / Bestätigung | conferma dell’appuntamento / conferma | Tipul mesajului. Forma lungă în detaliul programării, forma scurtă în tabele și pe cardurile de telefon. |
| programare mutată / scurt: mutare | appointment moved / move | rendez-vous déplacé / déplacement | cita cambiada / cambio | Termin verschoben / Verschiebung | appuntamento spostato / spostamento | La fel: lungă în detaliu, scurtă în tabel. |
| programare anulată / scurt: anulare | appointment cancelled / cancellation | rendez-vous annulé / annulation | cita cancelada / cancelación | Termin abgesagt / Absage | appuntamento annullato / annullamento | La fel. Nu se confundă cu starea mesajului „Anulat”. |
| setări | settings | paramètres | ajustes | Einstellungen | impostazioni |  |
| au nevoie de tine | needs you | à traiter | pendiente de ti | wartet auf Sie | in attesa di Lei | Titlul listei de lucruri care așteaptă o acțiune. Peach. |

## EasyBook

| RO | EN | FR | ES | DE | IT | Regulă |
| --- | --- | --- | --- | --- | --- | --- |
| programare | appointment | rendez-vous | cita | Termin | appuntamento |  |
| client | client | client | cliente | Kunde | cliente | În mesajele către clienți: „dumneavoastră”. |
| serviciu | service | prestation | servicio | Leistung | servizio |  |
| resursă | resource | ressource | recurso | Ressource | risorsa | Camere, echipamente sau spații pe care le rezervă clienții. |
| taxă de anulare | cancellation fee | frais d’annulation | cargo por cancelación | Stornogebühr | penale di cancellazione | Doar dacă afacerea a pornit-o: „Anulare gratuită cu cel puțin 24 de ore înainte. După aceea se reține {suma}.” |
| rezervare online | online booking | réservation en ligne | reserva online | Online-Buchung | prenotazione online |  |
| confirmată | confirmed | confirmé | confirmada | bestätigt | confermato |  |
| neconfirmată | not confirmed | non confirmé | sin confirmar | unbestätigt | non confermato |  |
| în desfășurare | in progress | en cours | en curso | läuft | in corso | Peach: „acum”. |
| încheiată | done | terminé | terminada | erledigt | concluso | Lime, doar ca semn mic. |
| anulată | cancelled | annulé | cancelada | abgesagt | annullato |  |
| nu a venit | no-show | absent | no se presentó | nicht erschienen | non presentato | Nu „neprezentare”. |
| blocat | blocked | bloqué | bloqueado | blockiert | bloccato | Interval în care nu se poate rezerva. |

## SMS și telefonul afacerii

| RO | EN | FR | ES | DE | IT | Regulă |
| --- | --- | --- | --- | --- | --- | --- |
| telefonul afacerii | business phone | téléphone de l’entreprise | teléfono del negocio | Geschäftstelefon | telefono dell’attività | Telefonul Android cu SIM-ul afacerii, de pe care pleacă SMS-urile. Nu „dispozitiv”, nu „gateway”. |
| aplicația Ventora pentru telefon | Ventora phone app | application Ventora pour téléphone | aplicación Ventora para el teléfono | Ventora-App für das Telefon | app Ventora per il telefono | Nu „APK”. |
| conectat / deconectat | connected / disconnected | connecté / déconnecté | conectado / desconectado | verbunden / getrennt | collegato / scollegato | Despre telefon. „Conectat” e neutru; „Deconectat” e peach doar cu mesaje în așteptare (S8). |
| în așteptare | waiting | en attente | en espera | wartet | in attesa | Mesajul e la noi și n-a plecat la telefon: „Pleacă la {ora}”. |
| predat telefonului | handed to the phone | transmis au téléphone | pasado al teléfono | an das Telefon übergeben | passato al telefono | Telefonul l-a primit, dar încă nu l-a trimis. |
| trimis | sent | envoyé | enviado | gesendet | inviato | A plecat în rețea. Lime, cu o bifă. |
| livrat | delivered | distribué | entregado | zugestellt | consegnato | A ajuns, doar când operatorul (sau furnizorul de email) confirmă. Lime, cu bifă dublă. |
| nu s-a trimis / la plural: nu au plecat | not sent | non envoyé / non envoyés | no enviado / no enviados | nicht gesendet | non inviato / non inviati | Doar când știm sigur, cu motivul pe înțeles. Singular „Nu s-a trimis” (starea unui mesaj); plural, un singur termen: „Nu au plecat” (cifrele, filtrele, alertele). Nu „Nu s-au trimis”. |
| fără confirmare | no confirmation | sans confirmation | sin confirmación | keine Bestätigung | senza conferma | Telefonul l-a primit, dar nu știm dacă a plecat: „Poate să fi plecat.” Nu „neconfirmat” (S9). Nu există pentru email. |
| SMS de probă | test SMS | SMS de test | SMS de prueba | Test-SMS | SMS di prova | Un SMS trimis de afacere către propriul număr, ca să verifice telefonul. |
| codul de conectare | connection code | code de connexion | código de conexión | Verbindungscode | codice di collegamento | Codul QR și varianta scurtă (de ex. „K7P-42Q”) cu care telefonul se leagă de afacere. Expiră în 10 minute: „Codul expiră în {m:ss}”, „Generează alt cod”. |
| declarația ta | your declaration | votre déclaration | tu declaración | Ihre Erklärung | la Sua dichiarazione | Pasul 5 din conectare: „Folosesc un SIM al afacerii și respect condițiile operatorului meu de telefonie.” Caseta e nebifată implicit. |
| capacitate de trimitere | sending capacity | capacité d’envoi | capacidad de envío | Sendekapazität | capacità di invio | Pe ecran: „Poți trimite aproximativ {n} mesaje pe oră de pe acest telefon.” |
| rezervă (când telefonul nu e disponibil) | backup (when the phone is unavailable) | solution de secours | respaldo | Ausweichweg | riserva | Implicit nu există. E-mailul e gratuit; prin Ventora consumă din SMS-urile abonamentului (S14). |

## Comercial

| RO | EN | FR | ES | DE | IT | Regulă |
| --- | --- | --- | --- | --- | --- | --- |
| recomandare | recommendation | recommandation | recomendación | Empfehlung | raccomandazione | Eticheta neutră de pe orice conținut comercial. |
| perioadă de probă | free trial | essai gratuit | prueba gratuita | kostenloser Test | prova gratuita | Butonul: „Încearcă gratuit 14 zile”. Fără card și fără plată automată: la final aplicația se oprește, datele rămân, iar continuarea e o alegere explicită. |
| cost de implementare | setup cost | frais de mise en service | coste de puesta en marcha | Einrichtungsgebühr | costo di attivazione | Apare mereu, și când e zero: „fără cost de implementare”. |

## Founder

| RO | EN | FR | ES | DE | IT | Regulă |
| --- | --- | --- | --- | --- | --- | --- |
| excepție | exception | exception | excepción | Ausnahme | eccezione | Abatere de la abonament pentru o singură afacere. Are mereu valoare, termen (cel mult 12 luni), motiv și autor. „Încheie excepția acum”, nu „Șterge”. |
| versiune (de abonament) | plan version | version de l’abonnement | versión del plan | Tarifversion | versione del piano | O schimbare de preț sau de limite face o versiune nouă. Mutarea în dezavantajul clientului: anunț cu 30 de zile înainte; doar în avantajul lui: imediat, cu anunț. |
| ofertă | offer | offre | oferta | Angebot | offerta | Un produs din modelul comercial plus textele lui aprobate. Apare doar prin sloturi Growth. |
| campanie | campaign | campagne | campaña | Kampagne | campagna | Cine vede o ofertă, unde și când: automat (la un semnal) sau programat (într-o perioadă). |
| audiență | audience | audience | audiencia | Zielgruppe | pubblico | Segment salvat, doar cu numărul estimat de afaceri; sub 5, numărul nu se arată și audiența nu se folosește. |
| rată de deranjare | disturbance rate | taux de gêne | tasa de molestia | Störungsrate | tasso di disturbo | „Nu mă interesează” la 100 de afișări. Peste 5%, campania se oprește singură și Founder primește o notificare. |
| plafon | cap | plafond | límite | Obergrenze | limite | Implicit 1 pe zi, 3 pe săptămână, 30 de zile după „Nu mă interesează”; maxime permise 2, 5 și minimum 14 zile. |

## Comercial

| RO | EN | FR | ES | DE | IT | Regulă |
| --- | --- | --- | --- | --- | --- | --- |
| Nu mă interesează | Not interested | Ça ne m’intéresse pas | No me interesa | Kein Interesse | Non mi interessa | Refuzul, neutru. Nu „Nu, mulțumesc”. |
| Amintește-mi mai târziu | Remind me later | Me le rappeler plus tard | Recordármelo más tarde | Später erinnern | Ricordamelo più tardi | În meniul recomandării: „Peste o săptămână” sau „Peste o lună”. |
| Recomandă aplicația | Recommend this app | Recommander l’application | Recomendar la aplicación | App empfehlen | Consiglia l’app | Acțiunea membrului; dedesubt, „Ajunge la {nume} (proprietar).” Stările lui: „În așteptare”, „Activată”, „Nu acum”. |
| catalogul aplicațiilor | app catalog | catalogue des applications | catálogo de aplicaciones | App-Katalog | catalogo delle app | Pe ecran: „Toate aplicațiile Ventora”. |
| pp | pp | pts | p. p. | Pp. | p.p. | „+3 pp” în grafice și carduri compacte; pentru cititoarele de ecran și în tooltip: „3 puncte procentuale”. |

## Echipă

| RO | EN | FR | ES | DE | IT | Regulă |
| --- | --- | --- | --- | --- | --- | --- |
| întârziere | late | retard | retraso | Verspätung | ritardo | Ton neutru și factual: „Întârziere · 12 min”. |

## ClientDesk

| RO | EN | FR | ES | DE | IT | Regulă |
| --- | --- | --- | --- | --- | --- | --- |
| etapă | stage | étape | etapa | Phase | fase | Etapele pipeline-ului le alege afacerea; setul implicit: Contact nou, Ofertă trimisă, Negociere, Câștigate, Pierdute. |

## Cont și securitate

| RO | EN | FR | ES | DE | IT | Regulă |
| --- | --- | --- | --- | --- | --- | --- |
| autentificare în doi pași | two-step sign-in | connexion en deux étapes | inicio de sesión en dos pasos | Anmeldung in zwei Schritten | accesso in due passaggi | Nu „2FA”, nu „verificare în doi factori” în ce văd oamenii. Obligatorie pentru proprietar și în Founder (S58). |
| aplicație de autentificare | authenticator app | application d’authentification | aplicación de autenticación | Authenticator-App | app di autenticazione | Google Authenticator, Microsoft Authenticator, 1Password. Nu trimitem coduri pe e-mail sau SMS. |
| cod de rezervă | backup code | code de secours | código de respaldo | Backup-Code | codice di riserva | Nu „cod de recuperare” (S60). 10 coduri de 8 cifre, fiecare merge o singură dată. |
| cont blocat temporar | account locked for now | compte bloqué temporairement | cuenta bloqueada temporalmente | Konto vorübergehend gesperrt | account bloccato temporaneamente | După 5 coduri greșite, 15 minute; spunem ora (S61). Roșu, ca eroare. |
| Ține-mă minte | Keep me signed in | Rester connecté | Mantener la sesión | Angemeldet bleiben | Resta connesso | Spune cât ține: „… timp de 30 de zile”. Păstrează doar sesiunea; codul se cere la fiecare intrare cu parola (S59). |
| link pentru o parolă nouă | link to set a new password | lien pour un nouveau mot de passe | enlace para una contraseña nueva | Link für ein neues Passwort | link per una nuova password | Nu „link de resetare” în ce văd oamenii. Valabil o oră, merge o singură dată (S55, S72–S77). Butonul: „Trimite linkul”; după expirare: „Cere un link nou”. |

## Etichete scurte în bara de jos pe telefon

Bara de jos lasă cel mult 70px pentru o etichetă (DM Sans 12px, 500, la 390px). Când eticheta lungă nu încape, elementul de navigare primește o formă scurtă (`short`). Forma scurtă apare doar în bara de jos pe telefon; meniul din stânga, titlurile și restul textelor folosesc forma lungă. Româna păstrează peste tot forma lungă.

| RO | EN | FR | ES | DE | IT | Regulă |
| --- | --- | --- | --- | --- | --- | --- |
| Programări (meniu) · scurt: — | Bookings | Agenda | — (Citas încape) | — (Termine încape) | Agenda | Forma scurtă (`short`) doar în bara de jos pe telefon; în rest „Appointments” / „Rendez-vous” / „Appuntamenti”. EN „Bookings” (52px), nu „Agenda”, care în engleză e ordinea de zi a unei ședințe. S70. |
| Abonament și consum · scurt: — | Plan | Usage | — (Suscripción încape) | Abo | Utilizzo | Forma scurtă (`short`) doar în bara de jos pe telefon; în rest forma lungă (Abonnement / Abbonamento, „Abonnement und Verbrauch”). „Abo” e prescurtarea uzuală în germană. EN „Plan”: în engleză e chiar cuvântul din glosar pentru abonament (D1 interzice „plan” doar în română). S70. |

## Verbe

| RO | EN | FR | ES | DE | IT | Regulă |
| --- | --- | --- | --- | --- | --- | --- |
| Adaugă | Add | Ajouter | Añadir | Hinzufügen | Aggiungi | Un element nou într-o listă. |
| Creează | Create | Créer | Crear | Erstellen | Crea | Doar meniul comun din bara de sus și rolurile. |
| Programează | Book | Réserver | Reservar | Buchen | Prenota | Butonul care salvează o programare nouă. |
| Salvează | Save | Enregistrer | Guardar | Speichern | Salva |  |
| Renunță | Cancel | Annuler | Cancelar | Abbrechen | Annulla | Închide un dialog fără schimbări. În dialogurile distructive, butonul sigur spune ce păstrează. |
| Anulează programarea | Cancel appointment | Annuler le rendez-vous | Cancelar la cita | Termin absagen | Annulla l’appuntamento | Mereu cu obiect. |
| Anulează (undo) | Undo | Annuler | Deshacer | Rückgängig | Annulla | Doar în toast-uri. |
| Șterge | Delete | Supprimer | Eliminar | Löschen | Elimina | Doar pentru ce dispare definitiv; cere confirmare. |
| Cere | Request | Demander | Solicitar | Anfragen | Richiedi | „Cere acces”, „Cere activare”, „Cere alt abonament”. |
| Cumpără | Buy | Acheter | Comprar | Kaufen | Acquista | Mereu cu prețul: „Cumpără · 49 lei”. |
| Trimite | Send | Envoyer | Enviar | Senden | Invia |  |
| Încearcă din nou | Try again | Réessayer | Reintentar | Erneut versuchen | Riprova | După o eroare. |
| Gata | Done | Terminé | Listo | Fertig | Fatto | Închide un flux încheiat cu succes. Niciodată „OK”. |
