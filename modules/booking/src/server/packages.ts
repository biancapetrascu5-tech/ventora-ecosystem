import type { PoolClient } from 'pg';
import { AuditActions, appendAuditEventInTx, type AuditSqlExecutor } from '@ventora/audit';
import type { TenantContext } from '@ventora/access';
import { uuidv7 } from '@ventora/db-kit';
import { Conflict, Forbidden, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { getOrganizationTimeZone } from '@ventora/organizations';
import { hubOnly } from './actor';
import {
  audit,
  normalizeOptionalText,
  readAppointment,
  requireScope,
  translate,
  type AppointmentScope,
  type PgError,
} from './appointments';
import { withBookingTx } from './db';
import { requireLocalDate } from './schedule';
import { isUuid, normalizeName } from './validation';

/*
 * Lot B.9e — the packages of sessions (design BookingPackages, S126; plan
 * reports/2026-11-12_plan-booking-b9.md). Only the backend; the screens are a separate lot.
 *
 *   - the definition (Setări · Servicii · „Pachete de ședințe”, booking:settings): the service, the
 *     number of sessions, the validity (1, 3, 6, 12 months or „Fără limită”), the price, with
 *     „în loc de …” (the service's fixed price × the sessions) and how many were sold;
 *   - „Vinde un pachet…” on the client card (booking:write): copied from the definition, valid
 *     from / until (local dates in the business time zone), how the client paid at the salon. D-9e-3:
 *     the payment link is later (Conflict('payment_link_not_available')). D-9e-4 (the accounting,
 *     NECESITĂ DECIZIE): no fiscal document, no event for Finance yet;
 *   - „Pachete” on the client card: Activ / Expirat / Folosit, „4 din 10 ședințe rămase”, valid
 *     until, the dates used;
 *   - „Plata: Din pachet” on a booking: one session reserved on the appointment (package_use). The
 *     database holds the rules (package_use_guard: the same service, the sale's client, a session
 *     left; appointment_package_settle, D-9e-1: used when the appointment is done, a no-show or
 *     cancelled late, given back by an on-time cancellation). The validity is checked here, in the
 *     business time zone, against the appointment's local date;
 *   - D-9e-2: the expired sessions are lost; the owner extends a sale by hand, with a reason.
 *
 * Audit (PROPUS, no new code): the definitions as booking.service_updated on the service
 * (metadata.package), the sales and the extensions as booking.client_updated on the client
 * (metadata.package), „Din pachet” as booking.appointment_updated (metadata.package). Only ids and
 * amounts, never the note or the reason.
 */

export type PackageValidityMonths = 1 | 3 | 6 | 12;
export type PackagePaymentMethod = 'cash' | 'card' | 'transfer' | 'other';

export type BookingPackage = {
  id: string;
  serviceId: string;
  serviceName: string;
  name: string;
  sessions: number;
  /** null = „Fără limită”. */
  validityMonths: PackageValidityMonths | null;
  priceMinor: number;
  currency: 'RON' | 'EUR';
  /** „în loc de …”: the service's fixed price × the sessions; null for „de la” / interval. */
  regularPriceMinor: number | null;
  /** How much the client saves; null when there is no regular price. */
  savingMinor: number | null;
  sold: number;
  archived: boolean;
};

export type PackageSaleStatus = 'active' | 'expired' | 'used_up';

export type PackageUseItem = {
  appointmentId: string;
  startsAt: Date;
  state: 'reserved' | 'used';
};

export type PackageSale = {
  id: string;
  packageId: string;
  clientId: string;
  serviceId: string;
  name: string;
  sessions: number;
  used: number;
  reserved: number;
  /** „4 din 10 ședințe rămase”: sessions − used − reserved. */
  remaining: number;
  priceMinor: number;
  currency: 'RON' | 'EUR';
  method: PackagePaymentMethod;
  validFrom: string;
  validUntil: string | null;
  status: PackageSaleStatus;
  extended: { at: Date; reason: string } | null;
  note: string | null;
  soldAt: Date;
  uses: PackageUseItem[];
};

export const PACKAGE_LIMITS = {
  name: 80,
  sessionsMin: 2,
  sessionsMax: 100,
  priceMax: 10_000_000,
  note: 500,
  reason: 300,
  /** „Valabil de la”: at most this many days before or after today. */
  validFromPastDays: 30,
  validFromFutureDays: 365,
} as const;

const VALIDITIES: readonly number[] = [1, 3, 6, 12];
const METHODS: readonly PackagePaymentMethod[] = ['cash', 'card', 'transfer', 'other'];

function requireId(id: unknown): string {
  if (!isUuid(id)) throw new ResourceNotFound();
  return id;
}

function requireSessions(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < PACKAGE_LIMITS.sessionsMin ||
    value > PACKAGE_LIMITS.sessionsMax
  ) {
    throw new InvalidInput('sessions', 'invalid');
  }
  return value;
}

