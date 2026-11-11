import type { TenantContext } from '@ventora/access';
import { InvalidInput, ResourceNotFound } from '@ventora/errors';
import { getOrganizationTimeZone } from '@ventora/organizations';
import { withBookingTx } from './db';
import { daysBetween, requireLocalDate } from './schedule';
import { readCalendarStaff, staffLocalDays } from './staff';
import { isUuid } from './validation';

/*
 * Lot B.24 — the operational reports and the export (BOOKING.md §3 B.24; the design is missing: the
 * logic and the API). One read-only transaction per report, over local dates of the business (C.0):
 *
 *   - the appointments by state: completed, cancelled (by the client, by the business, late),
 *     no-shows, still occupying;
 *   - the revenue associated with the appointments: the net of their payments (B.21), per currency,
 *     and the value of the completed ones at their copied price;
 *   - the occupancy of each member: booked minutes (occupying and completed appointments) over the
 *     minutes of their schedule (B.2, the same rule as the free slots);
 *   - the performance of the services and of the members.
 * The export is CSV (D-B-8); Excel needs `exceljs`, which is not in the repository yet (a new package
 * is a proposal, not added overnight). Reports and export need booking:admin (they hold the whole
 * business and, for the export, the clients' names).
 */

export const REPORT_LIMITS = { days: 92, exportMax: 5000 } as const;

const OCCUPYING = ['awaiting_payment', 'unconfirmed', 'confirmed', 'in_progress'];

export type MoneyByCurrency = Array<{ currency: 'RON' | 'EUR'; amountMinor: number }>;

export type BookingReport = {
  from: string;
  to: string;
  timeZone: string;
  appointments: {
    total: number;
    completed: number;
    noShows: number;
    cancelledByClient: number;
    cancelledByBusiness: number;
    lateCancellations: number;
    occupying: number;
  };
  /** The net of the payments (B.21) of the appointments in the period. */
  revenue: MoneyByCurrency;
  /** The copied price of the completed appointments (fixed or lower amount). */
  completedValue: MoneyByCurrency;
  members: Array<{
    staffMemberId: string;
    displayName: string;
    appointments: number;
    completed: number;
    noShows: number;
    bookedMinutes: number;
    availableMinutes: number;
    /** booked / available, 0–1 (null when the member had no schedule in the period). */
    occupancy: number | null;
  }>;
  services: Array<{
    serviceId: string;
    serviceName: string;
    appointments: number;
    completed: number;
    noShows: number;
    cancelled: number;
    revenue: MoneyByCurrency;
  }>;
};

function requireRange(fromRaw: unknown, toRaw: unknown) {
  const from = requireLocalDate('from', fromRaw);
  const to = requireLocalDate('to', toRaw);
  const span = daysBetween(from, to);
  if (span < 1) throw new InvalidInput('to', 'order');
  if (span > REPORT_LIMITS.days) throw new InvalidInput('to', 'too_long');
  return { from, to };
}

function money(rows: Array<{ currency: string; amount: string }>): MoneyByCurrency {
  return rows
    .filter((r) => Number(r.amount) !== 0)
    .map((r) => ({ currency: r.currency.trim() as 'RON' | 'EUR', amountMinor: Number(r.amount) }));
}

/** The window of the period as instants: [from 00:00, to + 1 00:00) local. */
const WINDOW = `a.starts_at >= ($1::date::timestamp AT TIME ZONE $3)
            AND a.starts_at < (($2::date + 1)::timestamp AT TIME ZONE $3)`;

