import type { PoolClient } from 'pg';
import { AuditActions, appendAuditEventInTx, type AuditSqlExecutor } from '@ventora/audit';
import type { TenantContext } from '@ventora/access';
import { uuidv7 } from '@ventora/db-kit';
import { Conflict, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { withBookingTx } from './db';
import { isUuid } from './validation';

/*
 * Lot B.2b — who does each service (BOOKING.md §3 B.2b, D-B5-6 = a; design S129: BookingServices
 * „Cine îl face”, BookingTeamSchedule „Servicii”). A member M does a service S when S.all_staff
 * („Toată echipa”, including members who join later), or M.all_services („Toate serviciile”,
 * including services added later), or an active staff_service row (ticked one by one).
 *
 * Both sides edit the same link. Unticking one pair inside a flag turns the flag into explicit rows
 * for everything else (so nothing else changes): unticking Ioana from „Tuns” while she has „Toate
 * serviciile” leaves her every other service ticked one by one; unticking „Tuns” while it has „Toată
 * echipa” leaves every other member ticked on it. When a member stops doing a service, their future
 * appointments for it stay (S129): the answer lists them, for the warning and the link.
 */

export type DoneBy = {
  /** „Toată echipa”: every member in the calendar, including those who join later. */
  allStaff: boolean;
  /** The members in the calendar who do it now (the flags included), in the team's order. */
  staffMemberIds: string[];
};

export type MemberServices = {
  /** „Toate serviciile”: every service, including those added later. */
  allServices: boolean;
  /** The active services the member does now (the flags included). */
  serviceIds: string[];
  /** All active services of the business („6 din 14”). */
  activeTotal: number;
};

/** A pair (member, service) that stopped, with its future appointments (kept, S129). */
export type StoppedPair = {
  staffMemberId: string;
  serviceId: string;
  upcomingAppointments: number;
};

const OCCUPYING = ['awaiting_payment', 'unconfirmed', 'confirmed', 'in_progress'];

/** The SQL condition „member m does service s” (aliases m, s). */
export const DOES_SERVICE = `(s.all_staff OR m.all_services OR EXISTS (
  SELECT 1 FROM booking.staff_service l
   WHERE l.staff_member_id = m.id AND l.service_id = s.id AND l.archived_at IS NULL))`;

function requireIds(field: string, value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 500 ||
    !value.every(isUuid) ||
    new Set(value.map((v) => v.toLowerCase())).size !== value.length
  ) {
    throw new InvalidInput(field);
  }
  return value.map((v) => v.toLowerCase());
}

function audit(
  exec: AuditSqlExecutor,
  ctx: TenantContext,
  action: string,
  targetType: 'booking_service' | 'booking_staff_member',
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

// ── reading ─────────────────────────────────────────────────────────────────────────────────

/** The members in the calendar who do the service now, in the team's order. */
export async function staffForService(client: PoolClient, serviceId: string): Promise<string[]> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT m.id FROM booking.staff_member m, booking.service s
      WHERE s.id = $1 AND m.archived_at IS NULL AND ${DOES_SERVICE}
      ORDER BY m.sort_order, m.display_name, m.id`,
    [serviceId],
  );
  return rows.map((r) => r.id);
}

/** Does this member do this service now? */
export async function doesService(
  client: PoolClient,
  staffMemberId: string,
  serviceId: string,
): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT 1 FROM booking.staff_member m, booking.service s
      WHERE m.id = $1 AND s.id = $2 AND ${DOES_SERVICE}`,
    [staffMemberId, serviceId],
  );
  return rows.length > 0;
}

/** „Cine îl face” for these services (BookingServices list and form). */
export async function doneByOf(
  client: PoolClient,
  serviceIds: string[],
): Promise<Map<string, DoneBy>> {
  const out = new Map<string, DoneBy>();
  if (serviceIds.length === 0) return out;
  const { rows: flags } = await client.query<{ id: string; all_staff: boolean }>(
    `SELECT id, all_staff FROM booking.service WHERE id = ANY($1::uuid[])`,
    [serviceIds],
  );
  for (const f of flags) out.set(f.id, { allStaff: f.all_staff, staffMemberIds: [] });
  const { rows } = await client.query<{ service_id: string; staff_member_id: string }>(
    `SELECT s.id AS service_id, m.id AS staff_member_id
       FROM booking.service s, booking.staff_member m
      WHERE s.id = ANY($1::uuid[]) AND m.archived_at IS NULL AND ${DOES_SERVICE}
      ORDER BY m.sort_order, m.display_name, m.id`,
    [serviceIds],
  );
  for (const r of rows) out.get(r.service_id)?.staffMemberIds.push(r.staff_member_id);
  return out;
}

