import type { PoolClient } from 'pg';
import { AuditActions, appendAuditEventInTx } from '@ventora/audit';
import type { TenantContext } from '@ventora/access';
import { uuidv7 } from '@ventora/db-kit';
import { Conflict, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { withBookingTx } from './db';
import { doesService } from './staff-services';
import { isUuid, LIMITS, type PriceKind } from './validation';
import { hubOnly } from './actor';

/*
 * Lot B.2c — the duration and the price of a service for one member (BOOKING.md §3 B.2c, proposed
 * 10.11.2026; S129 recommended „not for the pilot”, the founder asked for it after B.2b). Optional:
 * a NULL column keeps the service's value. The currency, the capacity and the resources stay the
 * service's (S123-2).
 *
 * Effective terms of a member for a service:
 *   duration min = terms.duration_minutes ?? service.duration_minutes
 *   duration max = terms.duration_max_minutes ?? service.duration_max_minutes ?? duration min
 *   price        = terms (kind, minor, max) when set, else the service's
 * The appointment takes them from the member chosen (keep_snapshot); „Oricine e liber” fixes them
 * after the member chosen at save time; the free slots use each member's duration.
 */

export type StaffServiceTerms = {
  staffMemberId: string;
  serviceId: string;
  durationMinutes: number | null;
  durationMaxMinutes: number | null;
  price: { kind: PriceKind; minor: number; maxMinor: number | null } | null;
  updatedAt: Date;
};

/** What a member actually takes for a service (the terms over the service). */
export type EffectiveTerms = {
  durationMin: number;
  durationMax: number;
  priceKind: PriceKind;
  priceMinor: number;
  priceMaxMinor: number | null;
  /** true when the member has terms of their own for this service. */
  own: boolean;
};

export type ServiceTermsBase = {
  duration_minutes: number;
  duration_max_minutes: number | null;
  price_kind: PriceKind;
  price_minor: number;
  price_max_minor: number | null;
};

type TermsRow = {
  staff_member_id: string;
  service_id: string;
  duration_minutes: number | null;
  duration_max_minutes: number | null;
  price_kind: PriceKind | null;
  price_minor: number | null;
  price_max_minor: number | null;
  updated_at: Date;
};

const TERMS_COLUMNS = `staff_member_id, service_id, duration_minutes, duration_max_minutes,
  price_kind, price_minor, price_max_minor, updated_at`;

function toTerms(r: TermsRow): StaffServiceTerms {
  return {
    staffMemberId: r.staff_member_id,
    serviceId: r.service_id,
    durationMinutes: r.duration_minutes,
    durationMaxMinutes: r.duration_max_minutes,
    price:
      r.price_kind === null
        ? null
        : { kind: r.price_kind, minor: r.price_minor!, maxMinor: r.price_max_minor },
    updatedAt: r.updated_at,
  };
}

/** The effective terms from the service and a member's row (or none). */
export function effective(service: ServiceTermsBase, row: TermsRow | undefined): EffectiveTerms {
  const durationMin = row?.duration_minutes ?? service.duration_minutes;
  const durationMax =
    row?.duration_max_minutes ?? service.duration_max_minutes ?? Math.max(durationMin, 0);
  const ownPrice = row !== undefined && row.price_kind !== null;
  return {
    durationMin,
    durationMax: Math.max(durationMax, durationMin),
    priceKind: ownPrice ? row!.price_kind! : service.price_kind,
    priceMinor: ownPrice ? row!.price_minor! : service.price_minor,
    priceMaxMinor: ownPrice ? row!.price_max_minor : service.price_max_minor,
    own: row !== undefined,
  };
}

/** The effective terms of these members for a service, read in the caller's transaction. */
export async function effectiveTermsFor(
  client: PoolClient,
  serviceId: string,
  service: ServiceTermsBase,
  staffMemberIds: string[],
): Promise<Map<string, EffectiveTerms>> {
  const rows =
    staffMemberIds.length === 0
      ? []
      : (
          await client.query<TermsRow>(
            `SELECT ${TERMS_COLUMNS} FROM booking.staff_service_terms
              WHERE service_id = $1 AND staff_member_id = ANY($2::uuid[]) AND archived_at IS NULL`,
            [serviceId, staffMemberIds],
          )
        ).rows;
  const byStaff = new Map(rows.map((r) => [r.staff_member_id, r]));
  return new Map(staffMemberIds.map((id) => [id, effective(service, byStaff.get(id))]));
}

/**
 * The duration of a booking with these terms: the one asked (within the member's bounds, steps of
 * 5) or, by default, the maximum (S123-3). null = the duration asked is outside the bounds.
 */
export function durationWithin(terms: EffectiveTerms, asked: unknown): number | null {
  if (asked === undefined) return terms.durationMax;
  if (
    typeof asked !== 'number' ||
    !Number.isInteger(asked) ||
    asked % LIMITS.durationStep !== 0 ||
    asked < terms.durationMin ||
    asked > terms.durationMax
  ) {
    return null;
  }
  return asked;
}

// ── the contracts' server side ──────────────────────────────────────────────────────────────

function requireId(id: unknown): string {
  if (!isUuid(id)) throw new ResourceNotFound();
  return id;
}

function optionalDuration(field: string, value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < LIMITS.durationMin ||
    value > LIMITS.durationMax ||
    value % LIMITS.durationStep !== 0
  ) {
    throw new InvalidInput(field, 'invalid');
  }
  return value;
}