export async function getBookingReportInOrg(
  ctx: TenantContext,
  params: { from: unknown; to: unknown },
): Promise<BookingReport> {
  const { from, to } = requireRange(params.from, params.to);
  const timeZone = await getOrganizationTimeZone(ctx);
  return withBookingTx(
    ctx.organizationId,
    async (client) => {
      const counts = (
        await client.query<Record<string, string>>(
          `SELECT count(*) AS total,
                  count(*) FILTER (WHERE status = 'completed') AS completed,
                  count(*) FILTER (WHERE status = 'no_show') AS no_shows,
                  count(*) FILTER (WHERE status = 'cancelled' AND cancelled_by = 'client') AS by_client,
                  count(*) FILTER (WHERE status = 'cancelled' AND cancelled_by = 'business') AS by_business,
                  count(*) FILTER (WHERE status = 'cancelled' AND cancel_late) AS late,
                  count(*) FILTER (WHERE status = ANY($4::text[])) AS occupying
             FROM booking.appointment a WHERE ${WINDOW}`,
          [from, to, timeZone, OCCUPYING],
        )
      ).rows[0]!;

      const revenue = money(
        (
          await client.query<{ currency: string; amount: string }>(
            `SELECT p.currency,
                    sum(CASE WHEN p.kind = 'payment' THEN p.amount_minor ELSE -p.amount_minor END) AS amount
               FROM booking.appointment_payment p JOIN booking.appointment a ON a.id = p.appointment_id
              WHERE ${WINDOW} GROUP BY p.currency ORDER BY p.currency`,
            [from, to, timeZone],
          )
        ).rows,
      );
      const completedValue = money(
        (
          await client.query<{ currency: string; amount: string }>(
            `SELECT a.currency, sum(a.price_minor) AS amount FROM booking.appointment a
              WHERE ${WINDOW} AND a.status = 'completed' GROUP BY a.currency ORDER BY a.currency`,
            [from, to, timeZone],
          )
        ).rows,
      );

      // the members: their appointments, booked minutes, and the minutes of their schedule
      const perMember = (
        await client.query<{
          staff_member_id: string;
          n: string;
          completed: string;
          no_shows: string;
          booked: string;
        }>(
          `SELECT a.staff_member_id, count(*) AS n,
                  count(*) FILTER (WHERE a.status = 'completed') AS completed,
                  count(*) FILTER (WHERE a.status = 'no_show') AS no_shows,
                  COALESCE(sum(a.duration_minutes) FILTER (
                    WHERE a.status = ANY($4::text[]) OR a.status = 'completed'), 0) AS booked
             FROM booking.appointment a WHERE ${WINDOW} GROUP BY a.staff_member_id`,
          [from, to, timeZone, OCCUPYING],
        )
      ).rows;
      const staff = await readCalendarStaff(client, null);
      const local = await staffLocalDays(
        client,
        staff.map((s) => ({ id: s.id, scheduleMode: s.scheduleMode })),
        from,
        to,
      );
      const available = new Map<string, number>();
      for (const d of local) {
        const minutes = d.intervals.reduce((sum, i) => sum + (i.endMin - i.startMin), 0);
        available.set(d.staffMemberId, (available.get(d.staffMemberId) ?? 0) + minutes);
      }
      const names = new Map(staff.map((s) => [s.id, s.displayName]));
      // members removed since: their name from the copy on the appointments
      const missing = perMember.map((m) => m.staff_member_id).filter((id) => !names.has(id));
      if (missing.length) {
        const { rows } = await client.query<{ staff_member_id: string; name: string }>(
          `SELECT DISTINCT ON (staff_member_id) staff_member_id, staff_display_name AS name
             FROM booking.appointment WHERE staff_member_id = ANY($1::uuid[])
            ORDER BY staff_member_id, starts_at DESC`,
          [missing],
        );
        for (const r of rows) names.set(r.staff_member_id, r.name);
      }
      const memberIds = new Set([
        ...staff.map((s) => s.id),
        ...perMember.map((m) => m.staff_member_id),
      ]);
      const members = [...memberIds].map((id) => {
        const m = perMember.find((x) => x.staff_member_id === id);
        const booked = Number(m?.booked ?? 0);
        const avail = available.get(id) ?? 0;
        return {
          staffMemberId: id,
          displayName: names.get(id) ?? '',
          appointments: Number(m?.n ?? 0),
          completed: Number(m?.completed ?? 0),
          noShows: Number(m?.no_shows ?? 0),
          bookedMinutes: booked,
          availableMinutes: avail,
          occupancy: avail > 0 ? Math.min(1, Math.round((booked / avail) * 1000) / 1000) : null,
        };
      });

      const perService = (
        await client.query<{
          service_id: string;
          name: string;
          n: string;
          completed: string;
          no_shows: string;
          cancelled: string;
        }>(
          `SELECT a.service_id, max(a.service_name) AS name, count(*) AS n,
                  count(*) FILTER (WHERE a.status = 'completed') AS completed,
                  count(*) FILTER (WHERE a.status = 'no_show') AS no_shows,
                  count(*) FILTER (WHERE a.status = 'cancelled') AS cancelled
             FROM booking.appointment a WHERE ${WINDOW}
            GROUP BY a.service_id ORDER BY count(*) DESC, max(a.service_name)`,
          [from, to, timeZone],
        )
      ).rows;
      const serviceRevenue = (
        await client.query<{ service_id: string; currency: string; amount: string }>(
          `SELECT a.service_id, p.currency,
                  sum(CASE WHEN p.kind = 'payment' THEN p.amount_minor ELSE -p.amount_minor END) AS amount
             FROM booking.appointment_payment p JOIN booking.appointment a ON a.id = p.appointment_id
            WHERE ${WINDOW} GROUP BY a.service_id, p.currency`,
          [from, to, timeZone],
        )
      ).rows;
      const services = perService.map((s) => ({
        serviceId: s.service_id,
        serviceName: s.name,
        appointments: Number(s.n),
        completed: Number(s.completed),
        noShows: Number(s.no_shows),
        cancelled: Number(s.cancelled),
        revenue: money(serviceRevenue.filter((r) => r.service_id === s.service_id)),
      }));

      return {
        from,
        to,
        timeZone,
        appointments: {
          total: Number(counts.total),
          completed: Number(counts.completed),
          noShows: Number(counts.no_shows),
          cancelledByClient: Number(counts.by_client),
          cancelledByBusiness: Number(counts.by_business),
          lateCancellations: Number(counts.late),
          occupying: Number(counts.occupying),
        },
        revenue,
        completedValue,
        members,
        services,
      };
    },
    true,
  );
}

