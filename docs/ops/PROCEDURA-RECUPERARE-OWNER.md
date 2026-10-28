# Procedura de recuperare a accesului owner-ului

**Decizie:** L2.5-D13 (ARCHITECTURE §7.5, §17.22), 28.10.2026
**Pentru:** echipa Ventora care lucrează în Founder
**Legat de:** R-2F7 (fără resetare automată), L2.5-D14 (cod TOTP proaspăt al Founder-ului), L2.5-D15 (ce se resetează), L2.5-D16 (separat de sesiunea de suport)

Owner-ul care și-a pierdut accesul (telefonul cu aplicația de autentificare, codurile de rezervă sau parola) nu se poate reseta singur. Recuperarea o face un Founder, din Founder, **numai după ce verifică identitatea** după pașii de mai jos. Aplicația nu stochează dovezile; în Founder se notează doar ce s-a verificat.

---

## 1. De unde vine cererea

- Cererea se primește **doar** pe `support@ventorasystems.com`.
- Nu se acceptă cereri venite prin telefon, chat, rețele sociale sau pe adresa personală a cuiva din echipă. Persoanei care cere altfel i se răspunde să scrie la `support@ventorasystems.com`.
- Fiecare cerere primește o **referință** (de exemplu, subiectul sau id-ul firului de e-mail), folosită mai departe în Founder.

## 2. Verificarea identității: minimum două din trei

Recuperarea se face doar dacă **cel puțin două** dintre verificările de mai jos au reușit.

| | Verificare | Ce înseamnă concret |
|---|---|---|
| **(a)** | E-mailul contului | Cererea vine de pe adresa contului owner-ului, **sau** owner-ul răspunde la un e-mail trimis de noi pe adresa contului (nu pe adresa de pe care a venit cererea, dacă e alta). |
| **(b)** | Telefonul afacerii | Sunăm la numărul de telefon din contractul sau din datele de facturare ale afacerii, **niciodată** la un număr dat în cerere. Persoana confirmă cererea și datele afacerii. |
| **(c)** | Alt admin | Confirmare scrisă de la **alt admin activ** al aceleiași afaceri, nu de la persoana care cere recuperarea. |

### Dacă adresa contului e compromisă

Dacă owner-ul spune sau avem motive să credem că adresa de e-mail a contului nu mai e sub controlul lui:
- verificarea (a) **nu se folosește**;
- recuperarea se face doar cu **(b) + (c)**;
- **niciodată doar pe baza e-mailului.**

Dacă (b) și (c) nu se pot face amândouă, recuperarea nu se face.

## 3. Ce se resetează

| Variantă | Ce face | Când se alege |
|---|---|---|
| **B (implicită): 2FA + parolă** | Șterge autentificarea în doi pași și toate sesiunile, invalidează parola. Owner-ul primește un e-mail cu un link de resetare a parolei, valabil o oră. | Întotdeauna, cu excepția cazului de mai jos. |
| **A: doar 2FA** | Șterge autentificarea în doi pași și toate sesiunile; parola rămâne. | **Doar** când owner-ul confirmă **la telefon**, în apelul de la verificarea (b), că are parola și a pierdut doar telefonul. |

În ambele variante, la următoarea intrare owner-ul trebuie să activeze din nou autentificarea în doi pași. Până atunci nu poate face nicio acțiune ca owner.

## 4. Ce se notează în Founder

Pe ecranul „Recuperare acces owner” al organizației. Ecranul vine după F1 (L2.5-D18); câmpurile de mai jos sunt cele ale contractului `recoverOwnerAccess`, care există deja.

1. **Owner-ul:** se alege din lista owner-ilor activi ai organizației.
2. **Referința cererii:** cea de la pasul 1.
3. **Motivul:** de ce se face recuperarea (de exemplu, „telefon pierdut, fără coduri de rezervă”) și **ce verificări s-au făcut**, cu rezultatul. Exemplu: „(b) apel la numărul din contract, 28.10 ora 11:20, confirmat; (c) confirmare scrisă de la [admin], 28.10 ora 11:45”.
4. **Bifa** „Am verificat identitatea conform procedurii”.
5. **Varianta:** A sau B. Implicit B.
6. **Codul tău de autentificare:** codul TOTP proaspăt al Founder-ului care face recuperarea.

Toate câmpurile sunt obligatorii. Acțiunea se scrie în jurnalul de audit, pe numele Founder-ului care a făcut-o.

**Cerință pentru ecran (decisă pe 28.10.2026, de implementat odată cu ecranele, fără cod acum):** verificările făcute devin un câmp separat al contractului `recoverOwnerAccess`, `verifications: ('a' | 'b' | 'c')[]`. Pe ecran apar ca trei bife, (a), (b) și (c), iar contractul le validează pe server:
- cel puțin două verificări;
- dacă adresa contului e marcată compromisă (câmp separat pe ecran), (b) și (c) sunt obligatorii, iar (a) nu contează;
- dacă regulile nu sunt respectate, recuperarea e refuzată și nu se schimbă nimic.

Lista intră în rândul de audit al recuperării. Până atunci, verificările se scriu în câmpul „Motiv”, ca în exemplul de mai sus.

**Nu se notează nimic altceva:** fără copii după acte, fără capturi de ecran și fără conținutul e-mailurilor primite.

## 5. Recuperarea așteaptă verificările complete

Suportul e disponibil 24/7 (decizie din 28.10.2026). Recuperarea se face **doar după ce verificările cerute sunt complete**.

Dacă verificarea (b) (apelul la numărul din datele de facturare) **nu se poate face pe loc**, recuperarea **așteaptă până se poate**. Verificarea (b) nu se înlocuiește cu una mai slabă.

## 6. După recuperare

- Owner-ul primește automat e-mailul de confirmare, cu linkul de resetare în varianta B.
- Pe firul cererii de la `support@ventorasystems.com` se confirmă că recuperarea s-a făcut.
