import crypto from 'node:crypto';
import {
  AuditActions,
  appendAuditEventInTx,
  prismaTxExecutor,
  type AuditEvent,
} from '@ventora/audit';
import { Conflict, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { getOrgDb } from './db';
import { DEFAULT_TIME_ZONE, isValidTimeZone, type OrgContext } from './contract';
import { ForbiddenError } from './errors';

/*
 * Lot C.1 (BOOKING.md; D-B-3 a, D-B-4 a) — the business's locations.
 *
 * - Reading: any member of the business (OrgContext) and the modules (the TenantContext from
 *   authorize(): only its organizationId is used). Booking (B.10) validates a location with
 *   getActiveLocation, never by reading the table (ARCHITECTURE §6.4 b).
 * - Managing: owner and admin. „Șterge” archives: an archived location is final (a trigger refuses
 *   any change), it gives its unit of platform.locations back and a new one takes a new unit.
 * - The quota platform.locations (stock, overflow block) follows the saga of ARCHITECTURE §8.3:
 *   reserve → the transaction → commit; release when the transaction fails. core/commercial
 *   depends on core/organizations, so this package cannot import @ventora/quota: the caller passes
 *   the quota functions (`LocationQuota`; the ones of @ventora/quota fit as they are) and registers
 *   `locationQuotaResolver` for the reconciliation of a reservation left behind.
 * - The audit is in the same transaction (required), category organization; never the address.
 */

export const LOCATIONS_QUOTA_KEY = 'platform.locations';
export const LOCATION_NAME_MAX = 120;
export const LOCATION_ADDRESS_MAX = 500;

type QuotaCtx = { organizationId: string };

/** The quota steps (ARCHITECTURE §8.3); reserveQuota / commitQuota / releaseQuota / freeStockQuota fit. */
export interface LocationQuota {
  reserve(ctx: QuotaCtx, quotaKey: string, amount: number, operationId: string): Promise<unknown>;
  commit(ctx: QuotaCtx, operationId: string): Promise<unknown>;
  release(ctx: QuotaCtx, operationId: string): Promise<unknown>;
  free(ctx: QuotaCtx, quotaKey: string, amount: number, operationId: string): Promise<unknown>;
}

export interface Location {
  id: string;
  name: string;
  address: string | null;
  timeZone: string;
  archivedAt: string | null;
  createdAt: string;
}

type LocationRow = {
  id: string;
  name: string;
  address: string | null;
  time_zone: string;
  archived_at: Date | null;
  created_at: Date;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toLocation(r: LocationRow): Location {
  return {
    id: r.id,
    name: r.name,
    address: r.address,
    timeZone: r.time_zone,
    archivedAt: r.archived_at ? r.archived_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
  };
}

function manager(ctx: OrgContext): void {
  if (ctx.role !== 'owner' && ctx.role !== 'admin') throw new ForbiddenError();
}

function checkId(id: string): void {
  if (typeof id !== 'string' || !UUID_RE.test(id))
    throw new InvalidInput('locationId', 'locationId:invalid');
}

function cleanName(name: unknown): string {
  if (typeof name !== 'string') throw new InvalidInput('name', 'name:invalid');
  const v = name.trim().replace(/\s+/g, ' ');
  if (v.length === 0 || v.length > LOCATION_NAME_MAX)
    throw new InvalidInput('name', 'name:invalid');
  return v;
}

function cleanAddress(address: unknown): string | null {
  if (address === undefined || address === null) return null;
  if (typeof address !== 'string') throw new InvalidInput('address', 'address:invalid');
  const v = address.trim();
  if (v.length === 0) return null;
  if (v.length > LOCATION_ADDRESS_MAX) throw new InvalidInput('address', 'address:invalid');
  return v;
}

function cleanTimeZone(timeZone: unknown): string {
  if (timeZone === undefined || timeZone === null) return DEFAULT_TIME_ZONE;
  if (typeof timeZone !== 'string' || !isValidTimeZone(timeZone)) {
    throw new InvalidInput('timeZone', 'timeZone:invalid');
  }
  return timeZone;
}

/**
 * A raw query error from Prisma (P2010) keeps the PostgreSQL code in `meta.code` and the message
 * (constraint name, hint) in the text; the driver error has them directly.
 */
function mapWriteError(err: unknown): never {
  const e = err as { code?: string; meta?: { code?: string }; message?: string };
  const code = e?.meta?.code ?? e?.code;
  const text = e?.message ?? '';
  if (code === '23505' || text.includes('location_active_name_key')) {
    throw new InvalidInput('name', 'name:taken');
  }
  if (code === '55000' || text.includes('is archived')) {
    throw new Conflict('location_archived');
  }
  throw err;
}

function audit(
  ctx: OrgContext,
  action: string,
  locationId: string,
  metadata: Record<string, unknown> = {},
): AuditEvent {
  return {
    category: 'organization',
    action,
    outcome: 'success',
    actorType: 'user',
    actorId: ctx.userId,
    organizationId: ctx.organizationId,
    targetType: 'location',
    targetId: locationId,
    metadata,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function inOrg<T>(organizationId: string, fn: (tx: any) => Promise<T>): Promise<T> {
  const db = getOrgDb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
    return fn(tx);
  });
}

/** The business's locations, active first (by name), then the archived ones if asked. */
export async function listLocations(
  ctx: QuotaCtx,
  opts: { includeArchived?: boolean } = {},
): Promise<Location[]> {
  const rows = await inOrg(
    ctx.organizationId,
    (tx) =>
      tx.$queryRaw`
      SELECT id, name, address, time_zone, archived_at, created_at
        FROM organizations.location
       WHERE organization_id = ${ctx.organizationId}::uuid
         AND (${opts.includeArchived === true} OR archived_at IS NULL)
       ORDER BY archived_at IS NOT NULL, lower(name), created_at`,
  );
  return (rows as LocationRow[]).map(toLocation);
}

/**
 * For the modules (§6.4 b): the active location with this id in the context's business, or
 * ResourceNotFound (another business's id, an unknown id and an archived location look the same).
 */
export async function getActiveLocation(ctx: QuotaCtx, locationId: string): Promise<Location> {
  checkId(locationId);
  const rows = (await inOrg(
    ctx.organizationId,
    (tx) =>
      tx.$queryRaw`
      SELECT id, name, address, time_zone, archived_at, created_at
        FROM organizations.location
       WHERE id = ${locationId}::uuid AND organization_id = ${ctx.organizationId}::uuid
         AND archived_at IS NULL`,
  )) as LocationRow[];
  if (!rows[0]) throw new ResourceNotFound('Location not found');
  return toLocation(rows[0]);
}

/** The reconciliation of platform.locations: does the location of this operation exist? */
export async function locationQuotaResolver(
  organizationId: string,
  operationId: string,
): Promise<boolean> {
  if (!UUID_RE.test(operationId)) return false;
  const rows = (await inOrg(
    organizationId,
    (tx) => tx.$queryRaw`SELECT 1 FROM organizations.location WHERE id = ${operationId}::uuid`,
  )) as unknown[];
  return rows.length > 0;
}

export type CreateLocationInput = { name: string; address?: string | null; timeZone?: string };

/** „Adaugă locație”: one unit of platform.locations (QuotaExceeded over the limit). */
export async function createLocation(
  ctx: OrgContext,
  input: CreateLocationInput,
  quota: LocationQuota,
): Promise<Location> {
  manager(ctx);
  const name = cleanName(input.name);
  const address = cleanAddress(input.address);
  const timeZone = cleanTimeZone(input.timeZone);
  const id = crypto.randomUUID();
  const qctx = { organizationId: ctx.organizationId };

  await quota.reserve(qctx, LOCATIONS_QUOTA_KEY, 1, id);
  let row: LocationRow;
  try {
    row = await inOrg(ctx.organizationId, async (tx) => {
      const rows = (await tx.$queryRaw`
        INSERT INTO organizations.location
          (id, organization_id, name, address, time_zone, created_by_user_id, updated_at)
        VALUES (${id}::uuid, ${ctx.organizationId}::uuid, ${name}, ${address}, ${timeZone},
                ${ctx.userId}::uuid, now())
        RETURNING id, name, address, time_zone, archived_at, created_at`) as LocationRow[];
      await appendAuditEventInTx(
        prismaTxExecutor(tx),
        audit(ctx, AuditActions.locationCreated, id, { timeZone }),
      );
      return rows[0]!;
    });
  } catch (err) {
    await quota.release(qctx, id).catch((releaseErr: unknown) => {
      // the reconciliation releases it: the location does not exist
      console.error('[organizations] releasing platform.locations failed', {
        organizationId: ctx.organizationId,
        operationId: id,
        error: (releaseErr as Error)?.name,
      });
    });
    mapWriteError(err);
  }
  try {
    await quota.commit(qctx, id);
  } catch (err) {
    // the reconciliation commits it: the location exists (locationQuotaResolver)
    console.error('[organizations] committing platform.locations failed', {
      organizationId: ctx.organizationId,
      operationId: id,
      error: (err as Error)?.name,
    });
  }
  return toLocation(row);
}

export type UpdateLocationInput = {
  name?: string;
  address?: string | null;
  timeZone?: string;
};

/** „Editează”: the name, the address, the time zone. An archived location → Conflict. */
export async function updateLocation(
  ctx: OrgContext,
  locationId: string,
  patch: UpdateLocationInput,
): Promise<Location> {
  manager(ctx);
  checkId(locationId);
  const fields: string[] = [];
  const name = patch.name !== undefined ? cleanName(patch.name) : undefined;
  if (name !== undefined) fields.push('name');
  const address = patch.address !== undefined ? cleanAddress(patch.address) : undefined;
  if (patch.address !== undefined) fields.push('address');
  const timeZone = patch.timeZone !== undefined ? cleanTimeZone(patch.timeZone) : undefined;
  if (timeZone !== undefined) fields.push('timeZone');
  if (fields.length === 0) throw new InvalidInput('patch', 'patch:empty');

  try {
    return await inOrg(ctx.organizationId, async (tx) => {
      const current = (await tx.$queryRaw`
        SELECT id, name, address, time_zone, archived_at, created_at
          FROM organizations.location
         WHERE id = ${locationId}::uuid AND organization_id = ${ctx.organizationId}::uuid
         FOR UPDATE`) as LocationRow[];
      const c = current[0];
      if (!c) throw new ResourceNotFound('Location not found');
      if (c.archived_at) throw new Conflict('location_archived');
      const rows = (await tx.$queryRaw`
        UPDATE organizations.location
           SET name = ${name ?? c.name},
               address = ${patch.address !== undefined ? address : c.address},
               time_zone = ${timeZone ?? c.time_zone},
               updated_at = now()
         WHERE id = ${locationId}::uuid
        RETURNING id, name, address, time_zone, archived_at, created_at`) as LocationRow[];
      await appendAuditEventInTx(
        prismaTxExecutor(tx),
        audit(ctx, AuditActions.locationUpdated, locationId, { fields }),
      );
      return toLocation(rows[0]!);
    });
  } catch (err) {
    if (err instanceof ResourceNotFound || err instanceof Conflict) throw err;
    mapWriteError(err);
  }
}

/**
 * „Șterge locația”: archived (final) and its unit of platform.locations given back. Idempotent: on
 * an already archived location it only gives the unit back again (freeStockQuota is idempotent
 * on the operation), so a retry after a failed step settles the counter.
 */
export async function archiveLocation(
  ctx: OrgContext,
  locationId: string,
  quota: LocationQuota,
): Promise<Location> {
  manager(ctx);
  checkId(locationId);
  const location = await inOrg(ctx.organizationId, async (tx) => {
    const current = (await tx.$queryRaw`
      SELECT id, name, address, time_zone, archived_at, created_at
        FROM organizations.location
       WHERE id = ${locationId}::uuid AND organization_id = ${ctx.organizationId}::uuid
       FOR UPDATE`) as LocationRow[];
    const c = current[0];
    if (!c) throw new ResourceNotFound('Location not found');
    if (c.archived_at) return toLocation(c);
    const rows = (await tx.$queryRaw`
      UPDATE organizations.location SET archived_at = now(), updated_at = now()
       WHERE id = ${locationId}::uuid
      RETURNING id, name, address, time_zone, archived_at, created_at`) as LocationRow[];
    await appendAuditEventInTx(
      prismaTxExecutor(tx),
      audit(ctx, AuditActions.locationArchived, locationId),
    );
    return toLocation(rows[0]!);
  });
  await quota.free(
    { organizationId: ctx.organizationId },
    LOCATIONS_QUOTA_KEY,
    1,
    `location-archived:${locationId}`,
  );
  return location;
}
