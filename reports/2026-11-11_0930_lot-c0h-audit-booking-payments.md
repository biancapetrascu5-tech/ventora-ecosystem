# Lot C.0h — codurile de audit pentru încasări (prerechizit B.21)

Data: 2026-11-11. Decizia fondatoarei din 11.11, punctul 4: coduri dedicate, într-un PR Core mic; lista categoriilor rămâne neschimbată (`booking`).

## Ce conține

- `core/audit/src/actions.ts`:
  - `bookingPaymentRecorded` = `booking.payment_recorded`;
  - `bookingPaymentRefunded` = `booking.payment_refunded`.
  - Ambele sunt în categoria `booking`, cu ținta `booking_appointment`.
- Nu e nicio migrare, niciun tip de țintă nou, nicio categorie nouă. `audit.append_event` primește orice cod `categorie.acțiune`, iar categoria există deja.
- Test de integrare: ambele coduri trec prin `audit.append_event` în modul `required`.

## Metadatele (regula pentru B.21)

Metadatele conțin id-ul plății, tipul, suma, moneda și metoda. Nu conțin niciodată nota sau numele clientului.

## Verificări

| Pas | Rezultat |
|---|---|
| prettier pe fișierele schimbate | CONFIRMAT |
| `@ventora/audit` typecheck | CONFIRMAT |
| `@ventora/audit` test (unitare) | CONFIRMAT, 5/5 |
| test:integration | NU a rulat local: Docker Desktop era oprit și erau ~330 MB liberi. CI-ul decide |

## După merge

B.21 (#137) trece de la `booking.appointment_updated` + `metadata.payment` la aceste coduri. Rebazez #137 peste C.0h.
