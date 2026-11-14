# HubBrand

Hub — Afacerea › „Brand” (S148, 13.11): cum apare afacerea la clienți. Doar proprietarul și adminul schimbă; membrii văd, cu „Doar proprietarul sau un administrator poate schimba brandul.” Înlocuiește HubBusinessProfile (S147): logo-ul se încarcă doar aici.

**Ce conține.**
- **Logo-ul** pe fundal deschis și pe fundal închis (al doilea opțional; fără el, pe fundal închis logo-ul deschis stă pe o placă albă). Încărcare, înlocuire, ștergere cu confirmare; „PNG, JPG sau SVG · maximum 2 MB · cel puțin 256 px pe latura mică”; erori (tip, mărime, prea mică). Numele afacerii, doar citire („Pentru alt nume, scrie-ne.”).
- **Culorile:** principala (butoane, linkuri) și accentul (linia de sus, detalii). Contrastul textului alb pe culoarea principală se verifică pe loc: „Contrast 9:1 … se citește bine”, sau sub 4,5:1 un Notice „Textul de pe buton nu se citește” cu nuanța propusă („Folosește #896E25, mai închisă”). Accentul sub 3:1 pe alb primește nota că e folosit doar pentru detalii.
- **Fontul** dintr-o listă scurtă, fiecare cu previzualizare: Modern (implicit Ventora, DM Sans), Expresiv (Syne), Clasic cu serife, Rotunjit.
- **Tonul vocii:** formal / prietenos / scurt, cu exemplul reamintirii pentru mâine; se aplică textelor implicite, nu celor scrise de afacere în Setări › Mesaje.
- **Semnătura de e-mail:** text (max. 300 de caractere, fără linkuri și imagini) cu previzualizare.
- **Previzualizarea live** (dreapta pe desktop, dedesubt pe telefon): pagina de programări EasyBook și un e-mail către client, în brandul afacerii.

**Fără brand:** aspectul Ventora (numele afacerii, culorile și fontul Ventora); „Revino la aspectul Ventora” readuce acest aspect.

**Unde se aplică:** pagina publică de programări (BookingPublic), pagina clientului (BookingClientManage), e-mailurile către clienți (BookingClientEmails), antetul și butonul e-mailurilor CampaignKit (CampaignKitEmailEditor) și logo-ul din selectorul de afacere (OrgSwitcher). Tehnic: culorile și fontul suprascriu `--primary`, `--primary-hover`, `--primary-pressed`, `--on-primary`, `--font-sans`, `--font-display` doar pe suprafețele pentru clienți; interfața Ventora a echipei rămâne neschimbată.

Chei `hub.nav.brand*`, `hub.brand.*` și (încărcarea, erorile) `hub.business.logo.*` în `i18n/team.json`, 6 limbi. Desenat la 1280 și 390, light și dark, plus DE și IT.

**DE DECIS (S148).**
- **Lista de fonturi.** Recomandare: cele 4 de acum, toate cu licență pentru web și e-mail (DM Sans, Syne, o serifă de sistem, una rotunjită de sistem); fără fonturi încărcate de afacere.
- **Textul butoanelor.** Recomandare: mereu alb, cu verificarea 4,5:1 și nuanța propusă (desenat așa); nu trecem automat la text închis, ca butoanele să arate la fel peste tot.
- **Tonul „prietenos” vorbește cu „tu”** clienților, deci se abate de la regula „dumneavoastră” pentru clienți. Recomandare: implicit „formal”; „prietenos” doar dacă afacerea îl alege.
- **Logo-ul pe fundal închis.** Recomandare: opțional, cu placa albă ca rezervă (desenat așa).

**S150 · Datele afacerii (1.1.0).** Secțiune nouă, după logo, cu:

- numele afacerii, doar citire („Pentru alt nume, scrie-ne.”);
- „Telefon”, opțional, în format internațional (`+40 7xx xxx xxx`).

Doar proprietarul și adminul schimbă telefonul; membrul îl vede dezactivat. E același câmp ca în pasul „Datele afacerii și programul” din ghidul de pornire (BookingOnboarding). Pe pagina publică se arată telefonul locației alese, iar dacă locația nu are telefon, acesta (BookingPublic, BookingLocations). Stări: completat, gol („Fără telefon, pe pagina de rezervare nu apare niciun număr.”), eroare (număr fără prefixul țării). Cheile sunt `hub.brand.contact.*` și `hub.brand.phone*`, în `i18n/team.json`, în 6 limbi. Desenat la cadrele 10–12, cu test DE / IT.

DE DECIS:

- **Locul permanent.** Recomandare: aici, lângă nume și logo (cum apare afacerea la clienți), nu o pagină separată „Datele afacerii”.
- **Validarea.** Recomandare: cere `+` și prefixul țării; afișarea se face cu spații pe grupe.