function requireValidity(value: unknown): PackageValidityMonths | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !VALIDITIES.includes(value)) {
    throw new InvalidInput('validityMonths', 'invalid');
  }
  return value as PackageValidityMonths;
}

function requirePrice(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > PACKAGE_LIMITS.priceMax
  ) {
    throw new InvalidInput('priceMinor', 'invalid');
  }
  return value;
}

function requireMethod(value: unknown): PackagePaymentMethod {
  // D-9e-3: the payment link (Stripe) comes later; in the pilot the client pays at the salon
  if (value === 'link') throw new Conflict('payment_link_not_available');
  if (typeof value !== 'string' || !(METHODS as readonly string[]).includes(value)) {
    throw new InvalidInput('method', 'invalid');
  }
  return value as PackagePaymentMethod;
}

/** One open use per appointment; the other package rules are in translate (appointments). */
function translatePackage(err: unknown): never {
  const e = err as PgError;
  if (e?.code === '23505' && e.constraint === 'package_use_open_appointment_key') {
    throw new Conflict('package_already_on_appointment');
  }
  translate(err);
}

async function ptx<T>(
  ctx: TenantContext,
  fn: (client: PoolClient, exec: AuditSqlExecutor) => Promise<T>,
  readOnly = false,
): Promise<T> {
  try {
    return await withBookingTx(ctx.organizationId, fn, readOnly);
  } catch (err) {
    translatePackage(err);
  }
}

// ── the definitions ────────────────────────────────────────────────────────────────────────

type PackageRow = {
  id: string;
  service_id: string;
  service_name: string;
  name: string;
  sessions: number;
  validity_months: number | null;
  price_minor: number;
  currency: string;
  service_price_kind: 'fixed' | 'from' | 'range';
  service_price_minor: number;
  sold: string;
  archived_at: Date | null;
};

const PACKAGE_SELECT = `
  SELECT p.id, p.service_id, s.name AS service_name, p.name, p.sessions, p.validity_months,
         p.price_minor, p.currency, s.price_kind AS service_price_kind,
         s.price_minor AS service_price_minor, p.archived_at,
         (SELECT count(*) FROM booking.package_sale x WHERE x.package_id = p.id) AS sold
    FROM booking.package p JOIN booking.service s ON s.id = p.service_id`;

function toPackage(r: PackageRow): BookingPackage {
  const regular = r.service_price_kind === 'fixed' ? r.service_price_minor * r.sessions : null;
  return {
    id: r.id,
    serviceId: r.service_id,
    serviceName: r.service_name,
    name: r.name,
    sessions: r.sessions,
    validityMonths: r.validity_months as PackageValidityMonths | null,
    priceMinor: r.price_minor,
    currency: r.currency.trim() as 'RON' | 'EUR',
    regularPriceMinor: regular,
    savingMinor: regular === null ? null : Math.max(0, regular - r.price_minor),
    sold: Number(r.sold),
    archived: r.archived_at !== null,
  };
}

async function readPackage(client: PoolClient, id: string, lock = false): Promise<PackageRow> {
  const { rows } = await client.query<PackageRow>(
    `${PACKAGE_SELECT} WHERE p.id = $1${lock ? ' FOR UPDATE OF p' : ''}`,
    [id],
  );
  if (!rows[0]) throw new ResourceNotFound();
  return rows[0];
}

function auditPackage(
  exec: AuditSqlExecutor,
  ctx: TenantContext,
  serviceId: string,
  metadata: Record<string, unknown>,
) {
  return appendAuditEventInTx(exec, {
    category: 'booking',
    action: AuditActions.bookingServiceUpdated,
    outcome: 'success',
    actorType: 'user',
    actorId: ctx.userId,
    organizationId: ctx.organizationId,
    targetType: 'booking_service',
    targetId: serviceId,
    metadata: { package: metadata },
  });
}

export type PackageInput = {
  serviceId?: unknown;
  name?: unknown;
  sessions?: unknown;
  validityMonths?: unknown;
  priceMinor?: unknown;
};

