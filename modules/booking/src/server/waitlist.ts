import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { AuditActions, appendAuditEventInTx, type AuditSqlExecutor } from '@ventora/audit';
import type { TenantContext } from '@ventora/access';
import { guardBulkOp } from '@ventora/db-kit';
import { Conflict, Forbidden, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { getOrganizationTimeZone } from '@ventora/organizations';
import { actorUserId, hubOnly, isPublicContext } from './actor';
import {
  createAppointmentInOrg,
  getBookingSettingsInOrg,
  type AppointmentScope,
} from './appointments';
import { staffFreeAtInOrg } from './availability';
import { withBookingJobTx, withBookingTx } from './db';
import { issueManageToken, manageTokenHash, parseManageToken } from './manage-token';
import { place } from './public';
import { requireLocalDate } from './schedule';
import { doesService } from './staff-services';
import { effectiveTermsFor, type ServiceTermsBase } from './terms';
import { isUuid } from './validation';

/*
 * Lot B.9c — the waiting list (design BookingWaitlist, S126; plan
 * reports/2026-11-12_plan-booking-b9.md). Programări · „Listă de așteptare”: a client waits for a
 * service (a member or „Oricine e liber”), on a range of days, in an interval of the day. When a
 * time frees up, the team sees the matching clients and offers the time to one of them; the client
 * answers from a link (/r/<slug>/w/<token>: „Iau locul” / „Nu mai am nevoie”). The time stays free
 * until the client accepts; if someone else books it first, the offer closes („Locul nu mai e
 * disponibil”) and the client stays on the list.
 *
 * The decisions (PROPUS until the founder confirms):
 *   D-9c-1  the team chooses who gets the offer; the list is in the order it was added; no
 *           automatic offers in the pilot;
 *   D-9c-2  one offer at a time per freed time (checked under the member's lock) and one open
 *           offer per entry (a unique index);
 *   D-9c-3  the SMS of the offer counts against the business's SMS; the sending is B.17/B.13, so
 *           for now only 'email' is accepted (Conflict sms_not_available).
 * The e-mail itself is B.13 (it needs the public URL, 3.9): offerWaitlistSlot returns the link
 * token once, as issueManageLinkInOrg does for B.13.
 *
 * Audit (PROPUS, no new code): the changes of the list are booking.client_updated on the client,
 * with metadata { waitlist: 'added' | 'removed' | 'offered' | 'declined', entryId, offerId } (only
 * ids, never the note); the booking made from an offer is the usual booking.appointment_created.
 * The job booking.waitlist-offers closes the expired offers and the ones whose time was taken (no
 * audit: housekeeping).
 */

export const WAITLIST_LIMITS = {
  note: 500,
  /** The range of days, at most (date_to − date_from). */
  rangeDays: 90,
  /** „Cât timp e valabilă”. */
  offerMinutes: [30, 60, 120],
  listMax: 200,
  businessesPerRun: 500,
} as const;

export const WAITLIST_TIME_KINDS = ['any', 'morning', 'afternoon', 'evening', 'custom'] as const;
export type WaitlistTimeKind = (typeof WAITLIST_TIME_KINDS)[number];

/** The local minutes of each interval (start inside [from, to)). */
const KIND_RANGE: Record<Exclude<WaitlistTimeKind, 'custom'>, [number, number]> = {
  any: [0, 1440],
  morning: [0, 720],
  afternoon: [720, 1020],
  evening: [1020, 1440],
};

export type WaitlistEntryStatus = 'waiting' | 'offered' | 'accepted' | 'removed';
export type WaitlistOfferState =
  'pending' | 'accepted' | 'declined' | 'expired' | 'taken' | 'withdrawn';

export type WaitlistOffer = {
  id: string;
  staffMemberId: string;
  startsAt: Date;
  endsAt: Date;
  expiresAt: Date;
  channel: 'email' | 'sms';
  state: WaitlistOfferState;
  appointmentId: string | null;
  createdAt: Date;
};

export type WaitlistEntry = {
  id: string;
  client: { id: string; name: string; phone: string | null; email: string | null };
  serviceId: string;
  serviceName: string;
  /** null = „Oricine e liber”. */
  staffMemberId: string | null;
  staffDisplayName: string | null;
  dateFrom: string;
  dateTo: string;
  time: { kind: WaitlistTimeKind; fromMinute: number | null; toMinute: number | null };
  note: string | null;
  status: WaitlistEntryStatus;
  acceptedAppointmentId: string | null;
  /** The last offer („Ofertă trimisă · până la 14:40”, „Oferta a expirat”), or null. */
  lastOffer: WaitlistOffer | null;
  createdAt: Date;
};

type EntryRow = {
  id: string;
  client_id: string;
  client_name: string;
  client_phone: string | null;
  client_email: string | null;
  service_id: string;
  service_name: string;
  staff_member_id: string | null;
  staff_display_name: string | null;
  date_from: string;
  date_to: string;
  time_kind: WaitlistTimeKind;
  from_minute: number | null;
  to_minute: number | null;
  note: string | null;
  status: WaitlistEntryStatus;
  accepted_appointment_id: string | null;
  created_at: Date;
  o_id: string | null;
  o_staff_member_id: string | null;
  o_starts_at: Date | null;
  o_ends_at: Date | null;
  o_expires_at: Date | null;
  o_channel: 'email' | 'sms' | null;
  o_state: WaitlistOfferState | null;
  o_appointment_id: string | null;
  o_created_at: Date | null;
};

const ENTRY_SELECT = `
  SELECT e.id, e.client_id, c.name AS client_name, c.phone AS client_phone,
         c.email AS client_email, e.service_id, s.name AS service_name, e.staff_member_id,
         m.display_name AS staff_display_name, to_char(e.date_from, 'YYYY-MM-DD') AS date_from,
         to_char(e.date_to, 'YYYY-MM-DD') AS date_to, e.time_kind, e.from_minute, e.to_minute,
         e.note, e.status, e.accepted_appointment_id, e.created_at,
         o.id AS o_id, o.staff_member_id AS o_staff_member_id, o.starts_at AS o_starts_at,
         o.ends_at AS o_ends_at, o.expires_at AS o_expires_at, o.channel AS o_channel,
         o.state AS o_state, o.appointment_id AS o_appointment_id, o.created_at AS o_created_at
    FROM booking.waitlist_entry e
    JOIN booking.client c ON c.id = e.client_id
    JOIN booking.service s ON s.id = e.service_id
    LEFT JOIN booking.staff_member m ON m.id = e.staff_member_id
    LEFT JOIN LATERAL (
      SELECT * FROM booking.waitlist_offer x WHERE x.entry_id = e.id
       ORDER BY x.created_at DESC, x.id DESC LIMIT 1) o ON true`;

function toEntry(r: EntryRow): WaitlistEntry {
  return {
    id: r.id,
    client: { id: r.client_id, name: r.client_name, phone: r.client_phone, email: r.client_email },
    serviceId: r.service_id,
    serviceName: r.service_name,
    staffMemberId: r.staff_member_id,
    staffDisplayName: r.staff_display_name,
    dateFrom: r.date_from,
    dateTo: r.date_to,
    time: { kind: r.time_kind, fromMinute: r.from_minute, toMinute: r.to_minute },
    note: r.note,
    status: r.status,
    acceptedAppointmentId: r.accepted_appointment_id,
    lastOffer: r.o_id
      ? {
          id: r.o_id,
          staffMemberId: r.o_staff_member_id!,
          startsAt: r.o_starts_at!,
          endsAt: r.o_ends_at!,
          expiresAt: r.o_expires_at!,
          channel: r.o_channel!,
          state: r.o_state!,
          appointmentId: r.o_appointment_id,
          createdAt: r.o_created_at!,
        }
      : null,
    createdAt: r.created_at,
  };
}

function requireId(field: string, id: unknown): string {
  if (!isUuid(id)) throw new InvalidInput(field, 'invalid');
  return id;
}

function audit(
  exec: AuditSqlExecutor,
  ctx: TenantContext,
  clientId: string,
  metadata: Record<string, unknown>,
) {
  return appendAuditEventInTx(exec, {
    category: 'booking',
    action: AuditActions.bookingClientUpdated,
    outcome: 'success',
    actorType: isPublicContext(ctx) ? 'anonymous' : 'user',
    actorId: actorUserId(ctx),
    organizationId: ctx.organizationId,
    targetType: 'booking_client',
    targetId: clientId,
    metadata,
  });
}

async function readEntry(client: PoolClient, id: string, lock = false): Promise<EntryRow> {
  const { rows } = await client.query<EntryRow>(
    `${ENTRY_SELECT} WHERE e.id = $1${lock ? ' FOR UPDATE OF e' : ''}`,
    [id],
  );
  if (!rows[0]) throw new ResourceNotFound();
  return rows[0];
}

/** Local date and minute of an instant in the business time zone. */
async function localOf(client: PoolClient, at: Date, timeZone: string) {
  const r = (
    await client.query<{ d: string; m: number }>(
      `SELECT to_char(x, 'YYYY-MM-DD') AS d,
              (extract(hour FROM x) * 60 + extract(minute FROM x))::int AS m
         FROM (SELECT $1::timestamptz AT TIME ZONE $2 AS x) q`,
      [at, timeZone],
    )
  ).rows[0]!;
  return { date: r.d, minute: r.m };
}

function fits(r: Pick<EntryRow, 'time_kind' | 'from_minute' | 'to_minute'>, minute: number) {
  const [from, to] =
    r.time_kind === 'custom' ? [r.from_minute!, r.to_minute!] : KIND_RANGE[r.time_kind];
  return from <= minute && minute < to;
}

// ── the team ─────────────────────────────────────────────────────────────────────────────

export type AddToWaitlistInput = {
  id: unknown;
  clientId: unknown;
  serviceId: unknown;
  /** A member's id, or 'any' („Oricine e liber”). */
  staffMemberId: unknown;
  dateFrom: unknown;
  dateTo: unknown;
  time: { kind: unknown; fromMinute?: unknown; toMinute?: unknown } | undefined;
  note?: unknown;
};

/** „Adaugă pe listă”: client, service, member or „Oricine e liber”, days, interval, note. */
export async function addToWaitlistInOrg(
  ctx: TenantContext,
  input: AddToWaitlistInput,
): Promise<WaitlistEntry> {
  hubOnly(ctx);
  const id = requireId('id', input.id);
  const clientId = requireId('clientId', input.clientId);
  const serviceId = requireId('serviceId', input.serviceId);
  const staffMemberId =
    input.staffMemberId === 'any' ? null : requireId('staffMemberId', input.staffMemberId);
  const dateFrom = requireLocalDate('dateFrom', input.dateFrom);
  const dateTo = requireLocalDate('dateTo', input.dateTo);
  if (dateTo < dateFrom) throw new InvalidInput('dateTo', 'order');
  const span = (Date.parse(dateTo) - Date.parse(dateFrom)) / 86_400_000;
  if (span > WAITLIST_LIMITS.rangeDays) throw new InvalidInput('dateTo', 'too_long');
  const t = input.time ?? { kind: undefined };
  if (!(WAITLIST_TIME_KINDS as readonly unknown[]).includes(t.kind)) {
    throw new InvalidInput('time.kind', 'invalid');
  }
  const kind = t.kind as WaitlistTimeKind;
  let fromMinute: number | null = null;
  let toMinute: number | null = null;
  if (kind === 'custom') {
    const ok = (v: unknown, min: number, max: number) =>
      typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max && v % 5 === 0;
    if (!ok(t.fromMinute, 0, 1435)) throw new InvalidInput('time.fromMinute', 'invalid');
    if (!ok(t.toMinute, 5, 1440) || (t.toMinute as number) <= (t.fromMinute as number)) {
      throw new InvalidInput('time.toMinute', 'invalid');
    }
    fromMinute = t.fromMinute as number;
    toMinute = t.toMinute as number;
  }
  let note: string | null = null;
  if (input.note !== undefined && input.note !== null) {
    if (typeof input.note !== 'string') throw new InvalidInput('note', 'invalid');
    const text = input.note.trim();
    if (text.length > WAITLIST_LIMITS.note) throw new InvalidInput('note', 'too_long');
    note = text || null;
  }
  return withBookingTx(ctx.organizationId, async (client, exec) => {
    const c = (
      await client.query<{ archived_at: Date | null }>(
        `SELECT archived_at FROM booking.client WHERE id = $1`,
        [clientId],
      )
    ).rows[0];
    if (!c) throw new ResourceNotFound();
    if (c.archived_at) throw new Conflict('client_archived');
    const s = (
      await client.query<{ archived_at: Date | null }>(
        `SELECT archived_at FROM booking.service WHERE id = $1`,
        [serviceId],
      )
    ).rows[0];
    if (!s) throw new ResourceNotFound();
    if (s.archived_at) throw new Conflict('service_archived');
    if (staffMemberId) {
      const m = (
        await client.query<{ archived_at: Date | null }>(
          `SELECT archived_at FROM booking.staff_member WHERE id = $1`,
          [staffMemberId],
        )
      ).rows[0];
      if (!m) throw new ResourceNotFound();
      if (m.archived_at) throw new Conflict('staff_member_removed');
      if (!(await doesService(client, staffMemberId, serviceId))) {
        throw new Conflict('staff_not_for_service');
      }
    }
    const inserted = await client.query(
      `INSERT INTO booking.waitlist_entry
         (id, organization_id, client_id, service_id, staff_member_id, date_from, date_to,
          time_kind, from_minute, to_minute, note, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO NOTHING`,
      [
        id,
        ctx.organizationId,
        clientId,
        serviceId,
        staffMemberId,
        dateFrom,
        dateTo,
        kind,
        fromMinute,
        toMinute,
        note,
        ctx.userId,
      ],
    );
    const row = await readEntry(client, id);
    if (inserted.rowCount === 0) {
      // a retry of the same operation returns the same entry; another content: refused
      if (row.client_id !== clientId || row.service_id !== serviceId) {
        throw new Conflict('operation_reused');
      }
      return toEntry(row);
    }
    await audit(exec, ctx, clientId, { waitlist: 'added', entryId: id });
    return toEntry(row);
  });
}

/** „Listă de așteptare · 4”: in the order they were added (D-9c-1). */
export async function listWaitlistInOrg(
  ctx: TenantContext,
  input: { status?: unknown } = {},
): Promise<{ items: WaitlistEntry[]; waiting: number }> {
  hubOnly(ctx);
  const statuses =
    input.status === undefined ? ['waiting', 'offered'] : (input.status as unknown[]);
  if (
    !Array.isArray(statuses) ||
    statuses.some((s) => !['waiting', 'offered', 'accepted', 'removed'].includes(s as string))
  ) {
    throw new InvalidInput('status', 'invalid');
  }
  return withBookingTx(
    ctx.organizationId,
    async (client) => {
      const { rows } = await client.query<EntryRow>(
        `${ENTRY_SELECT} WHERE e.status = ANY($1::text[])
          ORDER BY e.created_at, e.id LIMIT $2`,
        [statuses, WAITLIST_LIMITS.listMax],
      );
      const waiting = (
        await client.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM booking.waitlist_entry
            WHERE status IN ('waiting', 'offered')`,
        )
      ).rows[0]!.n;
      return { items: rows.map(toEntry), waiting };
    },
    true,
  );
}

/** Off the list (by the team): an open offer is withdrawn, its link stops working. */
export async function removeFromWaitlistInOrg(
  ctx: TenantContext,
  entryId: unknown,
): Promise<WaitlistEntry> {
  hubOnly(ctx);
  const id = requireId('entryId', entryId);
  return withBookingTx(ctx.organizationId, async (client, exec) => {
    const row = await readEntry(client, id, true);
    if (row.status === 'accepted' || row.status === 'removed') {
      throw new Conflict('waitlist_entry_closed');
    }
    await client.query(
      `UPDATE booking.waitlist_offer SET state = 'withdrawn', closed_at = now()
        WHERE entry_id = $1 AND state = 'pending'`,
      [id],
    );
    await client.query(
      `UPDATE booking.waitlist_entry
          SET status = 'removed', removed_at = now(), removed_by_user_id = $2, updated_at = now()
        WHERE id = $1`,
      [id, ctx.userId],
    );
    await audit(exec, ctx, row.client_id, { waitlist: 'removed', entryId: id });
    return toEntry(await readEntry(client, id));
  });
}

/**
 * „S-a eliberat joi, 19 noiembrie, 14:00, la Ioana Pavel”: the clients waiting for that time — the
 * member or „Oricine e liber”, the date in their range, the time in their interval, a service the
 * member does and has room for at that time (the team rules of B.5) — in the order they were added.
 */
export async function findWaitlistMatchesInOrg(
  ctx: TenantContext,
  input: { staffMemberId: unknown; startsAt: unknown },
): Promise<WaitlistEntry[]> {
  hubOnly(ctx);
  const staffMemberId = requireId('staffMemberId', input.staffMemberId);
  const startsAt = requireStartsAt(input.startsAt);
  const timeZone = await getOrganizationTimeZone(ctx);
  const candidates = await withBookingTx(
    ctx.organizationId,
    async (client) => {
      const local = await localOf(client, startsAt, timeZone);
      const { rows } = await client.query<EntryRow>(
        `${ENTRY_SELECT}
          WHERE e.status = 'waiting'
            AND (e.staff_member_id IS NULL OR e.staff_member_id = $1)
            AND e.date_from <= $2::date AND e.date_to >= $2::date
          ORDER BY e.created_at, e.id`,
        [staffMemberId, local.date],
      );
      const out: EntryRow[] = [];
      for (const r of rows) {
        if (fits(r, local.minute) && (await doesService(client, staffMemberId, r.service_id))) {
          out.push(r);
        }
      }
      return out;
    },
    true,
  );
  const free = new Map<string, boolean>();
  const matches: WaitlistEntry[] = [];
  for (const r of candidates) {
    if (!free.has(r.service_id)) {
      const who = await staffFreeAtInOrg(ctx, { serviceId: r.service_id, startsAt });
      free.set(r.service_id, who.includes(staffMemberId));
    }
    if (free.get(r.service_id)) matches.push(toEntry(r));
  }
  return matches;
}

function requireStartsAt(value: unknown): Date {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value)
  ) {
    throw new InvalidInput('startsAt', 'invalid');
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new InvalidInput('startsAt', 'invalid');
  return d;
}

export type OfferWaitlistSlotInput = {
  entryId: unknown;
  staffMemberId: unknown;
  startsAt: unknown;
  /** 30, 60 or 120 minutes. */
  validMinutes: unknown;
  channel: unknown;
};

/**
 * „Oferă locul”: the freed time to one client, valid 30 min / 1 h / 2 h. The member must do the
 * service and be free at that time; D-9c-2: no other open offer for an overlapping time of the same
 * member, and one open offer per entry. Returns the offer and its link token (shown only here; the
 * e-mail is B.13).
 */
export async function offerWaitlistSlotInOrg(
  ctx: TenantContext,
  scope: AppointmentScope,
  input: OfferWaitlistSlotInput,
): Promise<{ offer: WaitlistOffer; token: string }> {
  hubOnly(ctx);
  const entryId = requireId('entryId', input.entryId);
  const staffMemberId = requireId('staffMemberId', input.staffMemberId);
  const startsAt = requireStartsAt(input.startsAt);
  if (!(WAITLIST_LIMITS.offerMinutes as readonly unknown[]).includes(input.validMinutes)) {
    throw new InvalidInput('validMinutes', 'invalid');
  }
  const validMinutes = input.validMinutes as number;
  if (input.channel !== 'email' && input.channel !== 'sms') {
    throw new InvalidInput('channel', 'invalid');
  }
  // D-9c-3: the SMS is sent only from B.17 / B.13
  if (input.channel === 'sms') throw new Conflict('sms_not_available');

  const entry = await withBookingTx(
    ctx.organizationId,
    (client) => readEntry(client, entryId),
    true,
  );
  if (entry.status !== 'waiting') throw new Conflict('waitlist_entry_not_waiting');
  if (!entry.client_email) throw new Conflict('client_no_email');
  if (entry.staff_member_id && entry.staff_member_id !== staffMemberId) {
    throw new Conflict('staff_not_wanted');
  }
  const staff = await withBookingTx(
    ctx.organizationId,
    async (client) =>
      (
        await client.query<{ user_id: string; archived_at: Date | null }>(
          `SELECT user_id, archived_at FROM booking.staff_member WHERE id = $1`,
          [staffMemberId],
        )
      ).rows[0],
    true,
  );
  if (!staff) throw new ResourceNotFound();
  // D-B4-6: a member offers only their own time
  if (scope === 'own' && staff.user_id !== ctx.userId) throw new Forbidden();
  const free = await staffFreeAtInOrg(ctx, { serviceId: entry.service_id, startsAt });
  if (!free.includes(staffMemberId)) throw new Conflict('slot_taken');

  const token = crypto.randomBytes(32).toString('base64url');
  const offerId = crypto.randomUUID();
  return withBookingTx(ctx.organizationId, async (client, exec) => {
    const row = await readEntry(client, entryId, true);
    if (row.status !== 'waiting') throw new Conflict('waitlist_entry_not_waiting');
    // the member's lock: two offers for the same freed time cannot pass together (D-9c-2)
    await client.query(`SELECT booking.lock_active_staff($1, $2)`, [
      staffMemberId,
      ctx.organizationId,
    ]);
    // B.2c: the member's own duration for the service (the maximum, as online)
    const service = (
      await client.query<ServiceTermsBase>(
        `SELECT duration_minutes, duration_max_minutes, price_kind, price_minor, price_max_minor
           FROM booking.service WHERE id = $1`,
        [row.service_id],
      )
    ).rows[0]!;
    const terms = await effectiveTermsFor(client, row.service_id, service, [staffMemberId]);
    const duration = terms.get(staffMemberId)!.durationMax;
    const endsAt = new Date(startsAt.getTime() + duration * 60_000);
    const busy = await client.query(
      `SELECT 1 FROM booking.waitlist_offer
        WHERE staff_member_id = $1 AND state = 'pending' AND expires_at > now()
          AND tstzrange(starts_at, ends_at, '[)') && tstzrange($2, $3, '[)')`,
      [staffMemberId, startsAt, endsAt],
    );
    if (busy.rowCount! > 0) throw new Conflict('offer_active');
    await client.query(
      `INSERT INTO booking.waitlist_offer
         (id, organization_id, entry_id, staff_member_id, starts_at, ends_at, expires_at, channel,
          token_hash, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, now() + make_interval(mins => $7), 'email', $8, $9)`,
      [
        offerId,
        ctx.organizationId,
        entryId,
        staffMemberId,
        startsAt,
        endsAt,
        validMinutes,
        manageTokenHash(token),
        ctx.userId,
      ],
    );
    await client.query(
      `UPDATE booking.waitlist_entry SET status = 'offered', updated_at = now() WHERE id = $1`,
      [entryId],
    );
    await audit(exec, ctx, row.client_id, { waitlist: 'offered', entryId, offerId });
    return { offer: toEntry(await readEntry(client, entryId)).lastOffer!, token };
  });
}

// ── the client (/r/<slug>/w/<token>) ─────────────────────────────────────────────────────

export type PublicWaitlistOffer = {
  business: { name: string; timeZone: string };
  serviceName: string;
  staffDisplayName: string;
  startsAt: Date;
  endsAt: Date;
  /** „până la 14:40”. */
  expiresAt: Date;
  /** open: „Iau locul” / „Nu mai am nevoie”; gone: „Locul nu mai e disponibil”. */
  state: 'open' | 'gone' | 'accepted' | 'declined';
};

type OfferRow = {
  id: string;
  entry_id: string;
  client_id: string;
  service_id: string;
  service_name: string;
  staff_member_id: string;
  staff_display_name: string;
  starts_at: Date;
  ends_at: Date;
  expires_at: Date;
  state: WaitlistOfferState;
  expired: boolean;
  taken: boolean;
};

async function readOffer(client: PoolClient, token: string, lock = false): Promise<OfferRow> {
  const { rows } = await client.query<OfferRow>(
    `SELECT o.id, o.entry_id, e.client_id, e.service_id, s.name AS service_name,
            o.staff_member_id, m.display_name AS staff_display_name, o.starts_at, o.ends_at,
            o.expires_at, o.state, (o.expires_at <= now()) AS expired,
            EXISTS (
              SELECT 1 FROM booking.appointment a
               WHERE a.staff_member_id = o.staff_member_id
                 AND a.status IN ('awaiting_payment', 'unconfirmed', 'confirmed', 'in_progress')
                 AND a.id <> o.id
                 AND tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(o.starts_at, o.ends_at, '[)')
            ) AS taken
       FROM booking.waitlist_offer o
       JOIN booking.waitlist_entry e ON e.id = o.entry_id
       JOIN booking.service s ON s.id = e.service_id
       JOIN booking.staff_member m ON m.id = o.staff_member_id
      WHERE o.token_hash = $1${lock ? ' FOR UPDATE OF o, e' : ''}`,
    [manageTokenHash(token)],
  );
  if (!rows[0]) throw new ResourceNotFound();
  return rows[0];
}

function publicState(o: OfferRow): PublicWaitlistOffer['state'] {
  if (o.state === 'accepted') return 'accepted';
  if (o.state === 'declined') return 'declined';
  if (o.state !== 'pending' || o.expired || o.taken) return 'gone';
  return 'open';
}

async function resolveOffer(slug: unknown, token: unknown) {
  const p = await place(slug);
  const t = parseManageToken(token);
  if (!t) throw new ResourceNotFound();
  return { p, token: t };
}

/** „S-a eliberat un loc”: the time held until the offer expires. */
export async function getWaitlistOffer(
  slug: unknown,
  token: unknown,
): Promise<PublicWaitlistOffer> {
  const { p, token: t } = await resolveOffer(slug, token);
  const o = await withBookingTx(p.ctx.organizationId, (c) => readOffer(c, t), true);
  return {
    business: { name: p.name, timeZone: p.timeZone },
    serviceName: o.service_name,
    staffDisplayName: o.staff_display_name,
    startsAt: o.starts_at,
    endsAt: o.ends_at,
    expiresAt: o.expires_at,
    state: publicState(o),
  };
}

/** Close an offer that can no longer be taken; the client stays on the list. */
async function closeGone(organizationId: string, offerId: string, state: 'expired' | 'taken') {
  await withBookingTx(organizationId, async (c) => {
    const r = await c.query<{ entry_id: string }>(
      `UPDATE booking.waitlist_offer SET state = $2, closed_at = now()
        WHERE id = $1 AND state = 'pending' RETURNING entry_id`,
      [offerId, state],
    );
    if (r.rows[0]) {
      await c.query(
        `UPDATE booking.waitlist_entry SET status = 'waiting', updated_at = now()
          WHERE id = $1 AND status = 'offered'`,
        [r.rows[0].entry_id],
      );
    }
  });
}

/**
 * „Iau locul”: the booking, with the checks of a new one (the offer's id is its id, so a second
 * click returns the same booking). The time taken in the meantime: Conflict('slot_taken'), the
 * offer closes and the client stays on the list. Returns the link of the booking (B.11b).
 */
export async function acceptWaitlistOffer(
  slug: unknown,
  token: unknown,
): Promise<{ appointmentId: string; number: number; startsAt: Date; manageToken: string }> {
  const { p, token: t } = await resolveOffer(slug, token);
  const { ctx } = p;
  const o = await withBookingTx(ctx.organizationId, (c) => readOffer(c, t), true);
  if (o.state === 'accepted') throw new Conflict('offer_accepted');
  if (o.state !== 'pending') throw new Conflict('offer_closed');
  if (o.expired) {
    await closeGone(ctx.organizationId, o.id, 'expired');
    throw new Conflict('offer_expired');
  }
  const settings = await getBookingSettingsInOrg(ctx);
  let appointment;
  try {
    appointment = await createAppointmentInOrg(ctx, 'all', {
      id: o.id,
      staffMemberId: o.staff_member_id,
      serviceId: o.service_id,
      clientId: o.client_id,
      startsAt: o.starts_at.toISOString(),
      confirmed: settings.confirmationMode === 'auto',
    });
  } catch (err) {
    if (
      err instanceof Conflict &&
      ['appointment_overlap', 'staff_unavailable', 'resource_unavailable'].includes(err.message)
    ) {
      await closeGone(ctx.organizationId, o.id, 'taken');
      throw new Conflict('slot_taken');
    }
    throw err;
  }
  const manageToken = await withBookingTx(ctx.organizationId, async (c) => {
    const locked = await readOffer(c, t, true);
    if (locked.state === 'pending') {
      await c.query(
        `UPDATE booking.waitlist_offer SET state = 'accepted', appointment_id = $2, closed_at = now()
          WHERE id = $1`,
        [o.id, appointment.id],
      );
      await c.query(
        `UPDATE booking.waitlist_entry
            SET status = 'accepted', accepted_appointment_id = $2, updated_at = now()
          WHERE id = $1`,
        [o.entry_id, appointment.id],
      );
    }
    return issueManageToken(c, ctx.organizationId, appointment.id);
  });
  return {
    appointmentId: appointment.id,
    number: appointment.number,
    startsAt: appointment.startsAt,
    manageToken,
  };
}

/** „Nu mai am nevoie”: the offer declined and the client off the list. */
export async function declineWaitlistOffer(slug: unknown, token: unknown): Promise<void> {
  const { p, token: t } = await resolveOffer(slug, token);
  const { ctx } = p;
  await withBookingTx(ctx.organizationId, async (c, exec) => {
    const o = await readOffer(c, t, true);
    if (o.state === 'accepted') throw new Conflict('offer_accepted');
    if (o.state === 'pending') {
      await c.query(
        `UPDATE booking.waitlist_offer SET state = 'declined', closed_at = now() WHERE id = $1`,
        [o.id],
      );
    }
    const entry = await c.query(
      `UPDATE booking.waitlist_entry
          SET status = 'removed', removed_at = now(), updated_at = now()
        WHERE id = $1 AND status IN ('waiting', 'offered')`,
      [o.entry_id],
    );
    if (entry.rowCount! > 0) {
      await audit(exec, ctx, o.client_id, {
        waitlist: 'declined',
        entryId: o.entry_id,
        offerId: o.id,
      });
    }
  });
}

// ── the job booking.waitlist-offers ──────────────────────────────────────────────────────

export type WaitlistOfferJobReport = {
  businesses: number;
  expired: number;
  taken: number;
  failed: Array<{ organizationId: string; error: unknown }>;
};

/**
 * The offers that can no longer be taken: expired → 'expired' („Oferta a expirat”, „Oferă
 * următorului”), their time booked by someone else → 'taken'; the client goes back to „Așteaptă”.
 * For each business with something to close, in its own context. No audit (housekeeping).
 */
export async function runWaitlistOfferJob(): Promise<WaitlistOfferJobReport> {
  const due = await withBookingJobTx(
    async (client) =>
      (
        await client.query<{ organization_id: string }>(
          `SELECT organization_id::text FROM booking.waitlist_offers_due($1)`,
          [WAITLIST_LIMITS.businessesPerRun],
        )
      ).rows,
  );
  const report: WaitlistOfferJobReport = {
    businesses: due.length,
    expired: 0,
    taken: 0,
    failed: [],
  };
  for (const { organization_id: organizationId } of due) {
    try {
      const done = await withBookingTx(organizationId, async (client) => {
        guardBulkOp('booking.waitlist_offer.close', { state: 'pending' });
        const taken = await client.query<{ entry_id: string }>(
          `UPDATE booking.waitlist_offer o SET state = 'taken', closed_at = now()
            WHERE o.state = 'pending'
              AND EXISTS (
                SELECT 1 FROM booking.appointment a
                 WHERE a.staff_member_id = o.staff_member_id
                   AND a.status IN ('awaiting_payment', 'unconfirmed', 'confirmed', 'in_progress')
                   AND a.id <> o.id
                   AND tstzrange(a.starts_at, a.ends_at, '[)')
                       && tstzrange(o.starts_at, o.ends_at, '[)'))
            RETURNING o.entry_id`,
        );
        const expired = await client.query<{ entry_id: string }>(
          `UPDATE booking.waitlist_offer SET state = 'expired', closed_at = now()
            WHERE state = 'pending' AND expires_at <= now()
            RETURNING entry_id`,
        );
        const entries = [...taken.rows, ...expired.rows].map((r) => r.entry_id);
        if (entries.length) {
          await client.query(
            `UPDATE booking.waitlist_entry SET status = 'waiting', updated_at = now()
              WHERE id = ANY($1::uuid[]) AND status = 'offered'`,
            [entries],
          );
        }
        return { taken: taken.rowCount ?? 0, expired: expired.rowCount ?? 0 };
      });
      report.taken += done.taken;
      report.expired += done.expired;
    } catch (error) {
      report.failed.push({ organizationId, error });
    }
  }
  if (report.failed.length > 0) {
    throw Object.assign(new Error('booking.waitlist-offers: some businesses failed'), { report });
  }
  return report;
}
