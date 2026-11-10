import type { ClientBase } from 'pg';
import {
  HUB_GROWTH_PLACEMENTS,
  validateManifestGrowth,
  type GrowthPlacement,
} from '@ventora/contracts';

/*
 * Lot 5.5 — the slot registry (GROWTH_ENGINE §2.2, §2.10). The deploy writes the slots every
 * manifest declares (and the Hub's own) into growth.placement, idempotently, next to
 * sync-commercial-registry.ts and with the same rights (DIRECT_URL; the runtime roles only read).
 * A slot gone from every manifest is marked retired, not deleted: impressions keep pointing at it.
 * A Founder stop on a slot (`stopped`) is never touched by the sync.
 */

export interface PlacementSource {
  applicationId: string;
  placements?: readonly GrowthPlacement[];
}

/** The Hub / Core slots (launcher, notifications, plan page, catalog, the limit dialog). */
export const HUB_PLACEMENT_SOURCE: PlacementSource = {
  applicationId: 'hub',
  placements: HUB_GROWTH_PLACEMENTS,
};

export interface PlacementSyncResult {
  inserted: string[];
  updated: string[];
  retired: string[];
}

export function isPlacementSyncNoop(r: PlacementSyncResult): boolean {
  return r.inserted.length === 0 && r.updated.length === 0 && r.retired.length === 0;
}

/** Every declared slot, validated (prefix, uniqueness, no critical slot); throws on any error. */
export function collectPlacements(sources: readonly PlacementSource[]): GrowthPlacement[] {
  const errors = sources.flatMap((s) =>
    validateManifestGrowth({ applicationId: s.applicationId, placements: s.placements }, []),
  );
  const all = sources.flatMap((s) => s.placements ?? []);
  const ids = all.map((p) => p.id);
  for (const id of ids.filter((id, i) => ids.indexOf(id) !== i)) {
    errors.push(`slot „${id}”: declared by two sources`);
  }
  if (errors.length) throw new Error(`[growth] invalid slots:\n  ${errors.join('\n  ')}`);
  return all;
}

export async function syncPlacements(
  client: ClientBase,
  sources: readonly PlacementSource[],
): Promise<PlacementSyncResult> {
  const placements = collectPlacements(sources);
  const appOf = new Map(
    sources.flatMap((s) => (s.placements ?? []).map((p) => [p.id, s.applicationId] as const)),
  );
  const result: PlacementSyncResult = { inserted: [], updated: [], retired: [] };

  await client.query('BEGIN');
  try {
    const { rows } = await client.query<{
      id: string;
      application_id: string;
      kind: string;
      user_initiated: boolean;
      retired: boolean;
    }>(
      `SELECT id, application_id, kind, user_initiated, retired_at IS NOT NULL AS retired
         FROM growth.placement`,
    );
    const existing = new Map(rows.map((r) => [r.id, r]));

    for (const p of placements) {
      const applicationId = appOf.get(p.id)!;
      const userInitiated = p.userInitiated ?? false;
      const row = existing.get(p.id);
      if (!row) {
        await client.query(
          `INSERT INTO growth.placement (id, application_id, kind, user_initiated, critical)
           VALUES ($1, $2, $3, $4, false)`,
          [p.id, applicationId, p.kind, userInitiated],
        );
        result.inserted.push(p.id);
      } else if (
        row.application_id !== applicationId ||
        row.kind !== p.kind ||
        row.user_initiated !== userInitiated ||
        row.retired
      ) {
        await client.query(
          `UPDATE growth.placement
              SET application_id = $2, kind = $3, user_initiated = $4, retired_at = NULL,
                  synced_at = now()
            WHERE id = $1`,
          [p.id, applicationId, p.kind, userInitiated],
        );
        result.updated.push(p.id);
      }
    }

    const declared = new Set(placements.map((p) => p.id));
    for (const row of rows) {
      if (!row.retired && !declared.has(row.id)) {
        await client.query(
          `UPDATE growth.placement SET retired_at = now(), synced_at = now() WHERE id = $1`,
          [row.id],
        );
        result.retired.push(row.id);
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  }
  return result;
}
