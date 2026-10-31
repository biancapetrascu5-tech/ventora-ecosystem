/**
 * sync-commercial-registry.ts — Lot 3.1 (ARCHITECTURE §8.4)
 *
 * Writes the applications and the feature / quota keys every manifest declares into the
 * commercial registry (schema `commercial`), idempotently. A key gone from every manifest is
 * marked retired, not deleted. Run at deploy time AFTER prisma migrate deploy and next to
 * sync-permissions.ts — never at runtime. Uses DIRECT_URL (the runtime roles only read).
 *
 *   --expect-noop   exit 1 if the run changed anything (the second run of a deploy, in tests)
 */

import { Pool } from 'pg';
import { manifest as bookingManifest } from '../modules/booking/src/manifest.js';
import { platformManifest } from '../core/access/src/platform-manifest.js';
import { APPLICATIONS, isNoop, syncRegistry } from '../core/commercial/src/index.js';

const MANIFESTS = [platformManifest, bookingManifest];

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DIRECT_URL or DATABASE_URL must be set');

  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  try {
    const result = await syncRegistry(client, APPLICATIONS, MANIFESTS);
    for (const [table, r] of Object.entries(result)) {
      console.log(
        `  ${table}: +${r.inserted.length} ~${r.updated.length} retired ${r.retired.length}` +
          (r.retired.length ? ` (${r.retired.join(', ')})` : ''),
      );
    }
    const { rows } = await client.query<{ apps: number; features: number; quotas: number }>(
      `SELECT (SELECT count(*)::int FROM commercial.application WHERE retired_at IS NULL) AS apps,
              (SELECT count(*)::int FROM commercial.feature_key WHERE retired_at IS NULL) AS features,
              (SELECT count(*)::int FROM commercial.quota_key WHERE retired_at IS NULL) AS quotas`,
    );
    const active = rows[0]!;
    console.log(
      `Commercial registry synced: ${active.apps} applications, ${active.features} features, ` +
        `${active.quotas} quotas.`,
    );
    if (process.argv.includes('--expect-noop') && !isNoop(result)) {
      throw new Error('the second sync changed the registry: it is not idempotent');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[sync-commercial-registry] Fatal error:', err);
  process.exit(1);
});
