# Lot B.22a: contul Stripe al salonului (Connect, plăți directe)

**Branch:** `feat/b22-booking-stripe-connect`, pe `main` `a20aea0`
**Status:** PROPUS. PR „[SQL de revizuit]”, de aprobat de fondatoare.

## Decizia de bază (fondatoarea, 14.11.2026, înlocuiește S116-D13)

- **Plăți directe în contul salonului:** Accounts v2, configurația `merchant`, `dashboard: 'full'`. Comisioanele și pierderile Stripe sunt ale contului salonului (`fees_collector` / `losses_collector` = `stripe`).
- **Salonul e comerciantul.** Ventora Systems nu ține banii.
- **Avansul (B.22b):** taxa reținută din avans și soldul restant; fără card salvat.

## Lista de bifat

| Punct | Fișier | Test |
| --- | --- | --- |
| Gateway Connect separat în `core/billing` (singurul loc care vorbește cu Stripe pentru conturile saloanelor): creare cont, link la formular (onboarding / update), citire stare, verificarea semnăturii notificărilor v2 | `core/billing/src/stripe-connect.ts`, `core/billing/src/index.ts` | `core/billing/src/__tests__/stripe-connect.test.ts` (stările din contul v2, 3/3) |
| Starea afișată: onboarding / in_review / active / problems, din `card_payments.status` plus cerințele `awaiting_action_from: 'user'` | idem (`connectStatusOf`) | idem |
| Tabelul `booking.stripe_account`: un rând pe afacere, RLS cu USING și WITH CHECK, UPDATE doar pe coloane, fără DELETE; funcția `SECURITY DEFINER` `organization_of_stripe_account` pentru webhook | `modules/booking/prisma/migrations/20261114000005_booking_stripe_connect/migration.sql`, `schema.prisma` | `stripe-connect.integration.test.ts` (T1 / fără DELETE); `services.integration.test.ts` (RLS pe toate tabelele booking, lista completată) |
| Doar proprietarul conectează, reconectează și deconectează; cei cu `booking:settings` văd starea | `modules/booking/src/server/stripe-connect.ts`, `src/contract/stripe-connect.ts` | „only the owner connects or disconnects” |
| Contul se creează o singură dată (cheie de idempotență pe afacere); reconectarea refolosește același cont | idem | „the account is created once”, „connecting again reuses the same account” |
| Starea se recitește de la Stripe la întoarcerea din formular, la deschiderea paginii (cel mult o dată pe minut) și la notificări; după ce a fost activ, cerințe noi înseamnă „problems”, iar linkul e de tip update | idem | „the status follows Stripe …” |
| Webhook `/api/webhooks/stripe-connect` cu secret separat: semnătură greșită → 400; eroare → 500 + Sentry; aceeași notificare de două ori dă aceeași stare | `apps/platform/app/api/webhooks/stripe-connect/route.ts` | „a notification reads the account again (twice …)”. Ruta în sine (semnătura) nu are test automat; vezi NEFĂCUT |
| Rutele de întoarcere și reîmprospătare din formularul Stripe | `apps/platform/app/(hub)/booking/settings/payments/stripe/{return,refresh}/page.tsx` | build |
| Acțiunile de server pentru „Plăți și avans” (UI-ul le leagă) | `apps/platform/src/server/booking-stripe-actions.ts` | typecheck, build |
| `activeStripeAccount(client)` pentru B.22b (fără cont activ nu se cere avans) | `server/stripe-connect.ts` | folosit în B.22b |
| `.env.example`: `STRIPE_CONNECT_WEBHOOK_SECRET=` fără valoare | `.env.example` | — |

## Corecturi după prima rulare a integrării (19:12)

- **`inconsistent types deduced for parameter $3`:** valoarea stării era folosită și drept coloană, și în comparația `= 'active'`. Am pus cast explicit `::varchar`, în INSERT și în `writeState`. Acoperit de cele 5 teste care picau.
- **Testul B.1 (RLS pe toate tabelele booking):** are lista fixă a tabelelor, i-am adăugat `stripe_account`.

## NEFĂCUT

- **Ecranul „Plăți și avans” (UI):** îl face agentul UI. Eu am livrat doar acțiunile de server.
- **Test automat pentru semnătura webhook-ului:** fără cheie Stripe în CI nu se poate genera o semnătură v2 reală. Logica de după semnătură e testată (`refreshStripeAccountFromNotification`).
- **NECESITĂ (fondatoarea):** `STRIPE_CONNECT_WEBHOOK_SECRET` în Vercel, plus destinația de evenimente v2 pentru conturile conectate (`v2.core.account*`) în Stripe. Nu ating cheile.
- **IBAN-ul și programul plăților din design:** nu se copiază în Ventora. Propun să le arate componentele Stripe încorporate sau tabloul de bord Stripe (PROPUS).

## Abateri

- **Dependență internă nouă** `@ventora/billing` în `modules/booking/package.json` (pachet din monorepo, nu extern); `pnpm-lock.yaml` +3 rânduri.
- **S116-D13 (Express) înlocuit** cu plăți directe, prin decizia fondatoarei de mai sus.

## Verificări

Toate pe `a20aea0`, în `C:\Projects\ventora-b22`.

| Comandă | Rezultat |
| --- | --- |
| `pnpm format:check` | verde |
| `pnpm lint` | verde |
| `pnpm typecheck` | verde |
| `pnpm test` | verde |
| `pnpm i18n:check` | verde |
| `pnpm guards:verify` | verde (gitleaks sărit local, rulează în CI) |
| `pnpm brand:check` | verde |
| `pnpm build` | verde, 7/7 |
| `pnpm test:integration -- --only booking,billing`, prima rulare | 6 picate (vezi corecturile) |
| idem, a doua rulare | **booking 455/455 verde**; billing 1 picat: `lot38`, „dunning cannot start in the future” (cod neatins de B.22a: `Date.now()` din Node față de `now()` din container) |
| `pnpm test:integration -- --only billing`, rerulare | **verde, 84/84** (3 sărite). DE VALIDAT TEHNIC: `lot38` e sensibil la ceasul containerului față de cel al gazdei |

## SHA-uri

- `de7c52a`: codul, migrarea, testele
- commit-ul acestui raport (următorul)
- pushed: da (vezi `git status -sb` din PR)

## După aprobarea SQL (14.11 seara): rebase și redenumire

- **Rebase pe `main` `9de72e1`** (cu #223 și #226), fără conflicte.
- **Migrarea redenumită** în `20261114000005_booking_stripe_connect`, pentru că `000004` e ocupat de #226 (`booking_online_settings`). SQL-ul e neschimbat.
- **Lanțul complet, refăcut:** format, lint, typecheck, test, i18n, gărzi, brand și build, toate verzi. Integrarea `--only booking,billing`: **booking 460/460, billing 84/84** (3 sărite).
