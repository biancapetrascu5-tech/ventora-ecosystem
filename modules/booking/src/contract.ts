import { authorize } from '@ventora/access';
import type { TenantContext } from '@ventora/access';
import type { EntitlementProvider } from '@ventora/contracts';

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
  entitlementProvider?: EntitlementProvider;
};

export type CreateAppointmentParams = {
  sessionToken: string;
  title: string;
  entitlementProvider?: EntitlementProvider;
};

export type GetAppointmentParams = {
  sessionToken: string;
  appointmentId: string;
  entitlementProvider?: EntitlementProvider;
};

export async function listAppointments(
  params: ListAppointmentsParams,
): Promise<{ ctx: TenantContext; appointments: Appointment[] }> {
  const ctx = await authorize({
    sessionToken: params.sessionToken,
    applicationId: 'booking',
    permission: 'booking:read',
    entitlementProvider: params.entitlementProvider,
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
    entitlementProvider: params.entitlementProvider,
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
    entitlementProvider: params.entitlementProvider,
    resourceType: 'appointment',
    resourceId: params.appointmentId,
  });
  const appointment: Appointment = {
    id: params.appointmentId,
    organizationId: ctx.organizationId,
    title: 'Fetched appointment',
    createdBy: ctx.userId,
  };
  return { ctx, appointment };
}
