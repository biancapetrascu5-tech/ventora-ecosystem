/**
 * sync-growth-registry.ts — Lot 5.5 (FAZA-5, GROWTH_ENGINE §2.2, §2.10)
 *
 * Writes the Growth slots every manifest declares (plus the Hub's own) into growth.placement,
 * idempotently. A slot gone from every manifest is marked retired, not deleted. Run at deploy time
 * AFTER prisma migrate deploy, next to sync-commercial-registry.ts — never at runtime. Uses
 * DIRECT_URL (the runtime roles only read the registry).
 *
 *   --expect-noop   exit 1 if the run changed anything (the second run of a deploy, in tests)
 */

import { Pool } from 'pg';
import { manifest as bookingManifest } from '../modules/booking/src/manifest.js';
import { platformManifest } from '../core/access/src/platform-manifest.js';
import {
  HUB_PLACEMENT_SOURCE,
  isPlacementSyncNoop,
  syncPlacements,
} from '../core/growth/src/index.js';

const SOURCES = [HUB_PLACEMENT_SOURCE, platformManifest, bookingManifest];

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DIRECT_URL or DATABASE_URL must be set');

  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  try {
    const r = await syncPlacements(client, SOURCES);
    console.log(
      `Growth slots synced: +${r.inserted.length} ~${r.updated.length} retired ${r.retired.length}` +
        (r.retired.length ? ` (${r.retired.join(', ')})` : ''),
    );
    if (process.argv.includes('--expect-noop') && !isPlacementSyncNoop(r)) {
      throw new Error('the second sync changed the registry: it is not idempotent');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[sync-growth-registry] Fatal error:', err);
  process.exit(1);
});