/** „Servicii” for these members (BookingTeamSchedule list and drawer). */
export async function servicesOfMembers(
  client: PoolClient,
  staffMemberIds: string[],
): Promise<Map<string, MemberServices>> {
  const out = new Map<string, MemberServices>();
  if (staffMemberIds.length === 0) return out;
  const total = Number(
    (
      await client.query<{ n: string }>(
        `SELECT count(*) AS n FROM booking.service WHERE archived_at IS NULL`,
      )
    ).rows[0]!.n,
  );
  const { rows: flags } = await client.query<{ id: string; all_services: boolean }>(
    `SELECT id, all_services FROM booking.staff_member WHERE id = ANY($1::uuid[])`,
    [staffMemberIds],
  );
  for (const f of flags) {
    out.set(f.id, { allServices: f.all_services, serviceIds: [], activeTotal: total });
  }
  const { rows } = await client.query<{ staff_member_id: string; service_id: string }>(
    `SELECT m.id AS staff_member_id, s.id AS service_id
       FROM booking.staff_member m, booking.service s
       LEFT JOIN booking.service_category c ON c.id = s.category_id
      WHERE m.id = ANY($1::uuid[]) AND s.archived_at IS NULL AND ${DOES_SERVICE}
      ORDER BY c.sort_order NULLS LAST, c.name NULLS LAST, s.sort_order, s.name, s.id`,
    [staffMemberIds],
  );
  for (const r of rows) out.get(r.staff_member_id)?.serviceIds.push(r.service_id);
  return out;
}

// ── writing (inside the caller's transaction) ───────────────────────────────────────────────

async function link(client: PoolClient, ctx: TenantContext, staffId: string, serviceId: string) {
  await client.query(
    `INSERT INTO booking.staff_service (id, organization_id, staff_member_id, service_id,
                                        created_by_user_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (staff_member_id, (service_id::text)) WHERE archived_at IS NULL DO NOTHING`,
    [uuidv7(), ctx.organizationId, staffId, serviceId, ctx.userId],
  );
}

async function unlink(client: PoolClient, ctx: TenantContext, staffId: string, serviceId: string) {
  await client.query(
    `UPDATE booking.staff_service SET archived_at = now(), archived_by_user_id = $3
      WHERE staff_member_id = $1 AND service_id = $2 AND archived_at IS NULL`,
    [staffId, serviceId, ctx.userId],
  );
}

/** Every pair (member, service) that holds now, for the active members and services. */
async function pairs(client: PoolClient): Promise<Set<string>> {
  const { rows } = await client.query<{ m: string; s: string }>(
    `SELECT m.id AS m, s.id AS s FROM booking.staff_member m, booking.service s
      WHERE m.archived_at IS NULL AND s.archived_at IS NULL AND ${DOES_SERVICE}`,
  );
  return new Set(rows.map((r) => `${r.m}|${r.s}`));
}

/** The future appointments of the pairs that stopped (S129: kept, with the warning and the link). */
async function stoppedPairs(
  client: PoolClient,
  before: Set<string>,
  after: Set<string>,
): Promise<StoppedPair[]> {
  const gone = [...before].filter((p) => !after.has(p));
  const out: StoppedPair[] = [];
  for (const p of gone) {
    const [staffMemberId, serviceId] = p.split('|') as [string, string];
    const n = Number(
      (
        await client.query<{ n: string }>(
          `SELECT count(*) AS n FROM booking.appointment
            WHERE staff_member_id = $1 AND service_id = $2 AND status = ANY($3::text[])
              AND starts_at >= now()`,
          [staffMemberId, serviceId, OCCUPYING],
        )
      ).rows[0]!.n,
    );
    out.push({ staffMemberId, serviceId, upcomingAppointments: n });
  }
  return out;
}