/** „Pachet nou”: an active service of the business; the currency is the service's. */
export async function createPackageInOrg(
  ctx: TenantContext,
  input: PackageInput,
): Promise<BookingPackage> {
  hubOnly(ctx);
  const serviceId = requireId(input.serviceId);
  const name = normalizeName('name', input.name, PACKAGE_LIMITS.name);
  const sessions = requireSessions(input.sessions);
  const validity = requireValidity(input.validityMonths ?? null);
  const price = requirePrice(input.priceMinor);
  return ptx(ctx, async (client, exec) => {
    const service = (
      await client.query<{ currency: string; archived_at: Date | null }>(
        `SELECT currency, archived_at FROM booking.service WHERE id = $1`,
        [serviceId],
      )
    ).rows[0];
    if (!service) throw new ResourceNotFound();
    if (service.archived_at) throw new Conflict('service_archived');
    const id = uuidv7();
    await client.query(
      `INSERT INTO booking.package
         (id, organization_id, service_id, name, sessions, validity_months, price_minor, currency,
          created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        ctx.organizationId,
        serviceId,
        name,
        sessions,
        validity,
        price,
        service.currency.trim(),
        ctx.userId,
      ],
    );
    await auditPackage(exec, ctx, serviceId, { id, kind: 'created', sessions, priceMinor: price });
    return toPackage(await readPackage(client, id));
  });
}

/** The name, the validity and the price; what was already sold does not change (copied). */
export async function updatePackageInOrg(
  ctx: TenantContext,
  packageIdRaw: unknown,
  input: Omit<PackageInput, 'serviceId' | 'sessions'>,
): Promise<BookingPackage> {
  hubOnly(ctx);
  const id = requireId(packageIdRaw);
  const name =
    input.name === undefined ? undefined : normalizeName('name', input.name, PACKAGE_LIMITS.name);
  const validity =
    input.validityMonths === undefined ? undefined : requireValidity(input.validityMonths);
  const price = input.priceMinor === undefined ? undefined : requirePrice(input.priceMinor);
  return ptx(ctx, async (client, exec) => {
    const current = await readPackage(client, id, true);
    if (current.archived_at) throw new Conflict('package_archived');
    await client.query(
      `UPDATE booking.package
          SET name = $2, validity_months = $3, price_minor = $4, updated_at = now()
        WHERE id = $1`,
      [
        id,
        name ?? current.name,
        validity === undefined ? current.validity_months : validity,
        price ?? current.price_minor,
      ],
    );
    await auditPackage(exec, ctx, current.service_id, { id, kind: 'updated' });
    return toPackage(await readPackage(client, id));
  });
}

/** Archived: no longer sold; the sales already made keep their sessions. */
export async function archivePackageInOrg(
  ctx: TenantContext,
  packageIdRaw: unknown,
): Promise<BookingPackage> {
  hubOnly(ctx);
  const id = requireId(packageIdRaw);
  return ptx(ctx, async (client, exec) => {
    const current = await readPackage(client, id, true);
    if (current.archived_at) return toPackage(current);
    await client.query(
      `UPDATE booking.package
          SET archived_at = now(), archived_by_user_id = $2, updated_at = now()
        WHERE id = $1`,
      [id, ctx.userId],
    );
    await auditPackage(exec, ctx, current.service_id, { id, kind: 'archived' });
    return toPackage(await readPackage(client, id));
  });
}

/** „Pachete de ședințe”: the list (package, validity, price with „în loc de …”, sold). */
export async function listPackagesInOrg(
  ctx: TenantContext,
  query: { serviceId?: unknown; includeArchived?: unknown } = {},
): Promise<BookingPackage[]> {
  hubOnly(ctx);
  const serviceId = query.serviceId === undefined ? null : requireId(query.serviceId);
  const all = query.includeArchived === true;
  return ptx(
    ctx,
    async (client) =>
      (
        await client.query<PackageRow>(
          `${PACKAGE_SELECT}
            WHERE ($1::uuid IS NULL OR p.service_id = $1) AND ($2 OR p.archived_at IS NULL)
            ORDER BY p.archived_at NULLS FIRST, s.name, p.sessions, p.id`,
          [serviceId, all],
        )
      ).rows.map(toPackage),
    true,
  );
}

// ── the sales ──────────────────────────────────────────────────────────────────────────────

type SaleRow = {
  id: string;
  package_id: string;
  client_id: string;
  service_id: string;
  package_name: string;
  sessions: number;
  price_minor: number;
  currency: string;
  method: PackagePaymentMethod;
  valid_from: string;
  valid_until: string | null;
  note: string | null;
  extended_at: Date | null;
  extension_reason: string | null;
  sold_at: Date;
  today: string;
  uses: Array<{ appointment_id: string; starts_at: string; state: 'reserved' | 'used' }> | null;
};

// the dates as text (local dates, no time zone shift); today in the business time zone ($1)
const SALE_SELECT = `
  SELECT s.id, s.package_id, s.client_id, s.service_id, s.package_name, s.sessions, s.price_minor,
         s.currency, s.method, s.valid_from::text AS valid_from, s.valid_until::text AS valid_until,
         s.note, s.extended_at, s.extension_reason, s.sold_at,
         (now() AT TIME ZONE $1)::date::text AS today,
         (SELECT json_agg(json_build_object('appointment_id', u.appointment_id,
                                            'starts_at', a.starts_at, 'state', u.state)
                          ORDER BY a.starts_at)
            FROM booking.package_use u JOIN booking.appointment a ON a.id = u.appointment_id
           WHERE u.sale_id = s.id AND u.state <> 'returned') AS uses
    FROM booking.package_sale s`;

function toSale(r: SaleRow): PackageSale {
  const uses = (r.uses ?? []).map((u) => ({
    appointmentId: u.appointment_id,
    startsAt: new Date(u.starts_at),
    state: u.state,
  }));
  const used = uses.filter((u) => u.state === 'used').length;
  const reserved = uses.length - used;
  const remaining = Math.max(0, r.sessions - used - reserved);
  const status: PackageSaleStatus =
    remaining === 0 && reserved === 0
      ? 'used_up'
      : r.valid_until !== null && r.valid_until < r.today
        ? 'expired'
        : 'active';
  return {
    id: r.id,
    packageId: r.package_id,
    clientId: r.client_id,
    serviceId: r.service_id,
    name: r.package_name,
    sessions: r.sessions,
    used,
    reserved,
    remaining,
    priceMinor: r.price_minor,
    currency: r.currency.trim() as 'RON' | 'EUR',
    method: r.method,
    validFrom: r.valid_from,
    validUntil: r.valid_until,
    status,
    extended:
      r.extended_at && r.extension_reason
        ? { at: r.extended_at, reason: r.extension_reason }
        : null,
    note: r.note,
    soldAt: r.sold_at,
    uses,
  };
}

async function readSale(
  client: PoolClient,
  timeZone: string,
  id: string,
  lock = false,
): Promise<SaleRow> {
  const { rows } = await client.query<SaleRow>(
    `${SALE_SELECT} WHERE s.id = $2${lock ? ' FOR UPDATE OF s' : ''}`,
    [timeZone, id],
  );
  if (!rows[0]) throw new ResourceNotFound();
  return rows[0];
}

export type SellPackageInput = {
  /** A UUID chosen by the caller: a retry with the same id returns the same sale. */
  id: unknown;
  clientId: unknown;
  packageId: unknown;
  /** „Valabil de la”: a local date (YYYY-MM-DD); today by default. */
  validFrom?: unknown;
  method: unknown;
  note?: unknown;
};

/** „Vinde un pachet…”: the client pays at the salon; valid until = from + months − 1 day. */
export async function sellPackageInOrg(
  ctx: TenantContext,
  input: SellPackageInput,
): Promise<PackageSale> {
  hubOnly(ctx);
  if (!isUuid(input.id)) throw new InvalidInput('id', 'invalid');
  const id = input.id;
  const clientId = requireId(input.clientId);
  const packageId = requireId(input.packageId);
  const validFromRaw =
    input.validFrom === undefined ? null : requireLocalDate('validFrom', input.validFrom);
  const method = requireMethod(input.method);
  const note = normalizeOptionalText('note', input.note, PACKAGE_LIMITS.note);
  const timeZone = await getOrganizationTimeZone(ctx);
  return ptx(ctx, async (client, exec) => {
    const again = (
      await client.query<{ client_id: string; package_id: string }>(
        `SELECT client_id, package_id FROM booking.package_sale WHERE id = $1`,
        [id],
      )
    ).rows[0];
    if (again) {
      if (again.client_id !== clientId || again.package_id !== packageId) {
        throw new Conflict('operation_reused');
      }
      return toSale(await readSale(client, timeZone, id));
    }
    const pkg = await readPackage(client, packageId, true);
    if (pkg.archived_at) throw new Conflict('package_archived');
    const found = (
      await client.query<{ archived_at: Date | null; merged_into_client_id: string | null }>(
        `SELECT archived_at, merged_into_client_id FROM booking.client WHERE id = $1`,
        [clientId],
      )
    ).rows[0];
    if (!found) throw new ResourceNotFound();
    if (found.archived_at || found.merged_into_client_id) throw new Conflict('client_archived');
    const dates = (
      await client.query<{ from: string; until: string | null; ok: boolean }>(
        `SELECT d.f::text AS from,
                CASE WHEN $3::int IS NULL THEN NULL
                     ELSE ((d.f + make_interval(months => $3::int))::date - 1)::text END AS until,
                d.f BETWEEN d.today - $4::int AND d.today + $5::int AS ok
           FROM (SELECT COALESCE($2::date, (now() AT TIME ZONE $1)::date) AS f,
                        (now() AT TIME ZONE $1)::date AS today) d`,
        [
          timeZone,
          validFromRaw,
          pkg.validity_months,
          PACKAGE_LIMITS.validFromPastDays,
          PACKAGE_LIMITS.validFromFutureDays,
        ],
      )
    ).rows[0]!;
    if (!dates.ok) throw new InvalidInput('validFrom', 'invalid');
    await client.query(
      `INSERT INTO booking.package_sale
         (id, organization_id, package_id, client_id, service_id, package_name, sessions,
          price_minor, currency, method, valid_from, valid_until, note, sold_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        id,
        ctx.organizationId,
        packageId,
        clientId,
        pkg.service_id,
        pkg.name,
        pkg.sessions,
        pkg.price_minor,
        pkg.currency.trim(),
        method,
        dates.from,
        dates.until,
        note,
        ctx.userId,
      ],
    );
    await audit(exec, ctx, AuditActions.bookingClientUpdated, 'booking_client', clientId, {
      package: {
        kind: 'sold',
        saleId: id,
        packageId,
        priceMinor: pkg.price_minor,
        currency: pkg.currency.trim(),
        method,
      },
    });
    return toSale(await readSale(client, timeZone, id));
  });
}

