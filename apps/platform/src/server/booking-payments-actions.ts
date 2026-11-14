'use server';

import './access-config';
import { headers } from 'next/headers';
import { authorize, checkRolePermission } from '@ventora/access';
import {
  getAppointmentPayments,
  recordPayment,
  recordRefund,
  type AppointmentPayment,
  type PaymentMethod,
} from '@ventora/booking';
import { getSession } from '@ventora/identity';
import { getOrganizationTimeZone } from '@ventora/organizations';
import { localOf } from './booking-time';
import { reportActionError } from './report-error';

/* Decision 7, screen 5 — the payments of an appointment in the detail (BookingMoney, B.21). The
   business and the person come only from the session; the booking contracts start with
   authorize(): reading with booking:read, „Încasează” with booking:write (a member only on their
   own appointments), a refund with booking:admin. Records only: no provider (Stripe is B.22), the
   fiscal receipt stays on the salon's cash register. Instants become local dates here. */

export type PaymentRowData = {
  id: string;
  kind: 'payment' | 'refund';
  amountMinor: number;
  currency: 'RON' | 'EUR';
  method: PaymentMethod;
  refundOf: string | null;
  /** A payment: what was already refunded from it. */
  refundedMinor: number;
  /** B.21b: „Data încasării” (YYYY-MM-DD), chosen by the team; the recording is date / time. */
  paidOn: string;
  date: string;
  time: string;
};

export type MoneyData = {
  payments: PaymentRowData[];
  currency: 'RON' | 'EUR';
  priceMinor: number;
  priceKind: 'fixed' | 'from' | 'range';
  paidMinor: number;
  refundedMinor: number;
  netMinor: number;
  /** Fixed price: what is still due; „de la” / interval: null. */
  outstandingMinor: number | null;
  /** Paid from a package (B.9e): nothing is collected. */
  fromPackage: boolean;
  /** booking:admin: „Rambursează…”. */
  canRefund: boolean;
  /** The business's today, for „Data încasării” (B.21b). */
  today: string;
};

export type MoneyResult = { ok: true; data: MoneyData } | { ok: false };

async function sessionToken(): Promise<string | null> {
  const session = await getSession(await headers());
  return session?.token ?? null;
}

const codeOf = (err: unknown) => (err as { code?: string } | null)?.code;
const reasonOf = (err: unknown) => (err as { message?: string } | null)?.message ?? '';

function rowsOf(items: AppointmentPayment[], timeZone: string): PaymentRowData[] {
  const refunded = new Map<string, number>();
  for (const p of items)
    if (p.kind === 'refund' && p.refundOfPaymentId)
      refunded.set(p.refundOfPaymentId, (refunded.get(p.refundOfPaymentId) ?? 0) + p.amountMinor);
  return [...items]
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime())
    .map((p) => {
      const at = localOf(p.recordedAt, timeZone);
      return {
        id: p.id,
        kind: p.kind,
        amountMinor: p.amountMinor,
        currency: p.currency,
        method: p.method,
        refundOf: p.refundOfPaymentId,
        refundedMinor: refunded.get(p.id) ?? 0,
        paidOn: p.paidOn,
        date: at.date,
        time: at.time,
      };
    });
}

/** „Plată” in the detail: the movements (oldest first), the balance, who may refund. */
export async function readAppointmentMoney(appointmentId: string): Promise<MoneyResult> {
  const token = await sessionToken();
  if (!token) return { ok: false };
  try {
    const ctx = await authorize({
      sessionToken: token,
      applicationId: 'booking',
      permission: 'booking:read',
    });
    const [money, timeZone, admin] = await Promise.all([
      getAppointmentPayments({ sessionToken: token, appointmentId }),
      getOrganizationTimeZone({ organizationId: ctx.organizationId }),
      ctx.role === 'support'
        ? Promise.resolve(false)
        : checkRolePermission(ctx.role, 'booking', 'booking:admin'),
    ]);
    const b = money.balance;
    return {
      ok: true,
      data: {
        payments: rowsOf(money.payments, timeZone),
        currency: b.currency,
        priceMinor: b.priceMinor,
        priceKind: b.priceKind,
        paidMinor: b.paidMinor,
        refundedMinor: b.refundedMinor,
        netMinor: b.netMinor,
        outstandingMinor: b.outstandingMinor,
        fromPackage: b.packageSaleId !== null,
        canRefund: admin,
        today: localOf(new Date(), timeZone).date,
      },
    };
  } catch (err) {
    reportActionError('booking.money.read', err, { quietIfExpected: true });
    return { ok: false };
  }
}

export type MoneyActionError = 'amount' | 'date' | 'cancelled' | 'exceeds' | 'forbidden' | 'failed';
export type MoneyActionResult = { ok: true } | { ok: false; error: MoneyActionError };

function errorOf(err: unknown): MoneyActionError {
  const code = codeOf(err);
  if (code === 'FORBIDDEN') return 'forbidden';
  if (code === 'INVALID_INPUT') {
    const field = (err as { field?: string }).field;
    return field === 'amountMinor' ? 'amount' : field === 'paidOn' ? 'date' : 'failed';
  }
  if (code === 'CONFLICT') {
    if (reasonOf(err) === 'appointment_cancelled') return 'cancelled';
    if (reasonOf(err) === 'refund_exceeds_paid') return 'exceeds';
  }
  return 'failed';
}

/** „Încasează”: a payment (or part of one) on the appointment. */
export async function recordPaymentAction(params: {
  appointmentId: string;
  amountMinor: number;
  method: PaymentMethod;
  note: string;
  /** B.21b: YYYY-MM-DD; today when absent. */
  paidOn?: string | null;
}): Promise<MoneyActionResult> {
  const token = await sessionToken();
  if (!token) return { ok: false, error: 'forbidden' };
  try {
    await recordPayment({
      sessionToken: token,
      appointmentId: params.appointmentId,
      amountMinor: params.amountMinor,
      method: params.method,
      note: params.note.trim() || null,
      paidOn: params.paidOn ?? null,
    });
    return { ok: true };
  } catch (err) {
    reportActionError('booking.money.collect', err, { quietIfExpected: true });
    return { ok: false, error: errorOf(err) };
  }
}

/** „Rambursează…”: a refund of one payment, with the reason (written to the business log). */
export async function recordRefundAction(params: {
  appointmentId: string;
  paymentId: string;
  amountMinor: number;
  method: PaymentMethod;
  reason: string;
}): Promise<MoneyActionResult> {
  const token = await sessionToken();
  if (!token) return { ok: false, error: 'forbidden' };
  try {
    await recordRefund({
      sessionToken: token,
      appointmentId: params.appointmentId,
      amountMinor: params.amountMinor,
      method: params.method,
      note: params.reason.trim(),
      refundOfPaymentId: params.paymentId,
    });
    return { ok: true };
  } catch (err) {
    reportActionError('booking.money.refund', err, { quietIfExpected: true });
    return { ok: false, error: errorOf(err) };
  }
}
