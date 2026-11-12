import { authorize, checkRolePermission } from '@ventora/access';
import type { TenantContext } from '@ventora/access';
import type { AppointmentScope } from '../server/appointments';
import {
  archivePackageInOrg,
  createPackageInOrg,
  extendPackageSaleInOrg,
  listClientPackagesInOrg,
  listPackagesInOrg,
  sellPackageInOrg,
  setAppointmentPackageInOrg,
  updatePackageInOrg,
  type BookingPackage,
  type PackagePaymentMethod,
  type PackageSale,
  type PackageValidityMonths,
} from '../server/packages';

/*
 * Lot B.9e — the public contract of the packages of sessions (design BookingPackages, S126; plan
 * reports/2026-11-12_plan-booking-b9.md). Only from the Hub.
 *   - the definitions (Setări · Servicii · „Pachete de ședințe”): booking:read lists, booking:settings
 *     creates, edits and archives (as the services);
 *   - „Vinde un pachet…” and „Plata: Din pachet”: booking:write (a member only on their own
 *     appointments, D-B4-6); the client's packages: booking:read;
 *   - D-9e-2, the extension of a sale: only the owner.
 *
 * Errors: InvalidInput ('name' | 'sessions' | 'validityMonths' | 'priceMinor' | 'method' |
 * 'validFrom' | 'validUntil' | 'reason' | 'note' | 'id', …); Conflict ('service_archived',
 * 'package_archived', 'client_archived', 'payment_link_not_available' (D-9e-3), 'operation_reused',
 * 'package_no_limit', 'package_not_valid_on_date', 'package_used_up', 'package_other_service',
 * 'package_other_client', 'package_appointment_closed', 'package_already_on_appointment');
 * ResourceNotFound; Forbidden; AppNotEnabled.
 */

type Session = { sessionToken: string };

const auth = (params: Session, permission: string): Promise<TenantContext> =>
  authorize({ sessionToken: params.sessionToken, applicationId: 'booking', permission });

async function write(params: Session): Promise<{ ctx: TenantContext; scope: AppointmentScope }> {
  const ctx = await auth(params, 'booking:write');
  const all =
    ctx.role !== 'support' && (await checkRolePermission(ctx.role, 'booking', 'booking:admin'));
  return { ctx, scope: all ? 'all' : 'own' };
}

export type CreatePackageParams = Session & {
  serviceId: string;
  name: string;
  sessions: number;
  /** 1, 3, 6, 12 months or null („Fără limită”). */
  validityMonths: PackageValidityMonths | null;
  priceMinor: number;
};
export type UpdatePackageParams = Session & {
  packageId: string;
  name?: string;
  validityMonths?: PackageValidityMonths | null;
  priceMinor?: number;
};
export type PackageIdParams = Session & { packageId: string };
export type ListPackagesParams = Session & { serviceId?: string; includeArchived?: boolean };
export type SellPackageParams = Session & {
  /** A UUID chosen by the caller: a retry with the same id returns the same sale. */
  id: string;
  clientId: string;
  packageId: string;
  /** „Valabil de la”: a local date (YYYY-MM-DD); today by default. */
  validFrom?: string;
  /** „Card la salon” = card; 'link' (the payment link) is refused in the pilot (D-9e-3). */
  method: PackagePaymentMethod | 'link';
  note?: string | null;
};
export type ExtendPackageSaleParams = Session & {
  saleId: string;
  /** The new last day (YYYY-MM-DD), after the current one. */
  validUntil: string;
  reason: string;
};
export type ListClientPackagesParams = Session & {
  clientId: string;
  /** „Plata: Din pachet”: only the sales usable for this service on this local date. */
  usableFor?: { serviceId: string; date: string };
};
export type SetAppointmentPackageParams = Session & {
  appointmentId: string;
  /** A sale („Din pachet”) or null („Plată obișnuită”). */
  saleId: string | null;
};

export async function listPackages(params: ListPackagesParams): Promise<BookingPackage[]> {
  return listPackagesInOrg(await auth(params, 'booking:read'), {
    serviceId: params.serviceId,
    includeArchived: params.includeArchived,
  });
}

export async function createPackage(params: CreatePackageParams): Promise<BookingPackage> {
  return createPackageInOrg(await auth(params, 'booking:settings'), {
    serviceId: params.serviceId,
    name: params.name,
    sessions: params.sessions,
    validityMonths: params.validityMonths,
    priceMinor: params.priceMinor,
  });
}

export async function updatePackage(params: UpdatePackageParams): Promise<BookingPackage> {
  return updatePackageInOrg(await auth(params, 'booking:settings'), params.packageId, {
    name: params.name,
    validityMonths: params.validityMonths,
    priceMinor: params.priceMinor,
  });
}

export async function archivePackage(params: PackageIdParams): Promise<BookingPackage> {
  return archivePackageInOrg(await auth(params, 'booking:settings'), params.packageId);
}

export async function sellPackage(params: SellPackageParams): Promise<PackageSale> {
  return sellPackageInOrg(await auth(params, 'booking:write'), {
    id: params.id,
    clientId: params.clientId,
    packageId: params.packageId,
    validFrom: params.validFrom,
    method: params.method,
    note: params.note,
  });
}

export async function extendPackageSale(params: ExtendPackageSaleParams): Promise<PackageSale> {
  return extendPackageSaleInOrg(await auth(params, 'booking:write'), {
    saleId: params.saleId,
    validUntil: params.validUntil,
    reason: params.reason,
  });
}

export async function listClientPackages(params: ListClientPackagesParams): Promise<PackageSale[]> {
  return listClientPackagesInOrg(
    await auth(params, 'booking:read'),
    params.clientId,
    params.usableFor,
  );
}

export async function setAppointmentPackage(
  params: SetAppointmentPackageParams,
): Promise<{ appointmentId: string; saleId: string | null }> {
  const { ctx, scope } = await write(params);
  return setAppointmentPackageInOrg(ctx, scope, {
    appointmentId: params.appointmentId,
    saleId: params.saleId,
  });
}