/**
 * D-9e-2: the owner extends a sale by hand, with a reason (kept on the sale, not in the audit). Only
 * a later date; a sale „Fără limită” has nothing to extend.
 */
export async function extendPackageSaleInOrg(
  ctx: TenantContext,
  input: { saleId: unknown; validUntil: unknown; reason: unknown },
): Promise<PackageSale> {
  hubOnly(ctx);
  if (ctx.role !== 'owner') throw new Forbidden();
  const saleId = requireId(input.saleId);
  const validUntil = requireLocalDate('validUntil', input.validUntil);
  const reason = normalizeOptionalText('reason', input.reason, PACKAGE_LIMITS.reason);
  if (!reason) throw new InvalidInput('reason', 'required');
  const timeZone = await getOrganizationTimeZone(ctx);
  return ptx(ctx, async (client, exec) => {
    const sale = await readSale(client, timeZone, saleId, true);
    if (sale.valid_until === null) throw new Conflict('package_no_limit');
    if (validUntil <= sale.valid_until) throw new InvalidInput('validUntil', 'invalid');
    await client.query(
      `UPDATE booking.package_sale
          SET valid_until = $2, extended_at = now(), extended_by_user_id = $3,
              extension_reason = $4
        WHERE id = $1`,
      [saleId, validUntil, ctx.userId, reason],
    );
    await audit(exec, ctx, AuditActions.bookingClientUpdated, 'booking_client', sale.client_id, {
      package: { kind: 'extended', saleId, from: sale.valid_until, to: validUntil },
    });
    return toSale(await readSale(client, timeZone, saleId));
  });
}