function optionalPrice(
  value: unknown,
): { kind: PriceKind; minor: number; maxMinor: number | null } | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object') throw new InvalidInput('price', 'invalid');
  const p = value as Record<string, unknown>;
  const kind = p.kind;
  if (kind !== 'fixed' && kind !== 'from' && kind !== 'range')
    throw new InvalidInput('price.kind', 'invalid');
  const amount = (v: unknown, field: string) => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > LIMITS.priceMax) {
      throw new InvalidInput(field, 'invalid');
    }
    return v;
  };
  const minor = amount(p.minor, 'price.minor');
  if (kind === 'range') {
    const maxMinor = amount(p.maxMinor, 'price.maxMinor');
    if (maxMinor <= minor) throw new InvalidInput('price.maxMinor', 'invalid');
    return { kind, minor, maxMinor };
  }
  if (p.maxMinor !== undefined && p.maxMinor !== null)
    throw new InvalidInput('price.maxMinor', 'invalid');
  return { kind, minor, maxMinor: null };
}

async function readServiceBase(client: PoolClient, serviceId: string) {
  const { rows } = await client.query<ServiceTermsBase & { archived_at: Date | null }>(
    `SELECT duration_minutes, duration_max_minutes, price_kind, price_minor, price_max_minor,
            archived_at
       FROM booking.service WHERE id = $1`,
    [serviceId],
  );
  if (!rows[0]) throw new ResourceNotFound();
  return rows[0];
}

/** The member's own terms, by service or by member. */
export async function listStaffServiceTermsInOrg(
  ctx: TenantContext,
  filter: { serviceId?: unknown; staffMemberId?: unknown },
): Promise<StaffServiceTerms[]> {
  hubOnly(ctx);
  const serviceId = filter.serviceId === undefined ? null : requireId(filter.serviceId);
  const staffMemberId = filter.staffMemberId === undefined ? null : requireId(filter.staffMemberId);
  if (!serviceId && !staffMemberId) throw new InvalidInput('serviceId', 'required');
  return withBookingTx(
    ctx.organizationId,
    async (client) => {
      const { rows } = await client.query<TermsRow>(
        `SELECT ${TERMS_COLUMNS} FROM booking.staff_service_terms
          WHERE archived_at IS NULL
            AND ($1::uuid IS NULL OR service_id = $1) AND ($2::uuid IS NULL OR staff_member_id = $2)
          ORDER BY staff_member_id, service_id`,
        [serviceId, staffMemberId],
      );
      return rows.map(toTerms);
    },
    true,
  );
}

/**
 * Sets the member's own duration and / or price for a service (a field left null keeps the
 * service's). The member must do the service (B.2b). Nothing own left → the row is removed
 * (archived).
 */
