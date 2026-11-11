import { authorize } from '@ventora/access';
import type { TenantContext } from '@ventora/access';
import {
  exportAppointmentsCsvInOrg,
  getBookingReportInOrg,
  type BookingReport,
} from '../server/reports';

/*
 * Lot B.24 — the public contract of the reports and the export (the design is missing). Both need
 * booking:admin (owner, admin, application manager): they hold the whole business and, for the
 * export, the clients' names. Errors: InvalidInput (from, to: order / too_long / too_many, status);
 * ResourceNotFound; Forbidden; AppNotEnabled.
 */

type Session = { sessionToken: string };

const admin = (params: Session): Promise<TenantContext> =>
  authorize({
    sessionToken: params.sessionToken,
    applicationId: 'booking',
    permission: 'booking:admin',
  });

export type BookingReportParams = Session & { from: string; to: string };
export type ExportAppointmentsParams = Session & {
  from: string;
  to: string;
  staffMemberId?: string;
  status?: string[];
};

/** Occupancy, revenue, cancellations and no-shows, services and members (at most 92 days). */
export async function getBookingReport(params: BookingReportParams): Promise<BookingReport> {
  return getBookingReportInOrg(await admin(params), { from: params.from, to: params.to });
}

/** „Exportă”: the appointments of the period as CSV (UTF-8 with BOM, at most 5000 rows). */
export async function exportAppointmentsCsv(
  params: ExportAppointmentsParams,
): Promise<{ filename: string; csv: string; rows: number }> {
  return exportAppointmentsCsvInOrg(await admin(params), {
    from: params.from,
    to: params.to,
    staffMemberId: params.staffMemberId,
    status: params.status,
  });
}