/**
 * „Pachete” on the client card: the sales of the client and of the cards merged into it, the newest
 * first. `usableFor` („Plata: Din pachet”): only the active sales of that service with a session
 * left, valid on that local date.
 */
export async function listClientPackagesInOrg(
  ctx: TenantContext,
  clientIdRaw: unknown,
  usableFor?: { serviceId: unknown; date: unknown },
): Promise<PackageSale[]> {
  hubOnly(ctx);
  const clientId = requireId(clientIdRaw);
  const filter = usableFor
    ? {
        serviceId: requireId(usableFor.serviceId),
        date: requireLocalDate('date', usableFor.date),
      }
    : null;
  const timeZone = await getOrganizationTimeZone(ctx);
  return ptx(
    ctx,
    async (client) => {
      const found = (await client.query(`SELECT 1 FROM booking.client WHERE id = $1`, [clientId]))
        .rows[0];
      if (!found) throw new ResourceNotFound();
      const { rows } = await client.query<SaleRow>(
        `${SALE_SELECT}
          WHERE s.client_id IN (
                  SELECT id FROM booking.client WHERE id = $2 OR merged_into_client_id = $2)
          ORDER BY s.sold_at DESC, s.id`,
        [timeZone, clientId],
      );
      const sales = rows.map(toSale);
      if (!filter) return sales;
      return sales.filter(
        (s) =>
          s.serviceId === filter.serviceId &&
          s.remaining > 0 &&
          s.validFrom <= filter.date &&
          (s.validUntil === null || filter.date <= s.validUntil),
      );
    },
    true,
  );
}

