import type { PoolClient } from 'pg';
import { AuditActions, appendAuditEventInTx } from '@ventora/audit';
import type { TenantContext } from '@ventora/access';
import { BookingPaymentRecordedV1 } from '@ventora/contracts';
import { uuidv7, writeOutboxEvent } from '@ventora/db-kit';
import { Conflict, Forbidden, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { withBookingTx } from './db';
import { isUuid } from './validation';
import { hubOnly } from './actor';

/*
 * Lot B.21 — the payments of an appointment, without a provider (BOOKING.md §3 B.21): „Încasează”,
 * partial payments, refunds, the outstanding balance, the history on the appointment and on the
 * client card, the event booking.payment.recorded for Finance (C-B-2). Records only: the fiscal
 * receipt stays on the salon's cash register (E-AMEF is B.34).
 *
 * A movement is never changed: a mistake is corrected with a refund. The database holds the rules
 * whoever writes (appointment_payment_guard): the appointment's currency and client, a refund never
 * above what was paid. Recording a payment: booking:write (a member only on their own
 * appointments, D-B4-6); a refund: booking:admin.
 */

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other';

export type AppointmentPayment = {
  id: string;
  appointmentId: string;
  kind: 'payment' | 'refund';
  amountMinor: number;
  currency: 'RON' | 'EUR';
  method: PaymentMethod;
  note: string | null;
  refundOfPaymentId: string | null;
  recordedAt: Date;
  recordedByUserId: string;
};

export type AppointmentBalance = {
  appointmentId: string;
  currency: 'RON' | 'EUR';
  /** The price copied on the appointment; for „de la” / interval, the lower amount. */
  priceMinor: number;
  priceKind: 'fixed' | 'from' | 'range';
  paidMinor: number;
  refundedMinor: number;
  netMinor: number;
  /** Fixed price: what is still due; „de la” / interval: null (the salon sets the final amount). */
  outstandingMinor: number | null;
};

const METHODS: readonly PaymentMethod[] = ['cash', 'card', 'transfer', 'other'];

type PaymentRow = {
  id: string;
  appointment_id: string;
  kind: 'payment' | 'refund';
  amount_minor: number;
  currency: string;
  method: PaymentMethod;
  note: string | null;
  refund_of_payment_id: string | null;
  recorded_at: Date;
  recorded_by_user_id: string;
};

const PAYMENT_COLUMNS = `id, appointment_id, kind, amount_minor, currency, method, note,
  refund_of_payment_id, recorded_at, recorded_by_user_id`;

function toPayment(r: PaymentRow): AppointmentPayment {
  return {
    id: r.id,
    appointmentId: r.appointment_id,
    kind: r.kind,
    amountMinor: r.amount_minor,
    currency: r.currency.trim() as 'RON' | 'EUR',
    method: r.method,
    note: r.note,
    refundOfPaymentId: r.refund_of_payment_id,
    recordedAt: r.recorded_at,
    recordedByUserId: r.recorded_by_user_id,
  };
}

function requireId(id: unknown): string {
  if (!isUuid(id)) throw new ResourceNotFound();
  return id;
}

type AppointmentForPayment = {
  id: string;
  client_id: string;
  currency: string;
  price_kind: 'fixed' | 'from' | 'range';
  price_minor: number;
  status: string;
  staff_user_id: string;
};

async function readAppointment(client: PoolClient, id: string): Promise<AppointmentForPayment> {
  const { rows } = await client.query<AppointmentForPayment>(
    `SELECT a.id, a.client_id, a.currency, a.price_kind, a.price_minor, a.status,
            m.user_id AS staff_user_id
       FROM booking.appointment a JOIN booking.staff_member m ON m.id = a.staff_member_id
      WHERE a.id = $1`,
    [id],
  );
  if (!rows[0]) throw new ResourceNotFound();
  return rows[0];
}

async function balanceOf(
  client: PoolClient,
  a: AppointmentForPayment,
): Promise<AppointmentBalance> {
  const { rows } = await client.query<{ paid: string; refunded: string }>(
    `SELECT COALESCE(sum(amount_minor) FILTER (WHERE kind = 'payment'), 0) AS paid,
            COALESCE(sum(amount_minor) FILTER (WHERE kind = 'refund'), 0) AS refunded
       FROM booking.appointment_payment WHERE appointment_id = $1`,
    [a.id],
  );
  const paid = Number(rows[0]!.paid);
  const refunded = Number(rows[0]!.refunded);
  const net = paid - refunded;
  return {
    appointmentId: a.id,
    currency: a.currency.trim() as 'RON' | 'EUR',
    priceMinor: a.price_minor,
    priceKind: a.price_kind,
    paidMinor: paid,
    refundedMinor: refunded,
    netMinor: net,
    outstandingMinor: a.price_kind === 'fixed' ? Math.max(0, a.price_minor - net) : null,
  };
}

function requireAmount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 10_000_000) {
    throw new InvalidInput('amountMinor', 'invalid');
  }
  return value;
}

