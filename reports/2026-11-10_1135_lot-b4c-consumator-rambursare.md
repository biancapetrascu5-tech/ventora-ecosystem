# Lotul B.4c — consumatorul de rambursare a cotei, legat în platformă

**Data:** 10.11.2026 · **Ramura:** `feat/b4c-booking-quota-refund-wiring` (din `main` `708c553`) · **Decizia:** fondatoarea, 10.11.2026: abaterea din B.4b acceptată, legarea într-un PR mic imediat după B.4b, înainte de B.6.

## Ce s-a făcut

- **`apps/platform/src/server/jobs.ts`:** `bookingQuotaRefundConsumer` (din `@ventora/booking`) înregistrat în `platformConsumers`.
  - O programare anulată înainte de început (`booking.appointment.cancelled`, `quotaRefund: true`) dă unitatea `booking.appointments` înapoi.
  - `refundQuota` e idempotent: o a doua livrare nu mai dă nimic.
  - Comentariul sursei `booking` din `OUTBOX_SOURCES` spune acum că `booking.appointment.*` au un consumator (`cancelled`); restul se marchează livrate fără consumator.
- **`modules/booking/CLAUDE.md`:** rândul despre rambursare spune unde e înregistrat consumatorul.
- **Importul** e din intrarea `.` a modulului (contractul), singura permisă de garda `[module-entry-only]`. Platforma depinde de `@ventora/booking` din B.1-UI, deci `package.json` și lockfile-ul nu se schimbă.

## Abateri

Niciuna. Un test separat nu s-a adăugat: `apps/platform` nu are teste unitare pentru `jobs.ts`. Consumatorul e testat în `appointments-quota.integration.test.ts` (B.4b: o singură rambursare la două livrări), iar compatibilitatea tipului cu `ConsumerRegistry` o verifică `typecheck`.

## Comenzi rulate (worktree `C:\Projects\ventora-b4c`)

| Comandă | Rezultat |
| --- | --- |
| `pnpm format:check`, `lint`, `typecheck`, `test`, `build`, `i18n:check`, `guards:verify` | exit 0 |
| `pnpm test:integration` complet (s-a schimbat un fișier din `modules/booking`) | **exit 0**, „Toate testele au trecut”: audit 38, identity 98, organizations 47, integrations 13, access 164, notifications 12, files 13, support 17, commercial 94, booking 125, billing 79 (+3 sărite), workflows 13, ai 11, prețurile 7. Drift curat |

## Ce urmează

- **Staging:** nimic de aplicat (fără migrare). Pe staging nu există încă programări.
- **B.5:** planul pe ramura `docs/plan-booking-b5`.
