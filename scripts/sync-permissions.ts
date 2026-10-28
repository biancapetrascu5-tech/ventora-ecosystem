/**
 * sync-permissions.ts
 *
 * Reads defaultGrants from each module manifest and upserts permission +
 * role_permission rows via a direct (migration-role) connection.
 *
 * Run at deploy time AFTER prisma migrate deploy — never at runtime.
 * Uses DIRECT_URL so it bypasses the access_rw role (which is SELECT-only
 * on permission tables — ADR-0005).
 */

import { Pool } from 'pg';
import { manifest as bookingManifest } from '../modules/booking/src/manifest.js';
import { platformManifest } from '../core/access/src/platform-manifest.js';

type Manifest = {
  applicationId: string;
  permissions: ReadonlyArray<{ name: string; description?: string }>;
  defaultGrants: Record<string, readonly string[] | '*'>;
};

const MANIFESTS: Manifest[] = [platformManifest, bookingManifest];

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DIRECT_URL or DATABASE_URL must be set');
  }

  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const manifest of MANIFESTS) {
      console.log(`Syncing permissions for application: ${manifest.applicationId}`);

      for (const perm of manifest.permissions) {
        const { rows: permRows } = await client.query<{ id: string }>(
          `INSERT INTO access.permission (application_id, name, description)
           VALUES ($1, $2, $3)
           ON CONFLICT (application_id, name) DO UPDATE SET description = EXCLUDED.description
           RETURNING id`,
          [manifest.applicationId, perm.name, perm.description ?? null],
        );
        const permId = permRows[0]!.id;

        // Determine which system roles grant this permission
        for (const [roleName, grants] of Object.entries(manifest.defaultGrants)) {
          const hasGrant = grants === '*' || (grants as string[]).includes(perm.name);
          if (!hasGrant) continue;

          const { rows: roleRows } = await client.query<{ id: string }>(
            `SELECT id FROM access.role WHERE name = $1 AND organization_id IS NULL`,
            [roleName],
          );
          if (!roleRows[0]) {
            console.warn(`  System role '${roleName}' not found — skipping`);
            continue;
          }
          const roleId = roleRows[0].id;

          await client.query(
            `INSERT INTO access.role_permission (role_id, permission_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [roleId, permId],
          );

          console.log(`  GRANT ${perm.name} → ${roleName}`);
        }
      }
    }

    await client.query('COMMIT');
    console.log('Permissions synced successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[sync-permissions] Fatal error:', err);
  process.exit(1);
});
