import { BookingAppointmentCancelledV1 } from '@ventora/contracts';
import type { OutboxEnvelope, OutboxSqlClient } from '@ventora/db-kit';
import { Conflict, ResourceNotFound } from '@ventora/errors';
import { refundQuota, registerOperationResolver, releaseQuota } from '@ventora/quota';
import { APPOINTMENTS_QUOTA_KEY, appointmentExists } from './appointments';

/*
 * Lot B.4b — the quota booking.appointments around the appointments (plan §5; ARCHITECTURE §8.3).
 *
 * - The reconciliation resolver: a reservation left after 15 minutes is committed when the
 *   appointment of its operation exists, released when it does not (a process stopped between the
 *   transaction and the commit). Registered when the module is loaded, like core/ai and workflows.
 * - The refund: a cancellation before the start gives the unit back (refundable). The consumer of
 *   booking.appointment.cancelled does it, so a failure is retried by the outbox and not lost.
 *   refundQuota is idempotent, so a second delivery of the same event refunds nothing more (T6).
 */

let registered = false;

export function registerAppointmentsQuotaResolver(): void {
  if (registered) return;
  registered = true;
  registerOperationResolver(APPOINTMENTS_QUOTA_KEY, appointmentExists);
}

/** The shape of an outbox consumer (core/integrations OutboxConsumer), without depending on it. */
export type BookingOutboxConsumer = {
  name: string;
  handles: readonly { type: string; version: number }[];
  handle(envelope: OutboxEnvelope, tx: OutboxSqlClient): Promise<void>;
};

export const bookingQuotaRefundConsumer: BookingOutboxConsumer = {
  name: 'booking.appointments-quota-refund',
  handles: [
    { type: BookingAppointmentCancelledV1.type, version: BookingAppointmentCancelledV1.version },
  ],
  async handle(envelope) {
    const payload = BookingAppointmentCancelledV1.parse(envelope.payload);
    if (!payload.quotaRefund) return;
    const ctx = { organizationId: envelope.organizationId };
    try {
      await refundQuota(ctx, payload.appointmentId);
    } catch (err) {
      // no reservation: an appointment from before the quota (B.4a) — nothing to give back
      if (err instanceof ResourceNotFound) return;
      if (!(err instanceof Conflict)) throw err;
      // still only reserved (the commit did not happen): release it instead
      try {
        await releaseQuota(ctx, payload.appointmentId);
      } catch (again) {
        if (again instanceof Conflict || again instanceof ResourceNotFound) return;
        throw again;
      }
    }
  },
};
