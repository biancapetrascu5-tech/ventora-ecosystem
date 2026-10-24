# 04 · Ventora Contracts — checklist confirmat

**Sursa:** Ventora_Ecosystem_Specificatie_Completa_15_Aplicatii_V1.docx
**Funcționalități confirmate:** 71
**Stare aplicație:** Not started
**Regulă:** lista e cerința de produs. Nu se elimină, nu se adaugă și nu se reformulează funcționalități fără decizia fondatorilor. Ordinea de livrare se stabilește separat.

Bifează o funcționalitate doar când e implementată ȘI acoperită de teste.
71 funcționalități selectate · 2 excluderi explicite · Sursă: Text
lipit(8).txt

## Contract Registry & Organization (11)

- [ ] Registru centralizat de contracte
- [ ] Contracte cu clienți și furnizori
- [ ] Contracte de prestări servicii și colaborare
- [ ] Contracte de închiriere, leasing și abonamente
- [ ] Categorii și tipuri personalizate de contracte
- [ ] Număr intern și identificator unic pentru contract
- [ ] Profil contract cu toate informațiile esențiale
- [ ] Etichete, statusuri și priorități
- [ ] Căutare, sortare și filtrare avansată
- [ ] Arhivarea și restaurarea contractelor
- [ ] Import în masă al contractelor existente

## Parties, Terms & Obligations (11)

- [ ] Evidența părților contractante
- [ ] Persoane de contact și responsabili interni
- [ ] Data semnării, începerii și expirării
- [ ] Valoare contractuală, monedă și periodicitate
- [ ] Obligații și livrabile contractuale
- [ ] Termene pentru îndeplinirea obligațiilor
- [ ] Responsabili și atribuirea obligațiilor
- [ ] Statusul îndeplinirii obligațiilor
- [ ] Clauze și condiții importante evidențiate
- [ ] Câmpuri personalizate per tip de contract
- [ ] Asocierea contractelor cu locații sau departamente

## Renewals, Expirations & Alerts (9)

- [ ] Calendar de expirări contractuale
- [ ] Alerte înainte de expirare
- [ ] Reînnoire manuală și automată conform contractului
- [ ] Perioade de preaviz și notificări
- [ ] Alerte pentru obligații și termene apropiate
- [ ] Urmărirea contractelor expirate sau suspendate
- [ ] Configurarea intervalelor de notificare
- [ ] Dashboard cu contracte care necesită atenție
- [ ] Istoric de reînnoiri și prelungiri

## Documents, Versions & Approvals (11)

- [ ] Încărcarea contractelor PDF și a anexelor
- [ ] Stocare securizată a documentelor contractuale
- [ ] Istoric versiuni și modificări
- [ ] Gestionarea actelor adiționale
- [ ] Asocierea anexelor și documentelor justificative
- [ ] Șabloane de contracte
- [ ] Generarea contractelor din șabloane
- [ ] Fluxuri interne de revizuire și aprobare
- [ ] Comentarii și observații interne
- [ ] Statusuri Draft / Review / Approved / Active / Expired
- [ ] Compararea versiunilor documentelor contractuale

## Financial Tracking & Compliance (10)

- [ ] Evidența valorii și costului contractelor
- [ ] Scadențe financiare și obligații de plată
- [ ] Contracte cu plăți recurente
- [ ] Urmărirea sumelor achitate și restante
- [ ] Asocierea facturilor existente cu contractele
- [ ] Alerte pentru termene financiare
- [ ] Clauze de penalizare și condiții speciale
- [ ] Evidența documentelor de conformitate
- [ ] Registru al modificărilor și deciziilor contractuale
- [ ] Restricții de acces pentru contracte confidențiale

## Reports & Integrations (12)

- [ ] Dashboard contracte active, expirate și în curs
- [ ] Rapoarte contracte care expiră
- [ ] Rapoarte valori contractuale și obligații financiare
- [ ] Rapoarte obligații restante
- [ ] Rapoarte reînnoiri și prelungiri
- [ ] Exporturi CSV / Excel / PDF
- [ ] Integrare opțională cu Documents
- [ ] Integrare opțională cu Finance
- [ ] Integrare opțională cu CRM
- [ ] Integrare opțională cu Projects & Tasks
- [ ] Integrare opțională cu HR
- [ ] Integrare opțională cu Analytics

## Funcții comune Ventora (7)

- [ ] AI Assistant contextual în Contracts
- [ ] Pagină Support / My Tickets
- [ ] Roluri și permisiuni pe organizație
- [ ] Jurnal de activitate și modificări
- [ ] Setări și preferințe per organizație
- [ ] Acces multi-utilizator și colaborare
- [ ] Izolarea datelor între organizații

## Funcționalități excluse

- Semnătură electronică prin furnizor extern
- API / Webhooks pentru integrări externe

## Adăugiri și observații confirmate

semnaturi prin otp
Decizie finală explicită: semnături / acceptări prin OTP, cu cod de
unică folosință, expirare, verificarea destinatarului, confirmare
explicită, versiune de document și dovezi de audit. Nu se includ
furnizor extern de semnătură electronică și API / webhooks publice. OTP
nu echivalează automat cu semnătură electronică calificată.