export async function setStaffServiceTermsInOrg(
  ctx: TenantContext,
  input: {
    staffMemberId: unknown;
    serviceId: unknown;
    durationMinutes?: unknown;
    durationMaxMinutes?: unknown;
    price?: unknown;
  },
): Promise<{ terms: StaffServiceTerms | null; effective: EffectiveTerms }> {
  hubOnly(ctx);
  const staffMemberId = requireId(input.staffMemberId);
  const serviceId = requireId(input.serviceId);
  const durationMinutes = optionalDuration('durationMinutes', input.durationMinutes);
  const durationMaxMinutes = optionalDuration('durationMaxMinutes', input.durationMaxMinutes);
  const price = optionalPrice(input.price);
  return withBookingTx(ctx.organizationId, async (client, exec) => {
    const service = await readServiceBase(client, serviceId);
    if (service.archived_at) throw new Conflict('service_archived');
    const { rows: staff } = await client.query<{ archived_at: Date | null }>(
      `SELECT archived_at FROM booking.staff_member WHERE id = $1 FOR UPDATE`,
      [staffMemberId],
    );
    if (!staff[0]) throw new ResourceNotFound();
    if (staff[0].archived_at) throw new Conflict('staff_member_removed');
    if (!(await doesService(client, staffMemberId, serviceId))) {
      throw new Conflict('staff_not_for_service');
    }
    const row: TermsRow = {
      staff_member_id: staffMemberId,
      service_id: serviceId,
      duration_minutes: durationMinutes,
      duration_max_minutes: durationMaxMinutes,
      price_kind: price?.kind ?? null,
      price_minor: price?.minor ?? null,
      price_max_minor: price?.maxMinor ?? null,
      updated_at: new Date(),
    };
    // the effective bounds must stay in order (a minimum above the maximum is refused)
    const minimum = durationMinutes ?? service.duration_minutes;
    const maximum = durationMaxMinutes ?? service.duration_max_minutes ?? minimum;
    if (maximum < minimum) throw new InvalidInput('durationMaxMinutes', 'invalid');

    const { rows: current } = await client.query<{ id: string }>(
      `SELECT id FROM booking.staff_service_terms
        WHERE staff_member_id = $1 AND service_id = $2 AND archived_at IS NULL FOR UPDATE`,
      [staffMemberId, serviceId],
    );
    const nothing = durationMinutes === null && durationMaxMinutes === null && price === null;
    let saved: TermsRow | undefined;
    if (nothing) {
      if (current[0]) {
        await client.query(
          `UPDATE booking.staff_service_terms SET archived_at = now(), archived_by_user_id = $2
            WHERE id = $1`,
          [current[0].id, ctx.userId],
        );
      }
    } else if (current[0]) {
      saved = (
        await client.query<TermsRow>(
          `UPDATE booking.staff_service_terms
              SET duration_minutes = $2, duration_max_minutes = $3, price_kind = $4,
                  price_minor = $5, price_max_minor = $6
            WHERE id = $1 RETURNING ${TERMS_COLUMNS}`,
          [
            current[0].id,
            durationMinutes,
            durationMaxMinutes,
            row.price_kind,
            row.price_minor,
            row.price_max_minor,
          ],
        )
      ).rows[0];
    } else {
      saved = (
        await client.query<TermsRow>(
          `INSERT INTO booking.staff_service_terms
             (id, organization_id, staff_member_id, service_id, duration_minutes,
              duration_max_minutes, price_kind, price_minor, price_max_minor, created_by_user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING ${TERMS_COLUMNS}`,
          [
            uuidv7(),
            ctx.organizationId,
            staffMemberId,
            serviceId,
            durationMinutes,
            durationMaxMinutes,
            row.price_kind,
            row.price_minor,
            row.price_max_minor,
            ctx.userId,
          ],
        )
      ).rows[0];
    }
    await appendAuditEventInTx(exec, {
      category: 'booking',
      action: AuditActions.bookingStaffUpdated,
      outcome: 'success',
      actorType: 'user',
      actorId: ctx.userId,
      organizationId: ctx.organizationId,
      targetType: 'booking_staff_member',
      targetId: staffMemberId,
      metadata: {
        serviceId,
        terms: nothing
          ? 'service'
          : { durationMinutes, durationMaxMinutes, price: price ? { ...price } : null },
      },
    });
    return {
      terms: saved ? toTerms(saved) : null,
      effective: effective(service, saved),
    };
  });
}