/** A CSV cell: quoted, and a leading = + - @ neutralised (no formula when opened in a sheet). */
export function csvCell(value: string | number | null): string {
  if (value === null) return '';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * „Exportă” (BookingList, after the active filters): the appointments of the period as CSV, in the
 * business time zone, with the net paid (B.21). At most 5000 rows (InvalidInput to: too_many).
 */
export async function exportAppointmentsCsvInOrg(
  ctx: TenantContext,
  params: { from: unknown; to: unknown; staffMemberId?: unknown; status?: unknown },
): Promise<{ filename: string; csv: string; rows: number }> {
  const { from, to } = requireRange(params.from, params.to);
  const staffId =
    params.staffMemberId === undefined
      ? null
      : isUuid(params.staffMemberId)
        ? params.staffMemberId
        : (() => {
            throw new ResourceNotFound();
          })();
  let statuses: string[] | null = null;
  if (params.status !== undefined) {
    if (!Array.isArray(params.status) || !params.status.every((s) => typeof s === 'string')) {
      throw new InvalidInput('status', 'invalid');
    }
    statuses = params.status as string[];
  }
  const timeZone = await getOrganizationTimeZone(ctx);
  return withBookingTx(
    ctx.organizationId,
    async (client) => {
      const { rows } = await client.query<{
        number: number;
        day: string;
        time: string;
        staff_display_name: string;
        service_name: string;
        client_name: string;
        status: string;
        price_minor: number;
        currency: string;
        paid: string;
      }>(
        `SELECT a.number,
                to_char(a.starts_at AT TIME ZONE $3, 'YYYY-MM-DD') AS day,
                to_char(a.starts_at AT TIME ZONE $3, 'HH24:MI') AS time,
                a.staff_display_name, a.service_name, a.client_name, a.status, a.price_minor,
                a.currency,
                COALESCE((SELECT sum(CASE WHEN p.kind = 'payment' THEN p.amount_minor ELSE -p.amount_minor END)
                            FROM booking.appointment_payment p WHERE p.appointment_id = a.id), 0) AS paid
           FROM booking.appointment a
          WHERE ${WINDOW}
            AND ($4::uuid IS NULL OR a.staff_member_id = $4)
            AND ($5::text[] IS NULL OR a.status = ANY($5::text[]))
          ORDER BY a.starts_at, a.number
          LIMIT $6`,
        [from, to, timeZone, staffId, statuses, REPORT_LIMITS.exportMax + 1],
      );
      if (rows.length > REPORT_LIMITS.exportMax) throw new InvalidInput('to', 'too_many');
      const header = [
        'Nr.',
        'Data',
        'Ora',
        'Membru',
        'Serviciu',
        'Client',
        'Stare',
        'Preț',
        'Încasat',
        'Moneda',
      ];
      const lines = [header.map(csvCell).join(',')];
      for (const r of rows) {
        lines.push(
          [
            r.number,
            r.day,
            r.time,
            r.staff_display_name,
            r.service_name,
            r.client_name,
            r.status,
            (r.price_minor / 100).toFixed(2),
            (Number(r.paid) / 100).toFixed(2),
            r.currency.trim(),
          ]
            .map(csvCell)
            .join(','),
        );
      }
      // UTF-8 BOM: Excel opens the diacritics right
      return {
        filename: `programari-${from}-${to}.csv`,
        csv: '﻿' + lines.join('\r\n') + '\r\n',
        rows: rows.length,
      };
    },
    true,
  );
}
