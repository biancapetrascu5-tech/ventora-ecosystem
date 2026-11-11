import type { PoolClient } from 'pg';
import { AuditActions, appendAuditEventInTx, type AuditSqlExecutor } from '@ventora/audit';
import type { TenantContext } from '@ventora/access';
import { uuidv7 } from '@ventora/db-kit';
import { Conflict, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { withBookingTx } from './db';
import { bookingLocation } from './locations';
import { isUuid, normalizeName, normalizeSortOrder } from './validation';

/*
 * Lot B.3a — the bookable resources (BOOKING.md §3 B.3; plan
 * reports/2026-11-08_2007_plan-booking-b2-b3.md §2, approved 08.11.2026; design S124
 * BookingResources). A resource is a room, a space or a piece of equipment; `units` is „Câte
 * programări simultan”. „Servicii care o cer”: an appointment for such a service needs a free unit
 * of the resource (B.3b). Every write runs in one transaction as booking_rw with its audit row
 * (codes C.0e). No physical delete: a resource is archived, a link is archived.
 *
 * Archiving (S124, the design's recommendation): the resource leaves the calendar and cannot be
 * chosen for services; the services that need it can be booked without it while it is archived
 * (the links stay) and need it again when it is restored.
 */

export const RESOURCE_KINDS = ['room', 'space', 'equipment'] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const RESOURCE_LIMITS = {
  name: 80,
  unitsMax: 50,
  servicesMax: 200,
  reorderMax: 500,
} as const;

export type Resource = {
  id: string;
  name: string;
  kind: ResourceKind;
  /** „Câte programări simultan”. */
  units: number;
  sortOrder: number;
  /** B.10: the location it stands at; null = every location. */
  locationId: string | null;
  /** „Servicii care o cer”: the active services linked to it, in the catalog's order. */
  services: Array<{ id: string; name: string }>;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ResourceInput = {
  name?: unknown;
  kind?: unknown;
  units?: unknown;
  /** The complete list of the services that need it (absent: unchanged on update, none on create). */
  serviceIds?: unknown;
  sortOrder?: unknown;
  /** B.10: an active location id or null; on update, undefined keeps it. */
  locationId?: unknown;
};

type ResourceRow = {
  id: string;
  name: string;
  kind: ResourceKind;
  units: number;
  sort_order: number;
  location_id: string | null;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

const RESOURCE_COLUMNS = `id, name, kind, units, sort_order, location_id, archived_at, created_at,
  updated_at`;

function requireId(id: unknown): string {
  // an id that is not a UUID cannot exist: the same answer as another business's id (T1)
  if (!isUuid(id)) throw new ResourceNotFound();
  return id;
}

function requireKind(value: unknown): ResourceKind {
  if (typeof value !== 'string' || !(RESOURCE_KINDS as readonly string[]).includes(value)) {
    throw new InvalidInput('kind');
  }
  return value as ResourceKind;
}

function requireUnits(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > RESOURCE_LIMITS.unitsMax
  ) {
    throw new InvalidInput('units');
  }
  return value;
}

function requireServiceIds(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > RESOURCE_LIMITS.servicesMax ||
    !value.every(isUuid) ||
    new Set(value.map((v) => v.toLowerCase())).size !== value.length
  ) {
    throw new InvalidInput('serviceIds');
  }
  return value.map((v) => v.toLowerCase());
}

function audit(
  exec: AuditSqlExecutor,
  ctx: TenantContext,
  action: string,
  targetId: string,
  metadata: Record<string, unknown>,
) {
  return appendAuditEventInTx(exec, {
    category: 'booking',
    action,
    outcome: 'success',
    actorType: 'user',
    actorId: ctx.userId,
    organizationId: ctx.organizationId,
    targetType: 'booking_resource',
    targetId,
    metadata,
  });
}

function mapWriteError(err: unknown): never {
  const e = err as { code?: string; constraint?: string };
  if (e?.code === '23505' && e.constraint === 'resource_active_name_key') {
    throw new Conflict('resource_name_taken');
  }
  throw err;
}

async function servicesOf(
  client: PoolClient,
  resourceIds: string[],
): Promise<Map<string, Array<{ id: string; name: string }>>> {
  const out = new Map<string, Array<{ id: string; name: string }>>();
  if (resourceIds.length === 0) return out;
  const { rows } = await client.query<{ resource_id: string; id: string; name: string }>(
    `SELECT l.resource_id, s.id, s.name
       FROM booking.service_resource l
       JOIN booking.service s ON s.id = l.service_id
       LEFT JOIN booking.service_category c ON c.id = s.category_id
      WHERE l.resource_id = ANY($1::uuid[]) AND l.archived_at IS NULL AND s.archived_at IS NULL
      ORDER BY c.sort_order NULLS LAST, c.name NULLS LAST, s.sort_order, s.name, s.id`,
    [resourceIds],
  );
  for (const r of rows) {
    const list = out.get(r.resource_id) ?? [];
    list.push({ id: r.id, name: r.name });
    out.set(r.resource_id, list);
  }
  return out;
}

async function toResources(client: PoolClient, rows: ResourceRow[]): Promise<Resource[]> {
  const services = await servicesOf(
    client,
    rows.map((r) => r.id),
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    units: r.units,
    sortOrder: r.sort_order,
    locationId: r.location_id,
    services: services.get(r.id) ?? [],
    archivedAt: r.archived_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

async function readResource(client: PoolClient, id: string, lock = false): Promise<ResourceRow> {
  const { rows } = await client.query<ResourceRow>(
    `SELECT ${RESOURCE_COLUMNS} FROM booking.resource WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
  if (!rows[0]) throw new ResourceNotFound();
  return rows[0];
}

/**
 * „Servicii care o cer”: the complete list. Adds the missing links, archives the ones left out,
 * all in the caller's transaction. Every service must be active in this business.
 */
async function setServices(
  client: PoolClient,
  ctx: TenantContext,
  resourceId: string,
  serviceIds: string[],
): Promise<{ added: string[]; removed: string[] }> {
  if (serviceIds.length > 0) {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM booking.service WHERE id = ANY($1::uuid[]) AND archived_at IS NULL`,
      [serviceIds],
    );
    if (rows.length !== serviceIds.length) throw new InvalidInput('serviceIds');
  }
  const { rows: current } = await client.query<{ id: string; service_id: string }>(
    `SELECT id, service_id FROM booking.service_resource
      WHERE resource_id = $1 AND archived_at IS NULL FOR UPDATE`,
    [resourceId],
  );
  const have = new Set(current.map((c) => c.service_id));
  const want = new Set(serviceIds);
  const removed = current.filter((c) => !want.has(c.service_id));
  for (const link of removed) {
    await client.query(
      `UPDATE booking.service_resource SET archived_at = now(), archived_by_user_id = $2
        WHERE id = $1`,
      [link.id, ctx.userId],
    );
  }
  const added = serviceIds.filter((s) => !have.has(s));
  for (const serviceId of added) {
    await client.query(
      `INSERT INTO booking.service_resource
         (id, organization_id, service_id, resource_id, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [uuidv7(), ctx.organizationId, serviceId, resourceId, ctx.userId],
    );
  }
  return { added, removed: removed.map((r) => r.service_id) };
}

// ── reading ─────────────────────────────────────────────────────────────────────────────────

/** BookingResources: „Active” (default) or with the archived ones („Arhivate”), in order. */
export async function listResourcesInOrg(
  ctx: TenantContext,
  options: { includeArchived?: unknown } = {},
): Promise<Resource[]> {
  if (options.includeArchived !== undefined && typeof options.includeArchived !== 'boolean') {
    throw new InvalidInput('includeArchived');
  }
  return withBookingTx(
    ctx.organizationId,
    async (client) => {
      const { rows } = await client.query<ResourceRow>(
        `SELECT ${RESOURCE_COLUMNS} FROM booking.resource
          ${options.includeArchived ? '' : 'WHERE archived_at IS NULL'}
          ORDER BY sort_order, name, id`,
      );
      return toResources(client, rows);
    },
    true,
  );
}

export async function getResourceInOrg(ctx: TenantContext, resourceId: unknown): Promise<Resource> {
  const id = requireId(resourceId);
  return withBookingTx(
    ctx.organizationId,
    async (client) => (await toResources(client, [await readResource(client, id)]))[0]!,
    true,
  );
}

// ── writing (booking:settings) ──────────────────────────────────────────────────────────────

/** „Resursă nouă”. */
export async function createResourceInOrg(
  ctx: TenantContext,
  input: ResourceInput,
): Promise<Resource> {
  const name = normalizeName('name', input.name, RESOURCE_LIMITS.name);
  const kind = requireKind(input.kind);
  const units = requireUnits(input.units);
  const serviceIds = input.serviceIds === undefined ? [] : requireServiceIds(input.serviceIds);
  const sortOrder = normalizeSortOrder(input.sortOrder);
  const locationId =
    input.locationId === undefined ? null : await bookingLocation(ctx, input.locationId);
  try {
    return await withBookingTx(ctx.organizationId, async (client, exec) => {
      const id = uuidv7();
      const { rows } = await client.query<ResourceRow>(
        `INSERT INTO booking.resource (id, organization_id, name, kind, units, sort_order,
                                       location_id, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING ${RESOURCE_COLUMNS}`,
        [id, ctx.organizationId, name, kind, units, sortOrder, locationId, ctx.userId],
      );
      await setServices(client, ctx, id, serviceIds);
      await audit(exec, ctx, AuditActions.bookingResourceCreated, id, {
        name,
        kind,
        units,
        serviceIds,
        ...(locationId ? { locationId } : {}),
      });
      return (await toResources(client, rows))[0]!;
    });
  } catch (err) {
    mapWriteError(err);
  }
}

/** „Editează”: name, type, units and, when given, the complete list of services. */
export async function updateResourceInOrg(
  ctx: TenantContext,
  resourceId: unknown,
  input: ResourceInput,
): Promise<Resource> {
  const id = requireId(resourceId);
  const name = normalizeName('name', input.name, RESOURCE_LIMITS.name);
  const kind = requireKind(input.kind);
  const units = requireUnits(input.units);
  const serviceIds = input.serviceIds === undefined ? null : requireServiceIds(input.serviceIds);
  const locationId =
    input.locationId === undefined ? undefined : await bookingLocation(ctx, input.locationId);
  try {
    return await withBookingTx(ctx.organizationId, async (client, exec) => {
      const before = await readResource(client, id, true);
      // an archived resource cannot be chosen for services (S124)
      if (before.archived_at && serviceIds !== null) throw new Conflict('resource_archived');
      const location = locationId === undefined ? before.location_id : locationId;
      const { rows } = await client.query<ResourceRow>(
        `UPDATE booking.resource SET name = $2, kind = $3, units = $4, location_id = $5
          WHERE id = $1 RETURNING ${RESOURCE_COLUMNS}`,
        [id, name, kind, units, location],
      );
      const links =
        serviceIds === null
          ? { added: [], removed: [] }
          : await setServices(client, ctx, id, serviceIds);
      await audit(exec, ctx, AuditActions.bookingResourceUpdated, id, {
        name,
        ...(before.name !== name ? { nameChanged: true } : {}),
        ...(before.kind !== kind ? { kind: { from: before.kind, to: kind } } : {}),
        ...(before.units !== units ? { units: { from: before.units, to: units } } : {}),
        ...(before.location_id !== location ? { locationChanged: true } : {}),
        ...(links.added.length ? { servicesAdded: links.added } : {}),
        ...(links.removed.length ? { servicesRemoved: links.removed } : {}),
      });
      return (await toResources(client, rows))[0]!;
    });
  } catch (err) {
    mapWriteError(err);
  }
}

/**
 * „Arhivează resursa” (S124): out of the calendar, not choosable for services. The services that
 * need it stay linked and can be booked without it until it is restored; the future appointments
 * that use it stay (B.3b).
 */
export async function archiveResourceInOrg(
  ctx: TenantContext,
  resourceId: unknown,
): Promise<Resource> {
  const id = requireId(resourceId);
  return withBookingTx(ctx.organizationId, async (client, exec) => {
    const before = await readResource(client, id, true);
    if (before.archived_at) return (await toResources(client, [before]))[0]!;
    const { rows } = await client.query<ResourceRow>(
      `UPDATE booking.resource SET archived_at = now(), archived_by_user_id = $2
        WHERE id = $1 RETURNING ${RESOURCE_COLUMNS}`,
      [id, ctx.userId],
    );
    const services = (await servicesOf(client, [id])).get(id) ?? [];
    await audit(exec, ctx, AuditActions.bookingResourceArchived, id, {
      name: before.name,
      serviceIds: services.map((s) => s.id),
    });
    return (await toResources(client, rows))[0]!;
  });
}

/** „Restaurează”: the services that needed it need it again. A taken name → resource_name_taken. */
export async function restoreResourceInOrg(
  ctx: TenantContext,
  resourceId: unknown,
): Promise<Resource> {
  const id = requireId(resourceId);
  try {
    return await withBookingTx(ctx.organizationId, async (client, exec) => {
      const before = await readResource(client, id, true);
      if (!before.archived_at) return (await toResources(client, [before]))[0]!;
      const { rows } = await client.query<ResourceRow>(
        `UPDATE booking.resource SET archived_at = NULL, archived_by_user_id = NULL
          WHERE id = $1 RETURNING ${RESOURCE_COLUMNS}`,
        [id],
      );
      await audit(exec, ctx, AuditActions.bookingResourceRestored, id, { name: before.name });
      return (await toResources(client, rows))[0]!;
    });
  } catch (err) {
    mapWriteError(err);
  }
}

/** The order of the active resources (the calendar's resource columns), all of them at once. */
export async function reorderResourcesInOrg(
  ctx: TenantContext,
  resourceIds: unknown,
): Promise<Resource[]> {
  if (
    !Array.isArray(resourceIds) ||
    resourceIds.length > RESOURCE_LIMITS.reorderMax ||
    !resourceIds.every(isUuid) ||
    new Set(resourceIds.map((r) => r.toLowerCase())).size !== resourceIds.length
  ) {
    throw new InvalidInput('resourceIds');
  }
  const ids = resourceIds.map((r) => r.toLowerCase());
  return withBookingTx(ctx.organizationId, async (client, exec) => {
    const { rows: active } = await client.query<ResourceRow>(
      `SELECT ${RESOURCE_COLUMNS} FROM booking.resource
        WHERE archived_at IS NULL ORDER BY id FOR UPDATE`,
    );
    const byId = new Map(active.map((r) => [r.id, r]));
    if (active.length !== ids.length || !ids.every((id) => byId.has(id))) {
      throw new Conflict('resource_order_stale');
    }
    for (const [position, id] of ids.entries()) {
      const before = byId.get(id)!;
      if (before.sort_order === position) continue;
      await client.query(`UPDATE booking.resource SET sort_order = $2 WHERE id = $1`, [
        id,
        position,
      ]);
      await audit(exec, ctx, AuditActions.bookingResourceUpdated, id, {
        name: before.name,
        sortOrder: { from: before.sort_order, to: position },
        reorder: true,
      });
    }
    const { rows } = await client.query<ResourceRow>(
      `SELECT ${RESOURCE_COLUMNS} FROM booking.resource
        WHERE archived_at IS NULL ORDER BY sort_order, name, id`,
    );
    return toResources(client, rows);
  });
}

// ── for B.3b and B.5 ────────────────────────────────────────────────────────────────────────

/**
 * The active resources an appointment for this service needs (archived ones are skipped). B.10: at
 * a location, only the ones standing there or everywhere (location_id null); without a location
 * (a business with one site, a member who works everywhere) all of them, as before.
 */
export async function requiredResources(
  client: PoolClient,
  serviceId: string,
  locationId: string | null = null,
): Promise<Array<{ id: string; units: number }>> {
  const { rows } = await client.query<{ id: string; units: number }>(
    `SELECT r.id, r.units
       FROM booking.service_resource l
       JOIN booking.resource r ON r.id = l.resource_id
      WHERE l.service_id = $1 AND l.archived_at IS NULL AND r.archived_at IS NULL
        AND ($2::uuid IS NULL OR r.location_id IS NULL OR r.location_id = $2::uuid)
      ORDER BY r.id`,
    [serviceId, locationId],
  );
  return rows;
}
