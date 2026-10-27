import { ensureAccessConfigured, authorize } from '@ventora/access';
import type { TenantContext } from '@ventora/access';
import { allAppsEnabledProvider } from '@ventora/contracts';

ensureAccessConfigured({ entitlementProvider: allAppsEnabledProvider });

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

export async function createAppointment(
  params: CreateAppointmentParams,
): Promise<{ ctx: TenantContext; appointment: Appointment }> {
  const ctx = await authorize({
    sessionToken: params.sessionToken,
    applicationId: 'booking',
    permission: 'booking:write',
  });
  const appointment: Appointment = {
    id: crypto.randomUUID(),
    organizationId: ctx.organizationId,
    title: params.title,
    createdBy: ctx.userId,
  };
  return { ctx, appointment };
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
