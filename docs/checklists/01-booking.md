# 01 · Ventora Booking — checklist confirmat

**Sursa:** Ventora_Ecosystem_Specificatie_Completa_15_Aplicatii_V1.docx
**Funcționalități confirmate:** 66 (59 din specificație + 7 adăugate pe 24.10.2026, D-SMS-9)
**Stare aplicație:** Not started
**Regulă:** lista e cerința de produs. Nu se elimină, nu se adaugă și nu se reformulează funcționalități fără decizia fondatorilor. Ordinea de livrare se stabilește separat.

Bifează o funcționalitate doar când e implementată ȘI acoperită de teste.
59 funcționalități selectate · 0 excluderi explicite (în specificația sursă) · Sursă: Text
lipit(6).txt

## Calendar & Programări (9)

- [ ] Calendar zilnic, săptămânal și lunar
- [ ] Creare, editare, reprogramare și anulare programări
- [ ] Programări recurente
- [ ] Programări pentru mai multe servicii într-o vizită
- [ ] Statusuri: confirmată, finalizată, anulată, no-show
- [ ] Liste de așteptare
- [ ] Blocarea intervalelor indisponibile
- [ ] Programări pentru mai multe locații
- [ ] Programări de grup / clase

## Servicii, personal și disponibilitate (9)

- [ ] Catalog de servicii, durate și prețuri
- [ ] Categorii de servicii
- [ ] Program de lucru și reguli de disponibilitate
- [ ] Asignarea programărilor către angajați
- [ ] Pauze, zile libere și excepții de program
- [ ] Resurse rezervabile: camere, echipamente, spații
- [ ] Pachete de ședințe
- [ ] Servicii cu durată sau preț variabil
- [ ] Capacitate simultană per serviciu

## Clienți & Rezervări online (9)

- [ ] Profil client și date de contact
- [ ] Istoric de programări și preferințe
- [ ] Pagină publică de rezervări
- [ ] Linkuri directe de programare
- [ ] Confirmare automată a rezervării
- [ ] Formulare personalizate la rezervare
- [ ] Rezervare fără cont de utilizator
- [ ] Politici de anulare și reprogramare
- [ ] Lista neagră / restricții pentru abuzuri

## Comunicare & Automatizări (15)

- [ ] Remindere email
- [ ] Remindere SMS
- [ ] Mesaje de follow-up după programare
- [ ] Notificări pentru anulări și modificări
- [ ] Solicitări de recenzii după vizită
- [ ] Automatizări predefinite activabile de organizație
- [ ] Șabloane de mesaje controlate de Ventora
- [ ] Notificări interne pentru personal

### SMS de pe numărul propriu (adăugat 24.10.2026 · D-SMS-9 · specificație: `docs/SMS_NUMAR_PROPRIU.md`)

> **Dependență:** aceste funcționalități depind de experimentul tehnic **E-SMS-1** și de validarea juridică (D-SMS-7). Nu se implementează înainte de raportul E-SMS-1 și de ADR-ul cu gateway-ul ales. Sunt obligatorii pentru lansarea comercială a Booking, cu condiția validărilor; dacă una pică, decizia revine fondatorilor. Rândul „Remindere SMS” de mai sus rămâne neschimbat.

- [ ] Alegerea metodei de trimitere SMS la nivel de organizație: prin furnizorul Ventora sau de pe numărul propriu (telefon Android cu SIM)
- [ ] Conectarea securizată a telefonului (cod QR de unică folosință), asociat cu organizația, cu revocare oricând
- [ ] Trimiterea automată a mesajelor operaționale (remindere, confirmări, modificări, anulări) de pe SIM-ul propriu, fără duplicate și cu eșalonare
- [ ] Starea fiecărui SMS vizibilă administratorului: în așteptare, predat telefonului, trimis, livrat (dacă există confirmare), eșuat (cu motiv), neconfirmat
- [ ] Monitorizarea telefonului (conectat, baterie, semnal) și alertarea administratorului când trimiterea nu e disponibilă
- [ ] Fără trimitere de rezervă cu cost fără acordul explicit al proprietarului (rezervă prin email opțională)
- [ ] SMS de probă și ghid de configurare în setările Booking

## Billing & Payments (8)

- [ ] Avansuri și depozite
- [ ] Înregistrarea plăților și încasărilor
- [ ] Plăți online prin furnizor integrat
- [ ] Rambursări și plăți parțiale
- [ ] Solduri restante
- [ ] Istoric financiar per programare
- [ ] Coduri promoționale și reduceri
- [ ] Politici de taxare pentru anulări / no-show

## Rapoarte & Integrări (11)

- [ ] Grad de ocupare și disponibilitate
- [ ] Venituri asociate programărilor
- [ ] Rapoarte anulări și no-show
- [ ] Performanța serviciilor și a personalului
- [ ] Exporturi CSV / Excel
- [ ] Integrare opțională cu CRM
- [ ] Integrare opțională cu Finance
- [ ] Integrare opțională cu Marketing
- [ ] Integrare opțională cu Analytics
- [ ] Integrare opțională cu Portal
- [ ] Integrare opțională cu Inventory pentru consumabile

## Funcții comune Ventora (5)

- [ ] AI Assistant contextual în Booking
- [ ] Pagină Support / My Tickets
- [ ] Roluri și permisiuni pe organizație
- [ ] Jurnal de activitate și modificări
- [ ] Setări și preferințe per organizație

## Funcționalități excluse

Nicio excludere declarată în checklistul confirmat.

## Adăugiri și observații confirmate

Nicio adăugire suplimentară declarată în checklist.
