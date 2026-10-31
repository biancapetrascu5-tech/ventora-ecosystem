/**
 * Lot 2.9 (decizia 2): baza de test per worktree. Numele containerelor, proiectul compose și
 * porturile se derivă din numele folderului repo-ului, ca doi agenți (în worktree-uri diferite)
 * să poată rula `pnpm test:integration` în paralel fără să-și recreeze containerul unul altuia.
 *
 *   folder  C:\Projects\ventora-ecosystem-ui  →  slug  ventora-ecosystem-ui
 *   proiect compose   ventora-test-<slug>
 *   containere        ventora-test-<slug>-postgres, ventora-test-<slug>-pgbouncer
 *   porturi           postgres 15400–16398 (par), pgbouncer = postgres + 1 (hash din slug)
 *
 * Suprascriere (de ex. la o coliziune de port): VENTORA_TEST_PG_PORT, VENTORA_TEST_PGBOUNCER_PORT.
 * CI nu folosește aceste scripturi (are serviciile lui pe 5433/6432).
 */
import { createHash } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const slug =
  basename(ROOT)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'repo';

// 500 perechi de porturi în afara intervalelor rezervate de Windows (Hyper-V: 49152+)
const offset = parseInt(createHash('sha256').update(slug).digest('hex').slice(0, 8), 16) % 500;

export const TEST_ENV = {
  slug,
  project: `ventora-test-${slug}`,
  postgresContainer: `ventora-test-${slug}-postgres`,
  pgbouncerContainer: `ventora-test-${slug}-pgbouncer`,
  pgPort: Number(process.env.VENTORA_TEST_PG_PORT) || 15400 + offset * 2,
  pgbouncerPort: Number(process.env.VENTORA_TEST_PGBOUNCER_PORT) || 15400 + offset * 2 + 1,
};

/** Variabilele citite de docker-compose.test.yml. */
export function composeEnv(base = process.env) {
  return {
    ...base,
    VENTORA_TEST_PROJECT: TEST_ENV.project,
    VENTORA_TEST_PG_PORT: String(TEST_ENV.pgPort),
    VENTORA_TEST_PGBOUNCER_PORT: String(TEST_ENV.pgbouncerPort),
  };
}

/** `docker compose` pe proiectul acestui worktree. */
export function composeCmd(docker, args) {
  return `"${docker}" compose -p ${TEST_ENV.project} -f docker-compose.test.yml ${args}`;
}