async function lockActiveStaff(client: PoolClient, ids: string[]) {
  if (ids.length === 0) return;
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM booking.staff_member WHERE id = ANY($1::uuid[]) AND archived_at IS NULL`,
    [ids],
  );
  if (rows.length !== ids.length) throw new InvalidInput('staffMemberIds');
}

async function lockActiveServices(client: PoolClient, ids: string[]) {
  if (ids.length === 0) return;
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM booking.service WHERE id = ANY($1::uuid[]) AND archived_at IS NULL`,
    [ids],
  );
  if (rows.length !== ids.length) throw new InvalidInput('serviceIds');
}

/**
 * „Cine îl face” for one service, in the caller's transaction: „Toată echipa”, or the members ticked
 * one by one (none is allowed: the service then can't be booked, S129).
 */
export async function setServiceStaffInTx(
  client: PoolClient,
  exec: AuditSqlExecutor,
  ctx: TenantContext,
  serviceId: string,
  input: { allStaff?: unknown; staffMemberIds?: unknown },
): Promise<StoppedPair[]> {
  if (typeof input.allStaff !== 'boolean') throw new InvalidInput('allStaff');
  const wanted = input.allStaff ? [] : requireIds('staffMemberIds', input.staffMemberIds ?? []);
  // the whole team locked: two edits of the same links wait for each other
  await client.query(`SELECT id FROM booking.staff_member WHERE archived_at IS NULL FOR UPDATE`);
  const { rows: found } = await client.query<{ all_staff: boolean; archived_at: Date | null }>(
    `SELECT all_staff, archived_at FROM booking.service WHERE id = $1 FOR UPDATE`,
    [serviceId],
  );
  if (!found[0]) throw new ResourceNotFound();
  if (found[0].archived_at) throw new Conflict('service_archived');
  await lockActiveStaff(client, wanted);
  const before = await pairs(client);

  if (input.allStaff) {
    await client.query(`UPDATE booking.service SET all_staff = true WHERE id = $1`, [serviceId]);
  } else {
    await client.query(`UPDATE booking.service SET all_staff = false WHERE id = $1`, [serviceId]);
    const want = new Set(wanted);
    const { rows: members } = await client.query<{ id: string; all_services: boolean }>(
      `SELECT id, all_services FROM booking.staff_member WHERE archived_at IS NULL`,
    );
    for (const m of members) {
      if (m.all_services && !want.has(m.id)) {
        // „Toate serviciile” without this one: every other service ticked one by one
        await client.query(`UPDATE booking.staff_member SET all_services = false WHERE id = $1`, [
          m.id,
        ]);
        const { rows: others } = await client.query<{ id: string }>(
          `SELECT id FROM booking.service
            WHERE archived_at IS NULL AND id <> $1 AND NOT all_staff`,
          [serviceId],
        );
        for (const s of others) await link(client, ctx, m.id, s.id);
      }
      if (want.has(m.id)) await link(client, ctx, m.id, serviceId);
      else await unlink(client, ctx, m.id, serviceId);
    }
  }
  const after = await pairs(client);
  const stopped = await stoppedPairs(client, before, after);
  await audit(exec, ctx, AuditActions.bookingServiceUpdated, 'booking_service', serviceId, {
    doneBy: input.allStaff ? 'all' : wanted,
    ...(stopped.length ? { stoppedStaffMemberIds: stopped.map((p) => p.staffMemberId) } : {}),
  });
  return stopped;
}

/**
 * „Servicii” for one member, in the caller's transaction: „Toate serviciile”, or the services ticked
 * one by one (none is allowed, e.g. the reception, S129).
 */
