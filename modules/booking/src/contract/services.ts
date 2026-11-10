import { authorize } from '@ventora/access';
import type { TenantContext } from '@ventora/access';
import {
  archiveServiceCategoryInOrg,
  archiveServiceInOrg,
  createServiceCategoryInOrg,
  createServiceInOrg,
  getServiceInOrg,
  listServiceCategoriesInOrg,
  listServicesInOrg,
  reorderServiceCategoriesInOrg,
  restoreServiceCategoryInOrg,
  restoreServiceInOrg,
  updateServiceCategoryInOrg,
  updateServiceInOrg,
  type DoneByInput,
  type Service,
  type ServiceCategory,
} from '../server/services';
import { setServiceStaffInOrg, type DoneBy, type StoppedPair } from '../server/staff-services';
import type { ServiceInputParams } from '../server/validation';

/*
 * Lot B.1 — the public contract of the service catalog. Every function starts with authorize()
 * (application booking): reading with booking:read, writing with booking:settings (D-B1-1 = a:
 * owner, admin, application_manager). The organization comes only from the session; an id of
 * another business answers ResourceNotFound (T1). Errors: InvalidInput (the field), Conflict
 * (service_name_taken, service_category_name_taken, service_category_not_empty,
 * service_category_order_stale, service_category_archived on a race), ResourceNotFound, Forbidden, AppNotEnabled.
 */

type Session = { sessionToken: string };

function read(params: Session): Promise<TenantContext> {
  return authorize({
    sessionToken: params.sessionToken,
    applicationId: 'booking',
    permission: 'booking:read',
  });
}

function manage(params: Session): Promise<TenantContext> {
  return authorize({
    sessionToken: params.sessionToken,
    applicationId: 'booking',
    permission: 'booking:settings',
  });
}

export type ListServicesParams = Session & { includeArchived?: boolean };
export type GetServiceParams = Session & { serviceId: string };
/** B.2b (S129): „Cine îl face” in the form; absent on create = the S129 default, on update = unchanged. */
export type CreateServiceParams = Session & ServiceInputParams & { doneBy?: DoneByInput };
export type UpdateServiceParams = Session &
  ServiceInputParams & { serviceId: string; doneBy?: DoneByInput };
export type SetServiceStaffParams = Session & {
  serviceId: string;
  /** „Toată echipa” (including members who join later). */
  allStaff: boolean;
  /** The members ticked one by one (when not allStaff); empty is allowed (S129). */
  staffMemberIds?: string[];
};
export type ServiceIdParams = Session & { serviceId: string };
export type ListServiceCategoriesParams = Session & { includeArchived?: boolean };
export type ServiceCategoryParams = Session & { name: string; sortOrder?: number };
export type UpdateServiceCategoryParams = ServiceCategoryParams & { categoryId: string };
export type ServiceCategoryIdParams = Session & { categoryId: string };
export type ReorderServiceCategoriesParams = Session & { categoryIds: string[] };

function serviceInput(params: ServiceInputParams): ServiceInputParams {
  return {
    categoryId: params.categoryId,
    name: params.name,
    description: params.description,
    durationMinutes: params.durationMinutes,
    durationMaxMinutes: params.durationMaxMinutes,
    priceKind: params.priceKind,
    priceMinor: params.priceMinor,
    priceMaxMinor: params.priceMaxMinor,
    currency: params.currency,
    capacity: params.capacity,
    bookableOnline: params.bookableOnline,
    sortOrder: params.sortOrder,
  };
}

/** The catalog; archived services only with includeArchived. */
export async function listServices(params: ListServicesParams): Promise<Service[]> {
  const ctx = await read(params);
  return listServicesInOrg(ctx, { includeArchived: params.includeArchived === true });
}

/** One service, archived or not (old appointments keep it). */
export async function getService(params: GetServiceParams): Promise<Service> {
  const ctx = await read(params);
  return getServiceInOrg(ctx, params.serviceId);
}

export async function createService(params: CreateServiceParams): Promise<Service> {
  const ctx = await manage(params);
  return createServiceInOrg(ctx, serviceInput(params), params.doneBy);
}

export async function updateService(params: UpdateServiceParams): Promise<Service> {
  const ctx = await manage(params);
  return updateServiceInOrg(ctx, params.serviceId, serviceInput(params), params.doneBy);
}

/**
 * B.2b (S129) „Cine îl face”, from the service side. The answer lists the members who stopped
 * doing it, with their future appointments (kept: the warning and the link).
 */
export async function setServiceStaff(
  params: SetServiceStaffParams,
): Promise<{ doneBy: DoneBy; stopped: StoppedPair[] }> {
  const ctx = await manage(params);
  return setServiceStaffInOrg(ctx, params.serviceId, {
    allStaff: params.allStaff,
    staffMemberIds: params.staffMemberIds,
  });
}

export async function archiveService(params: ServiceIdParams): Promise<Service> {
  const ctx = await manage(params);
  return archiveServiceInOrg(ctx, params.serviceId);
}

export async function restoreService(params: ServiceIdParams): Promise<Service> {
  const ctx = await manage(params);
  return restoreServiceInOrg(ctx, params.serviceId);
}

export async function listServiceCategories(
  params: ListServiceCategoriesParams,
): Promise<ServiceCategory[]> {
  const ctx = await read(params);
  return listServiceCategoriesInOrg(ctx, { includeArchived: params.includeArchived === true });
}

export async function createServiceCategory(
  params: ServiceCategoryParams,
): Promise<ServiceCategory> {
  const ctx = await manage(params);
  return createServiceCategoryInOrg(ctx, { name: params.name, sortOrder: params.sortOrder });
}

export async function updateServiceCategory(
  params: UpdateServiceCategoryParams,
): Promise<ServiceCategory> {
  const ctx = await manage(params);
  return updateServiceCategoryInOrg(ctx, params.categoryId, {
    name: params.name,
    sortOrder: params.sortOrder,
  });
}

/**
 * The full order of the active categories, in one transaction (UI plan C4). The list must hold
 * exactly the active categories; otherwise Conflict service_category_order_stale (reload, retry).
 */
export async function reorderServiceCategories(
  params: ReorderServiceCategoriesParams,
): Promise<ServiceCategory[]> {
  const ctx = await manage(params);
  return reorderServiceCategoriesInOrg(ctx, params.categoryIds);
}

export async function archiveServiceCategory(
  params: ServiceCategoryIdParams,
): Promise<ServiceCategory> {
  const ctx = await manage(params);
  return archiveServiceCategoryInOrg(ctx, params.categoryId);
}

export async function restoreServiceCategory(
  params: ServiceCategoryIdParams,
): Promise<ServiceCategory> {
  const ctx = await manage(params);
  return restoreServiceCategoryInOrg(ctx, params.categoryId);
}

export type { Service, ServiceCategory, ServiceInputParams };
export type { PriceKind, Currency } from '../server/validation';