function requireMethod(value: unknown): PaymentMethod {
  if (typeof value !== 'string' || !(METHODS as readonly string[]).includes(value)) {
    throw new InvalidInput('method', 'invalid');
  }
  return value as PaymentMethod;
}

function optionalNote(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new InvalidInput('note', 'invalid');
  const note = value.trim();
  if (note.length > 500) throw new InvalidInput('note', 'too_long');
  return note.length ? note : null;
}

function translate(err: unknown): never {
  const e = err as { code?: string; hint?: string };
  if (e?.code === '23514' && e.hint === 'refund_exceeds_paid')
    throw new Conflict('refund_exceeds_paid');
  throw err;
}

async function insertMovement(
  client: PoolClient,
  exec: Parameters<typeof appendAuditEventInTx>[0],
  ctx: TenantContext,
  a: AppointmentForPayment,
  m: {
    kind: 'payment' | 'refund';
    amount: number;
    method: PaymentMethod;
    note: string | null;
    refundOf: string | null;
  },
): Promise<AppointmentPayment> {
  const id = uuidv7();
  const { rows } = await client.query<PaymentRow>(
    `INSERT INTO booking.appointment_payment
       (id, organization_id, appointment_id, client_id, kind, amount_minor, currency, method, note,
        refund_of_payment_id, recorded_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING ${PAYMENT_COLUMNS}`,
    [
      id,
      ctx.organizationId,
      a.id,
      a.client_id,
      m.kind,
      m.amount,
      a.currency.trim(),
      m.method,
      m.note,
      m.refundOf,
      ctx.userId,
    ],
  );
  const row = rows[0]!;
  // the appointment's own audit code; the amount, never the note
  await appendAuditEventInTx(exec, {
    category: 'booking',
    action: AuditActions.bookingAppointmentUpdated,
    outcome: 'success',
    actorType: 'user',
    actorId: ctx.userId,
    organizationId: ctx.organizationId,
    targetType: 'booking_appointment',
    targetId: a.id,
    metadata: { payment: { id, kind: m.kind, amountMinor: m.amount, method: m.method } },
  });
  await writeOutboxEvent(client, 'booking', BookingPaymentRecordedV1, {
    organizationId: ctx.organizationId,
    sourceApp: 'platform',
    resourceId: id,
    payload: {
      paymentId: id,
      appointmentId: a.id,
      clientId: a.client_id,
      kind: m.kind,
      amountMinor: m.amount,
      currency: a.currency.trim() as 'RON' | 'EUR',
      method: m.method,
      recordedAt: row.recorded_at.toISOString(),
    },
  });
  return toPayment(row);
}

// ── the contracts' server side ──────────────────────────────────────────────────────────────

/**
 * „Încasează”: a payment (also partial) on an appointment. A member only on their own appointments
 * (`scope: 'own'`). A cancelled appointment takes no payment (Conflict('appointment_cancelled')).
 */
export async function recordPaymentInOrg(
  ctx: TenantContext,
  scope: 'all' | 'own',
  params: { appointmentId: unknown; amountMinor: unknown; method: unknown; note?: unknown },
): Promise<{ payment: AppointmentPayment; balance: AppointmentBalance }> {
  hubOnly(ctx);
  const appointmentId = requireId(params.appointmentId);
  const amount = requireAmount(params.amountMinor);
  const method = requireMethod(params.method);
  const note = optionalNote(params.note);
  try {
    return await withBookingTx(ctx.organizationId, async (client, exec) => {
      const a = await readAppointment(client, appointmentId);
      if (scope === 'own' && a.staff_user_id !== ctx.userId) throw new Forbidden();
      if (a.status === 'cancelled') throw new Conflict('appointment_cancelled');
      const payment = await insertMovement(client, exec, ctx, a, {
        kind: 'payment',
        amount,
        method,
        note,
        refundOf: null,
      });
      return { payment, balance: await balanceOf(client, a) };
    });
  } catch (err) {
    translate(err);
  }
}

