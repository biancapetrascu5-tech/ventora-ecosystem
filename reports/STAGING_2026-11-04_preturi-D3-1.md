# Staging, 04.11.2026 — prețurile D3-1 (`scripts/seed-pricing.ts`)

**Baza:** Supabase staging (`cvtbgycochtxfpfqdceh`, eu-central-1), din `main` la `5dc0583`.
**Rularea:** fondatoarea, în terminalul ei, cu sesiunea ei Founder (2FA). Ordinea a fost: verificarea, aprobarea coordonatorului, `--apply` (`applied: true`), apoi a doua verificare (`steps: []`, `conflicts: []`). La final, variabila cookie-ului a fost ștearsă și sesiunea Founder închisă.

## Ce s-a scris

Toate scrierile au trecut prin contractele Founder din `core/commercial`. Numerele de mai jos sunt citite după rulare, ca `founder_runtime`, în `BEGIN READ ONLY … ROLLBACK`.

- **Aplicații:** prețurile pentru 13 aplicații (lunar, anual, implementare; lei și euro), deci 78 de rânduri `application_price`. Limitele s-au pus pe 5 aplicații, în 6 rânduri `application_quota`.
- **„La cerere”:** nu s-a scris nimic. Toate aplicațiile erau deja pe `on_request` (16 din 16 în registru).
- **Bundle-uri:** Programări, Echipă, Operațiuni și Complet. Fiecare are planul, versiunea 1, perioada deschisă și publicarea (4 `plan`, 4 `plan_version` publicate).
- **Pachete:** 7 `addon`, cu 14 `addon_price`.
- **`included_members`:** a rămas 3. Scriptul doar l-a verificat, nu l-a scris.

## Auditul

Pe persoana Founder sunt **45 de rânduri** `category = 'commercial'`, toate `success`, de la un singur cont Founder, între 09:54:33 și 09:56:38 UTC:

- `application_prices_set`: 13;
- `application_quotas_set`: 5;
- `plan_created`, `version_created`, `version_updated`, `offer_period_set`, `version_published`: câte 4;
- `addon_created`: 7.

Se potrivesc unu la unu cu pașii scriptului. Alte rânduri din aceeași zi, din categoria `founder`, vin de la logare, nu de la script: `login_2fa_required`, un `2fa_verify_failed` (un cod greșit la logare), `login_succeeded` și `logout`.

## Abateri

1. **Scriptul ieșea cu exit 1 deși datele erau corecte.** În blocul `finally`, importul dinamic al `../core/commercial/src/index.js` pica sub tsx cu „The requested module '@ventora/contracts' does not provide an export named 'QuotaOverLimitV1'”. Asta se întâmpla la fiecare rulare, după scrieri. **Reparat** în `fix/seed-pricing-si-sesiune-founder`: `closeCommercialPools` vine acum din importul static deja existent. Am verificat local, cu o bază inexistentă: codul vechi pică pe `QuotaOverLimitV1`, iar codul nou ajunge la eroarea reală și închide pool-urile.
2. **P2028 în `getFounderSession`**, cu Founder local legat de pooler-ul staging-ului (:6543). Mesajul este „Unable to start a transaction in the given time”. Apare pe `/businesses` și o dată la pornirea scriptului.
   - **Cauza.** `makeFounderClient` (`core/identity/src/db.ts`) are `new Pool({ max: 1 })`. Fiecare operație Prisma rulează într-o tranzacție interactivă: BEGIN, `SET LOCAL ROLE founder_identity_rw`, interogarea, COMMIT.
   - **Măsurat pe staging, doar citire.** O astfel de tranzacție prin pooler durează 320–580 ms. 12 tranzacții simultane pe `max: 1` stau la coadă până la 4,6 s.
   - **De ce pică.** `/businesses` face 4 citiri în `Promise.all`, iar fiecare cere din nou sesiunea, plus verificarea paginii. Asta înseamnă ~5 × (findSession + user + `revokedAt`), adică ~15 operații pe o conexiune. Prisma renunță după `maxWait` = 2 s (implicit). La pornirea scriptului se întâmplă la fel: 4 citiri Founder în paralel.
   - Pe Vercel (3.9) ar fi fost la fel.
   - **Decizia fondatoarei (04.11.2026), aplicată în aceeași ramură:**
     - doar pentru Founder: `makeFounderClient` trece la `Pool max: 5`, cu `transactionOptions: { maxWait: 5000 }`;
     - Hub (`makeIdentityClient`) rămâne la `max: 1`, iar valoarea lui se alege la 3.9;
     - `DATABASE_URL` nu se schimbă;
     - regula „instanțe concurente × Pool max ≤ limita de clienți a pooler-ului” e trecută în ARCHITECTURE §6.2.

Pe staging nu s-a scris nimic altceva în afara scriptului. Citirile de mai sus au fost doar citiri.