// ── „Din pachet” on an appointment ─────────────────────────────────────────────────────────

/**
 * One session of a sale reserved on an appointment, in the caller's transaction (the appointment
 * already locked): valid on the appointment's local date; the rest is held by the database
 * (package_use_guard). Used by createAppointmentInOrg and by setAppointmentPackageInOrg.
 */
export async function reservePackageSession(
  client: PoolClient,
  ctx: TenantContext,
  timeZone: string,
  appointment: { id: string; starts_at: Date },
  saleId: string,
): Promise<void> {
  const sale = (
    await client.query<{ ok: boolean }>(
      `SELECT ($3::timestamptz AT TIME ZONE $1)::date
                BETWEEN s.valid_from AND COALESCE(s.valid_until, 'infinity'::date) AS ok
         FROM booking.package_sale s WHERE s.id = $2`,
      [timeZone, saleId, appointment.starts_at],
    )
  ).rows[0];
  if (!sale) throw new ResourceNotFound();
  if (!sale.ok) throw new Conflict('package_not_valid_on_date');
  await client.query(
    `INSERT INTO booking.package_use (id, organization_id, sale_id, appointment_id, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [uuidv7(), ctx.organizationId, saleId, appointment.id, ctx.userId],
  );
}

/**
 * „Plata”: „Din pachet” (a sale) or „Plată obișnuită” (null) on an open appointment. The session
 * reserved before is given back; a member only on their own appointments.
 */
export async function setAppointmentPackageInOrg(
  ctx: TenantContext,
  scope: AppointmentScope,
  input: { appointmentId: unknown; saleId: unknown },
): Promise<{ appointmentId: string; saleId: string | null }> {
  hubOnly(ctx);
  const appointmentId = requireId(input.appointmentId);
  const saleId = input.saleId === null ? null : requireId(input.saleId);
  const timeZone = await getOrganizationTimeZone(ctx);
  return ptx(ctx, async (client, exec) => {
    const row = await readAppointment(client, appointmentId, true);
    requireScope(ctx, scope, { user_id: row.staff_user_id });
    if (['cancelled', 'completed', 'no_show'].includes(row.status)) {
      throw new Conflict('package_appointment_closed');
    }
    const current = (
      await client.query<{ id: string; sale_id: string }>(
        `SELECT id, sale_id FROM booking.package_use
          WHERE appointment_id = $1 AND state = 'reserved'`,
        [appointmentId],
      )
    ).rows[0];
    if ((current?.sale_id ?? null) === saleId) return { appointmentId, saleId };
    if (current) {
      await client.query(
        `UPDATE booking.package_use SET state = 'returned', settled_at = now() WHERE id = $1`,
        [current.id],
      );
    }
    if (saleId) await reservePackageSession(client, ctx, timeZone, row, saleId);
    await audit(
      exec,
      ctx,
      AuditActions.bookingAppointmentUpdated,
      'booking_appointment',
      appointmentId,
      { package: { saleId, previousSaleId: current?.sale_id ?? null } },
    );
    return { appointmentId, saleId };
  });
}

/** The sale an appointment is paid from (a session reserved or used), for its balance. */
export async function appointmentPackageSale(
  client: PoolClient,
  appointmentId: string,
): Promise<string | null> {
  const { rows } = await client.query<{ sale_id: string }>(
    `SELECT sale_id FROM booking.package_use WHERE appointment_id = $1 AND state <> 'returned'`,
    [appointmentId],
  );
  return rows[0]?.sale_id ?? null;
}