export async function setStaffServicesInTx(
  client: PoolClient,
  exec: AuditSqlExecutor,
  ctx: TenantContext,
  staffMemberId: string,
  input: { allServices?: unknown; serviceIds?: unknown },
): Promise<StoppedPair[]> {
  if (typeof input.allServices !== 'boolean') throw new InvalidInput('allServices');
  const wanted = input.allServices ? [] : requireIds('serviceIds', input.serviceIds ?? []);
  await client.query(`SELECT id FROM booking.staff_member WHERE archived_at IS NULL FOR UPDATE`);
  const { rows: found } = await client.query<{ archived_at: Date | null }>(
    `SELECT archived_at FROM booking.staff_member WHERE id = $1`,
    [staffMemberId],
  );
  if (!found[0]) throw new ResourceNotFound();
  if (found[0].archived_at) throw new Conflict('staff_member_removed');
  await lockActiveServices(client, wanted);
  const before = await pairs(client);

  if (input.allServices) {
    await client.query(`UPDATE booking.staff_member SET all_services = true WHERE id = $1`, [
      staffMemberId,
    ]);
  } else {
    await client.query(`UPDATE booking.staff_member SET all_services = false WHERE id = $1`, [
      staffMemberId,
    ]);
    const want = new Set(wanted);
    const { rows: services } = await client.query<{ id: string; all_staff: boolean }>(
      `SELECT id, all_staff FROM booking.service WHERE archived_at IS NULL FOR UPDATE`,
    );
    for (const s of services) {
      if (s.all_staff && !want.has(s.id)) {
        // „Toată echipa” without this member: every other member ticked one by one
        await client.query(`UPDATE booking.service SET all_staff = false WHERE id = $1`, [s.id]);
        const { rows: others } = await client.query<{ id: string }>(
          `SELECT id FROM booking.staff_member
            WHERE archived_at IS NULL AND id <> $1 AND NOT all_services`,
          [staffMemberId],
        );
        for (const m of others) await link(client, ctx, m.id, s.id);
      }
      if (want.has(s.id)) await link(client, ctx, staffMemberId, s.id);
      else await unlink(client, ctx, staffMemberId, s.id);
    }
  }
  const after = await pairs(client);
  const stopped = await stoppedPairs(client, before, after);
  await audit(exec, ctx, AuditActions.bookingStaffUpdated, 'booking_staff_member', staffMemberId, {
    services: input.allServices ? 'all' : wanted,
    ...(stopped.length ? { stoppedServiceIds: stopped.map((p) => p.serviceId) } : {}),
  });
  return stopped;
}

/**
 * S129: a new service starts with the members who already do services in its category („Am bifat
 * cine face deja servicii din „Păr”.”); „Fără categorie” pre-ticks nobody. Members with „Toate
 * serviciile” do it anyway.
 */
export async function defaultStaffForNewService(
  client: PoolClient,
  categoryId: string | null,
): Promise<string[]> {
  if (categoryId === null) return [];
  const { rows } = await client.query<{ id: string }>(
    `SELECT DISTINCT m.id, m.sort_order, m.display_name
       FROM booking.staff_member m
       JOIN booking.staff_service l ON l.staff_member_id = m.id AND l.archived_at IS NULL
       JOIN booking.service s ON s.id = l.service_id AND s.archived_at IS NULL
      WHERE m.archived_at IS NULL AND NOT m.all_services AND s.category_id = $1
      ORDER BY m.sort_order, m.display_name, m.id`,
    [categoryId],
  );
  return rows.map((r) => r.id);
}

/** A new service without „Cine îl face” in the form: all_staff off, the S129 default ticked. */
export async function addDefaultStaffInTx(
  client: PoolClient,
  ctx: TenantContext,
  serviceId: string,
  categoryId: string | null,
): Promise<void> {
  await client.query(`UPDATE booking.service SET all_staff = false WHERE id = $1`, [serviceId]);
  for (const staffId of await defaultStaffForNewService(client, categoryId)) {
    await link(client, ctx, staffId, serviceId);
  }
}

// ── the contracts' server side ──────────────────────────────────────────────────────────────

export async function setServiceStaffInOrg(
  ctx: TenantContext,
  serviceId: unknown,
  input: { allStaff?: unknown; staffMemberIds?: unknown },
): Promise<{ doneBy: DoneBy; stopped: StoppedPair[] }> {
  if (!isUuid(serviceId)) throw new ResourceNotFound();
  return withBookingTx(ctx.organizationId, async (client, exec) => {
    const stopped = await setServiceStaffInTx(client, exec, ctx, serviceId, input);
    return { doneBy: (await doneByOf(client, [serviceId])).get(serviceId)!, stopped };
  });
}

export async function setStaffServicesInOrg(
  ctx: TenantContext,
  staffMemberId: unknown,
  input: { allServices?: unknown; serviceIds?: unknown },
): Promise<{ services: MemberServices; stopped: StoppedPair[] }> {
  if (!isUuid(staffMemberId)) throw new ResourceNotFound();
  return withBookingTx(ctx.organizationId, async (client, exec) => {
    const stopped = await setStaffServicesInTx(client, exec, ctx, staffMemberId, input);
    return {
      services: (await servicesOfMembers(client, [staffMemberId])).get(staffMemberId)!,
      stopped,
    };
  });
}