/** A refund recorded (booking:admin); never more than what was paid (refund_exceeds_paid). */
export async function recordRefundInOrg(
  ctx: TenantContext,
  params: {
    appointmentId: unknown;
    amountMinor: unknown;
    method: unknown;
    note?: unknown;
    refundOfPaymentId?: unknown;
  },
): Promise<{ payment: AppointmentPayment; balance: AppointmentBalance }> {
  hubOnly(ctx);
  const appointmentId = requireId(params.appointmentId);
  const amount = requireAmount(params.amountMinor);
  const method = requireMethod(params.method);
  const note = optionalNote(params.note);
  const refundOf =
    params.refundOfPaymentId === undefined || params.refundOfPaymentId === null
      ? null
      : requireId(params.refundOfPaymentId);
  try {
    return await withBookingTx(ctx.organizationId, async (client, exec) => {
      const a = await readAppointment(client, appointmentId);
      if (refundOf) {
        const of = (
          await client.query<{ appointment_id: string; kind: string }>(
            `SELECT appointment_id, kind FROM booking.appointment_payment WHERE id = $1`,
            [refundOf],
          )
        ).rows[0];
        if (!of || of.appointment_id !== a.id || of.kind !== 'payment') {
          throw new InvalidInput('refundOfPaymentId', 'invalid');
        }
      }
      const payment = await insertMovement(client, exec, ctx, a, {
        kind: 'refund',
        amount,
        method,
        note,
        refundOf,
      });
      return { payment, balance: await balanceOf(client, a) };
    });
  } catch (err) {
    translate(err);
  }
}

/** The financial history of an appointment and its balance (booking:read). */
export async function getAppointmentPaymentsInOrg(
  ctx: TenantContext,
  appointmentIdRaw: unknown,
): Promise<{ payments: AppointmentPayment[]; balance: AppointmentBalance }> {
  hubOnly(ctx);
  const appointmentId = requireId(appointmentIdRaw);
  return withBookingTx(
    ctx.organizationId,
    async (client) => {
      const a = await readAppointment(client, appointmentId);
      const { rows } = await client.query<PaymentRow>(
        `SELECT ${PAYMENT_COLUMNS} FROM booking.appointment_payment
          WHERE appointment_id = $1 ORDER BY recorded_at, id`,
        [appointmentId],
      );
      return { payments: rows.map(toPayment), balance: await balanceOf(client, a) };
    },
    true,
  );
}

/** The client card („încasat în total”): the net per currency, the clients merged into it included. */
export async function clientPaymentTotalsInOrg(
  ctx: TenantContext,
  clientIdRaw: unknown,
): Promise<Array<{ currency: 'RON' | 'EUR'; netMinor: number; payments: number }>> {
  hubOnly(ctx);
  const clientId = requireId(clientIdRaw);
  return withBookingTx(
    ctx.organizationId,
    async (client) => {
      const found = (await client.query(`SELECT 1 FROM booking.client WHERE id = $1`, [clientId]))
        .rows[0];
      if (!found) throw new ResourceNotFound();
      const { rows } = await client.query<{ currency: string; net: string; n: string }>(
        `SELECT currency,
                sum(CASE WHEN kind = 'payment' THEN amount_minor ELSE -amount_minor END) AS net,
                count(*) FILTER (WHERE kind = 'payment') AS n
           FROM booking.appointment_payment
          WHERE client_id IN (SELECT id FROM booking.client WHERE id = $1 OR merged_into_client_id = $1)
          GROUP BY currency ORDER BY currency`,
        [clientId],
      );
      return rows.map((r) => ({
        currency: r.currency.trim() as 'RON' | 'EUR',
        netMinor: Number(r.net),
        payments: Number(r.n),
      }));
    },
    true,
  );
}
