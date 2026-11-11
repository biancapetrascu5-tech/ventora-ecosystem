import { authorize, checkRolePermission } from '@ventora/access';
import type { TenantContext } from '@ventora/access';
import {
  clientPaymentTotalsInOrg,
  getAppointmentPaymentsInOrg,
  recordPaymentInOrg,
  recordRefundInOrg,
  type AppointmentBalance,
  type AppointmentPayment,
  type PaymentMethod,
} from '../server/payments';

/*
 * Lot B.21 — the public contract of the payments of an appointment (without a provider). Reading
 * with booking:read; „Încasează” with booking:write (a member only on their own appointments,
 * D-B4-6 = a); a refund with booking:admin.
 *
 * Errors: InvalidInput (amountMinor, method, note, refundOfPaymentId); Conflict
 * (appointment_cancelled, refund_exceeds_paid); ResourceNotFound; Forbidden; AppNotEnabled.
 */

type Session = { sessionToken: string };

const auth = (params: Session, permission: string): Promise<TenantContext> =>
  authorize({ sessionToken: params.sessionToken, applicationId: 'booking', permission });

export type RecordPaymentParams = Session & {
  appointmentId: string;
  amountMinor: number;
  method: PaymentMethod;
  note?: string | null;
};
export type RecordRefundParams = RecordPaymentParams & { refundOfPaymentId?: string | null };
export type AppointmentPaymentsParams = Session & { appointmentId: string };
export type ClientPaymentTotalsParams = Session & { clientId: string };

/** „Încasează”. */
export async function recordPayment(
  params: RecordPaymentParams,
): Promise<{ payment: AppointmentPayment; balance: AppointmentBalance }> {
  const ctx = await auth(params, 'booking:write');
  const all =
    ctx.role !== 'support' && (await checkRolePermission(ctx.role, 'booking', 'booking:admin'));
  return recordPaymentInOrg(ctx, all ? 'all' : 'own', {
    appointmentId: params.appointmentId,
    amountMinor: params.amountMinor,
    method: params.method,
    note: params.note,
  });
}

/** A refund recorded on the appointment. */
export async function recordRefund(
  params: RecordRefundParams,
): Promise<{ payment: AppointmentPayment; balance: AppointmentBalance }> {
  return recordRefundInOrg(await auth(params, 'booking:admin'), {
    appointmentId: params.appointmentId,
    amountMinor: params.amountMinor,
    method: params.method,
    note: params.note,
    refundOfPaymentId: params.refundOfPaymentId,
  });
}

/** The financial history of the appointment (BookingDetail) and its balance. */
export async function getAppointmentPayments(
  params: AppointmentPaymentsParams,
): Promise<{ payments: AppointmentPayment[]; balance: AppointmentBalance }> {
  return getAppointmentPaymentsInOrg(await auth(params, 'booking:read'), params.appointmentId);
}

/** „Încasat în total” on the client card. */
export async function getClientPaymentTotals(
  params: ClientPaymentTotalsParams,
): Promise<Array<{ currency: 'RON' | 'EUR'; netMinor: number; payments: number }>> {
  return clientPaymentTotalsInOrg(await auth(params, 'booking:read'), params.clientId);
}
