import { authorize } from '@ventora/access';
import type { TenantContext } from '@ventora/access';
import { commitQuota, releaseQuota, reserveQuota } from '@ventora/quota';

// Lot 3.2: the EntitlementProvider is configured by the app that serves the module
// (apps/*/src/server/access-config.ts, the commercial provider); tests set their own.

// Proof module — demonstrates authorize() integration in every public contract function.
// Real booking data storage is out of scope for Lot 2.3.

export type Appointment = {
  id: string;
  organizationId: string;
  title: string;
  createdBy: string;
};

export type ListAppointmentsParams = {
  sessionToken: string;
};

export type CreateAppointmentParams = {
  sessionToken: string;
  title: string;
};

export type GetAppointmentParams = {
  sessionToken: string;
  appointmentId: string;
};

export async function listAppointments(
  params: ListAppointmentsParams,
): Promise<{ ctx: TenantContext; appointments: Appointment[] }> {
  const ctx = await authorize({
    sessionToken: params.sessionToken,
    applicationId: 'booking',
    permission: 'booking:read',
  });
  // Real data query would go here
  return { ctx, appointments: [] };
}

/**
 * Lot 3.3 (T5, ARCHITECTURE §8.3): creating an appointment consumes `booking.appointments` in two
 * steps — reserve before, commit after the appointment exists, release if creating fails. The
 * operation id is the appointment's own id, so the reconciliation can look it up. At the limit
 * only creating is blocked (QuotaExceeded); listing and reading go on (D3-6, brief §14).
 */
export async function createAppointment(
  params: CreateAppointmentParams,
): Promise<{ ctx: TenantContext; appointment: Appointment }> {
  const ctx = await authorize({
    sessionToken: params.sessionToken,
    applicationId: 'booking',
    permission: 'booking:write',
  });
  const id = crypto.randomUUID();
  await reserveQuota(ctx, 'booking.appointments', 1, id);
  try {
    // Real booking storage would insert the appointment here, with `id`.
    const appointment: Appointment = {
      id,
      organizationId: ctx.organizationId,
      title: params.title,
      createdBy: ctx.userId,
    };
    await commitQuota(ctx, id);
    return { ctx, appointment };
  } catch (err) {
    await releaseQuota(ctx, id).catch((releaseErr: unknown) => {
      console.error('[booking] createAppointment: releasing the quota failed', {
        operationId: id,
        error: releaseErr instanceof Error ? releaseErr.message : String(releaseErr),
      });
    });
    throw err;
  }
}

export async function getAppointment(
  params: GetAppointmentParams,
): Promise<{ ctx: TenantContext; appointment: Appointment }> {
  const ctx = await authorize({
    sessionToken: params.sessionToken,
    applicationId: 'booking',
    permission: 'booking:read',
    resource: {
      type: 'appointment',
      id: params.appointmentId,
      // Stub: real existence check queries booking DB under RLS.
      // Returns false for unknown IDs — ResourceNotFound is thrown by authorize().
      exists: async (_ctx) => params.appointmentId.length > 0,
    },
  });
  const appointment: Appointment = {
    id: params.appointmentId,
    organizationId: ctx.organizationId,
    title: 'Fetched appointment',
    createdBy: ctx.userId,
  };
  return { ctx, appointment };
}
