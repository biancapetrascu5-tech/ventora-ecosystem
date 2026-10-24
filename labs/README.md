# Ventora Labs

Mediu izolat pentru experimente cu baze de date. Nu face parte din workspace-ul pnpm.
Rulat local cu Docker; nu intră în CI.

## Prerequisite

- Docker Desktop pornit
- Node.js >= 24 (`node --version`)
- `labs/.env.local` creat din `.env.example` (secretele nu se commit)

```sh
cp labs/.env.example labs/.env.local
# editează DATABASE_URL_SUPERUSER cu parola reală
```

## Setup bază de date

```sh
# 1. Pornește containerul Postgres 17
docker compose -f labs/docker-compose.yml up -d

# 2. Creează scheme + roluri + granturi (idempotent)
docker exec -i ventora-labs-db psql -U postgres -d ventora_labs \
  < labs/experiments/setup-db.sql

# 3. Instalează dependențe labs (separate de workspace)
cd labs && npm install
```

## E2 — Migrații independente per modul

```sh
# Aplică migrațiile (câte una per modul, în schema proprie)
# Prisma 7: URL-ul e în prisma.config.ts, nu în schema.prisma
cd labs
npx prisma migrate dev --config lab-core/prisma.config.ts --name init
npx prisma migrate dev --config lab-booking/prisma.config.ts --name init
npx prisma migrate dev --config lab-crm/prisma.config.ts --name init

# Verifică că _prisma_migrations există în fiecare schemă și nu se amestecă
node experiments/e2-check.mjs
```

## E3 — Izolare Postgres prin roluri

```sh
# Rulează după migrații (E2 trebuie să fi rulat)
node labs/experiments/e3-test.mjs
```

Așteptat: 5 PASS (acces refuzat cu 42501/42P01) + 1 PASS (acces legitim pe propria schemă).

## E1 — Varianta A vs. Varianta B

```sh
cd labs

# Varianta A: generează clienți separați (3 × prisma generate)
npx prisma generate --config lab-core/prisma.config.ts
npx prisma generate --config lab-booking/prisma.config.ts
npx prisma generate --config lab-crm/prisma.config.ts

# Varianta B: un singur client multiSchema (1 × prisma generate)
npx prisma generate --config experiments/e1/variant-b/prisma.config.ts

# Compară timpii, dimensiunile și numărul de fișiere
node experiments/e1/compare.mjs
```

## Oprire container

```sh
docker compose -f labs/docker-compose.yml down
# Cu ștergerea volumului (reset complet):
docker compose -f labs/docker-compose.yml down -v
```
