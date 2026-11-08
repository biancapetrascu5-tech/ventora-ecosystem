import type { PoolClient } from 'pg';
import { AuditActions, appendAuditEventInTx, type AuditSqlExecutor } from '@ventora/audit';
import type { TenantContext } from '@ventora/access';
import { BookingServiceArchivedV1 } from '@ventora/contracts';
import { uuidv7, writeOutboxEvent } from '@ventora/db-kit';
import { Conflict, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { withBookingTx } from './db';
import {
  LIMITS,
  isUuid,
  normalizeName,
  normalizeSortOrder,
  validateService,
  type Currency,
  type PriceKind,
  type ServiceInputParams,
} from './validation';

/*
 * Lot B.1 — the service catalog (BOOKING.md §3 B.1; ARCHITECTURE §6.4 c). Every call runs in one
 * transaction as booking_rw with the organization of the authorized context: the row, the audit
 * (category booking, in the same transaction, so a failed audit leaves nothing) and, on archiving,
 * the outbox event. No physical delete: archive and restore.
 */

export type ServiceCategory = {
  id: string;
  name: string;
  sortOrder: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Service = {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  name: string;
  description: string | null;
  durationMinutes: number;
  durationMaxMinutes: number | null;
  priceKind: PriceKind;
  priceMinor: number;
  priceMaxMinor: number | null;
  currency: Currency;
  capacity: number;
  bookableOnline: boolean;
  sortOrder: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ServiceRow = {
  id: string;
  category_id: string | null;
  category_name: string | null;
  name: string;
  description: string | null;
  duration_minutes: number;
  duration_max_minutes: number | null;
  price_kind: PriceKind;
  price_minor: number;
  price_max_minor: number | null;
  currency: Currency;
  capacity: number;
  bookable_online: boolean;
  sort_order: number;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type CategoryRow = {
  id: string;
  name: string;
  sort_order: number;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

const SERVICE_SELECT = `
  SELECT s.id, s.category_id, c.name AS category_name, s.name, s.description,
         s.duration_minutes, s.duration_max_minutes, s.price_kind, s.price_minor,
         s.price_max_minor, s.currency, s.capacity, s.bookable_online, s.sort_order,
         s.archived_at, s.created_at, s.updated_at
    FROM booking.service s
    LEFT JOIN booking.service_category c ON c.id = s.category_id`;

const SERVICE_ORDER = `ORDER BY c.sort_order NULLS LAST, c.name NULLS LAST, s.sort_order, s.name, s.id`;

function toService(r: ServiceRow): Service {
  return {
    id: r.id,
    categoryId: r.category_id,
    categoryName: r.category_name,
    name: r.name,
    description: r.description,
    durationMinutes: r.duration_minutes,
    durationMaxMinutes: r.duration_max_minutes,
    priceKind: r.price_kind,
    priceMinor: r.price_minor,
    priceMaxMinor: r.price_max_minor,
    currency: r.currency.trim() as Currency,
    capacity: r.capacity,
    bookableOnline: r.bookable_online,
    sortOrder: r.sort_order,
    archivedAt: r.archived_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toCategory(r: CategoryRow): ServiceCategory {
  return {
    id: r.id,
    name: r.name,
    sortOrder: r.sort_order,
    archivedAt: r.archived_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// pg errors carry `code` and `constraint` as properties that may be present but undefined
function pgField(err: unknown, field: 'code' | 'constraint'): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const value = (err as Record<string, unknown>)[field];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

const pgCode = (err: unknown) => pgField(err, 'code');
const pgConstraint = (err: unknown) => pgField(err, 'constraint');

/** The database refusals the form can act on, as typed errors; anything else propagates. */
function mapServiceWriteError(err: unknown, restoring = false): never {
  const code = pgCode(err);
  if (code === '23505' && pgConstraint(err) === 'service_active_name_key') {
    throw new Conflict('service_name_taken');
  }
  // service_guard (23514 without a constraint name) or the FK (23503): the category
  if ((code === '23514' && !pgConstraint(err)) || code === '23503') {
    if (restoring) throw new Conflict('service_category_archived');
    throw new InvalidInput('categoryId');
  }
  throw err;
}

function mapCategoryWriteError(err: unknown): never {
  if (pgCode(err) === '23505' && pgConstraint(err) === 'service_category_active_name_key') {
    throw new Conflict('service_category_name_taken');
  }
  throw err;
}

function audit(
  exec: AuditSqlExecutor,
  ctx: TenantContext,
  action: string,
  targetType: 'booking_service' | 'booking_service_category',
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
    targetType,
    targetId,
    metadata,
  });
}

async function readService(client: PoolClient, id: string): Promise<Service | null> {
  const { rows } = await client.query<ServiceRow>(`${SERVICE_SELECT} WHERE s.id = $1`, [id]);
  return rows[0] ? toService(rows[0]) : null;
}

function requireId(id: unknown): string {
  // an id that is not a UUID cannot exist: the same answer as another business's id
  if (!isUuid(id)) throw new ResourceNotFound();
  return id;
}

// ── reading ──────────────────────────────────────────────────────────────────────────────────

export async function listServicesInOrg(
  ctx: TenantContext,
  options: { includeArchived?: boolean } = {},
): Promise<Service[]> {
  return withBookingTx(
    ctx.organizationId,
    async (client) => {
      const where = options.includeArchived ? '' : 'WHERE s.archived_at IS NULL';
      const { rows } = await client.query<ServiceRow>(
        `${SERVICE_SELECT} ${where} ${SERVICE_ORDER}`,
      );
      return rows.map(toService);
    },
    true,
  );
}

/**
 * The services a new appointment can use (B.4 / B.5, BookingNew): active only. Internal to the
 * module — not in the public contract.
 */
export async function listBookableServices(ctx: TenantContext): Promise<Service[]> {
  return listServicesInOrg(ctx, { includeArchived: false });
}

/** One service, archived or not (old appointments keep showing it). */
export async function getServiceInOrg(ctx: TenantContext, serviceId: string): Promise<Service> {
  const id = requireId(serviceId);
  const service = await withBookingTx(
    ctx.organizationId,
    (client) => readService(client, id),
    true,
  );
  if (!service) throw new ResourceNotFound();
  return service;
}

export async function listServiceCategoriesInOrg(
  ctx: TenantContext,
  options: { includeArchived?: boolean } = {},
): Promise<ServiceCategory[]> {
  return withBookingTx(
    ctx.organizationId,
    async (client) => {
      const where = options.includeArchived ? '' : 'WHERE archived_at IS NULL';
      const { rows } = await client.query<CategoryRow>(
        `SELECT id, name, sort_order, archived_at, created_at, updated_at
           FROM booking.service_category ${where}
          ORDER BY sort_order, name, id`,
      );
      return rows.map(toCategory);
    },
    true,
  );
}

// ── services: writing ────────────────────────────────────────────────────────────────────────

export async function createServiceInOrg(
  ctx: TenantContext,
  params: ServiceInputParams,
): Promise<Service> {
  const input = validateService(params);
  const id = uuidv7();
  try {
    return await withBookingTx(ctx.organizationId, async (client, exec) => {
      await client.query(
        `INSERT INTO booking.service
           (id, organization_id, category_id, name, description, duration_minutes,
            duration_max_minutes, price_kind, price_minor, price_max_minor, currency, capacity,
            bookable_online, sort_order, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          id,
          ctx.organizationId,
          input.categoryId,
          input.name,
          input.description,
          input.durationMinutes,
          input.durationMaxMinutes,
          input.priceKind,
          input.priceMinor,
          input.priceMaxMinor,
          input.currency,
          input.capacity,
          input.bookableOnline,
          input.sortOrder,
          ctx.userId,
        ],
      );
      await audit(exec, ctx, AuditActions.bookingServiceCreated, 'booking_service', id, {
        name: input.name,
        categoryId: input.categoryId,
      });
      return (await readService(client, id))!;
    });
  } catch (err) {
    mapServiceWriteError(err);
  }
}

/** Replaces the editable fields of an active or archived service (the form sends all of them). */
export async function updateServiceInOrg(
  ctx: TenantContext,
  serviceId: string,
  params: ServiceInputParams,
): Promise<Service> {
  const id = requireId(serviceId);
  const input = validateService(params);
  try {
    return await withBookingTx(ctx.organizationId, async (client, exec) => {
      const before = await readService(client, id);
      if (!before) throw new ResourceNotFound();
      await client.query(
        `UPDATE booking.service
            SET category_id = $2, name = $3, description = $4, duration_minutes = $5,
                duration_max_minutes = $6, price_kind = $7, price_minor = $8,
                price_max_minor = $9, currency = $10, capacity = $11, bookable_online = $12,
                sort_order = $13
          WHERE id = $1`,
        [
          id,
          input.categoryId,
          input.name,
          input.description,
          input.durationMinutes,
          input.durationMaxMinutes,
          input.priceKind,
          input.priceMinor,
          input.priceMaxMinor,
          input.currency,
          input.capacity,
          input.bookableOnline,
          input.sortOrder,
        ],
      );
      const after = (await readService(client, id))!;
      const changed = (
        [
          'categoryId',
          'name',
          'description',
          'durationMinutes',
          'durationMaxMinutes',
          'priceKind',
          'priceMinor',
          'priceMaxMinor',
          'currency',
          'capacity',
          'bookableOnline',
          'sortOrder',
        ] as const
      ).filter((k) => before[k] !== after[k]);
      await audit(exec, ctx, AuditActions.bookingServiceUpdated, 'booking_service', id, {
        name: after.name,
        changed,
      });
      return after;
    });
  } catch (err) {
    mapServiceWriteError(err);
  }
}

/** Archives a service (§6.4 c) and publishes booking.service.archived; twice changes nothing. */
export async function archiveServiceInOrg(ctx: TenantContext, serviceId: string): Promise<Service> {
  const id = requireId(serviceId);
  return withBookingTx(ctx.organizationId, async (client, exec) => {
    const { rows } = await client.query<{ archived_at: Date; name: string }>(
      `UPDATE booking.service
          SET archived_at = now(), archived_by_user_id = $2
        WHERE id = $1 AND archived_at IS NULL
        RETURNING archived_at, name`,
      [id, ctx.userId],
    );
    if (rows[0]) {
      await audit(exec, ctx, AuditActions.bookingServiceArchived, 'booking_service', id, {
        name: rows[0].name,
      });
      await writeOutboxEvent(client, 'booking', BookingServiceArchivedV1, {
        organizationId: ctx.organizationId,
        sourceApp: 'platform',
        resourceId: id,
        payload: {
          serviceId: id,
          name: rows[0].name,
          archivedAt: rows[0].archived_at.toISOString(),
        },
      });
    }
    const service = await readService(client, id);
    if (!service) throw new ResourceNotFound();
    return service;
  });
}

/**
 * Restores an archived service; its name must be free. If its category was archived in the
 * meantime, the service comes back in „Fără categorie” (category_id NULL, UI plan C1) and the
 * audit row of the restore records the category it left. The service row is locked FOR UPDATE and
 * its category FOR SHARE, so an archiving or a restore of the category cannot cross the decision.
 */
export async function restoreServiceInOrg(ctx: TenantContext, serviceId: string): Promise<Service> {
  const id = requireId(serviceId);
  try {
    return await withBookingTx(ctx.organizationId, async (client, exec) => {
      const { rows: locked } = await client.query<{
        name: string;
        archived_at: Date | null;
        category_id: string | null;
      }>(`SELECT name, archived_at, category_id FROM booking.service WHERE id = $1 FOR UPDATE`, [
        id,
      ]);
      const current = locked[0];
      if (!current) throw new ResourceNotFound();
      let category: { name: string; archived_at: Date | null } | undefined;
      if (current.archived_at && current.category_id) {
        const { rows } = await client.query<{ name: string; archived_at: Date | null }>(
          `SELECT name, archived_at FROM booking.service_category WHERE id = $1 FOR SHARE`,
          [current.category_id],
        );
        category = rows[0];
      }
      if (current.archived_at) {
        // a category not found under RLS cannot happen (same-business FK + guard); treat it as gone
        const leavesCategory =
          current.category_id !== null && (category === undefined || category.archived_at !== null);
        await client.query(
          `UPDATE booking.service
              SET archived_at = NULL, archived_by_user_id = NULL, category_id = $2
            WHERE id = $1`,
          [id, leavesCategory ? null : current.category_id],
        );
        await audit(exec, ctx, AuditActions.bookingServiceRestored, 'booking_service', id, {
          name: current.name,
          ...(leavesCategory
            ? {
                movedToUncategorized: true,
                previousCategoryId: current.category_id,
                previousCategoryName: category?.name ?? null,
              }
            : {}),
        });
      }
      const service = await readService(client, id);
      if (!service) throw new ResourceNotFound();
      return service;
    });
  } catch (err) {
    mapServiceWriteError(err, true);
  }
}

// ── categories: writing ──────────────────────────────────────────────────────────────────────

export async function createServiceCategoryInOrg(
  ctx: TenantContext,
  params: { name: string; sortOrder?: number },
): Promise<ServiceCategory> {
  const name = normalizeName('name', params.name, LIMITS.categoryName);
  const sortOrder = normalizeSortOrder(params.sortOrder);
  const id = uuidv7();
  try {
    return await withBookingTx(ctx.organizationId, async (client, exec) => {
      const { rows } = await client.query<CategoryRow>(
        `INSERT INTO booking.service_category (id, organization_id, name, sort_order, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, sort_order, archived_at, created_at, updated_at`,
        [id, ctx.organizationId, name, sortOrder, ctx.userId],
      );
      await audit(
        exec,
        ctx,
        AuditActions.bookingServiceCategoryCreated,
        'booking_service_category',
        id,
        { name },
      );
      return toCategory(rows[0]!);
    });
  } catch (err) {
    mapCategoryWriteError(err);
  }
}

export async function updateServiceCategoryInOrg(
  ctx: TenantContext,
  categoryId: string,
  params: { name: string; sortOrder?: number },
): Promise<ServiceCategory> {
  const id = requireId(categoryId);
  const name = normalizeName('name', params.name, LIMITS.categoryName);
  const sortOrder = normalizeSortOrder(params.sortOrder);
  try {
    return await withBookingTx(ctx.organizationId, async (client, exec) => {
      const { rows } = await client.query<CategoryRow>(
        `UPDATE booking.service_category SET name = $2, sort_order = $3 WHERE id = $1
         RETURNING id, name, sort_order, archived_at, created_at, updated_at`,
        [id, name, sortOrder],
      );
      if (!rows[0]) throw new ResourceNotFound();
      await audit(
        exec,
        ctx,
        AuditActions.bookingServiceCategoryUpdated,
        'booking_service_category',
        id,
        { name },
      );
      return toCategory(rows[0]);
    });
  } catch (err) {
    mapCategoryWriteError(err);
  }
}

/** At most this many categories in one reordering (the catalog of a pilot business is far smaller). */
const MAX_REORDER = 200;

/**
 * Sets the order of all active categories at once (UI plan C4): `categoryIds` is the full list of
 * the active categories, in the new order; each gets sort_order = its position. One transaction:
 * the active categories are locked FOR UPDATE, so a category added, archived or restored in the
 * meantime makes the list stale (Conflict service_category_order_stale) instead of half applied.
 * One audit row booking.service_category_updated per category whose position changed.
 */
export async function reorderServiceCategoriesInOrg(
  ctx: TenantContext,
  categoryIds: unknown,
): Promise<ServiceCategory[]> {
  if (
    !Array.isArray(categoryIds) ||
    categoryIds.length > MAX_REORDER ||
    !categoryIds.every(isUuid) ||
    new Set(categoryIds.map((c) => c.toLowerCase())).size !== categoryIds.length
  ) {
    throw new InvalidInput('categoryIds');
  }
  const ids = categoryIds.map((c) => c.toLowerCase());
  return withBookingTx(ctx.organizationId, async (client, exec) => {
    const { rows: active } = await client.query<CategoryRow>(
      `SELECT id, name, sort_order, archived_at, created_at, updated_at
         FROM booking.service_category
        WHERE archived_at IS NULL
        ORDER BY id
          FOR UPDATE`,
    );
    const byId = new Map(active.map((r) => [r.id, r]));
    if (active.length !== ids.length || !ids.every((id) => byId.has(id))) {
      throw new Conflict('service_category_order_stale');
    }
    for (const [position, id] of ids.entries()) {
      const before = byId.get(id)!;
      if (before.sort_order === position) continue;
      await client.query(`UPDATE booking.service_category SET sort_order = $2 WHERE id = $1`, [
        id,
        position,
      ]);
      await audit(
        exec,
        ctx,
        AuditActions.bookingServiceCategoryUpdated,
        'booking_service_category',
        id,
        { name: before.name, sortOrder: { from: before.sort_order, to: position }, reorder: true },
      );
    }
    const { rows } = await client.query<CategoryRow>(
      `SELECT id, name, sort_order, archived_at, created_at, updated_at
         FROM booking.service_category
        WHERE archived_at IS NULL
        ORDER BY sort_order, name, id`,
    );
    return rows.map(toCategory);
  });
}

/**
 * Archives a category; refused (Conflict) while it has active services. The row is locked
 * FOR UPDATE first, so a service being added to it at the same time either finishes first (and
 * is counted) or waits and is then refused by service_guard.
 */
export async function archiveServiceCategoryInOrg(
  ctx: TenantContext,
  categoryId: string,
): Promise<ServiceCategory> {
  const id = requireId(categoryId);
  return withBookingTx(ctx.organizationId, async (client, exec) => {
    const { rows: locked } = await client.query<CategoryRow>(
      `SELECT id, name, sort_order, archived_at, created_at, updated_at
         FROM booking.service_category WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const category = locked[0];
    if (!category) throw new ResourceNotFound();
    if (category.archived_at) return toCategory(category);
    const { rows: active } = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM booking.service WHERE category_id = $1 AND archived_at IS NULL`,
      [id],
    );
    if ((active[0]?.n ?? 0) > 0) throw new Conflict('service_category_not_empty');
    const { rows } = await client.query<CategoryRow>(
      `UPDATE booking.service_category SET archived_at = now(), archived_by_user_id = $2
        WHERE id = $1
        RETURNING id, name, sort_order, archived_at, created_at, updated_at`,
      [id, ctx.userId],
    );
    await audit(
      exec,
      ctx,
      AuditActions.bookingServiceCategoryArchived,
      'booking_service_category',
      id,
      { name: category.name },
    );
    return toCategory(rows[0]!);
  });
}

export async function restoreServiceCategoryInOrg(
  ctx: TenantContext,
  categoryId: string,
): Promise<ServiceCategory> {
  const id = requireId(categoryId);
  try {
    return await withBookingTx(ctx.organizationId, async (client, exec) => {
      const { rows } = await client.query<CategoryRow>(
        `UPDATE booking.service_category SET archived_at = NULL, archived_by_user_id = NULL
          WHERE id = $1 AND archived_at IS NOT NULL
          RETURNING id, name, sort_order, archived_at, created_at, updated_at`,
        [id],
      );
      if (rows[0]) {
        await audit(
          exec,
          ctx,
          AuditActions.bookingServiceCategoryRestored,
          'booking_service_category',
          id,
          { name: rows[0].name },
        );
        return toCategory(rows[0]);
      }
      const { rows: current } = await client.query<CategoryRow>(
        `SELECT id, name, sort_order, archived_at, created_at, updated_at
           FROM booking.service_category WHERE id = $1`,
        [id],
      );
      if (!current[0]) throw new ResourceNotFound();
      return toCategory(current[0]);
    });
  } catch (err) {
    mapCategoryWriteError(err);
  }
}
