import { authorize } from '@ventora/access';
import type { TenantContext } from '@ventora/access';
import {
  archiveResourceInOrg,
  createResourceInOrg,
  getResourceInOrg,
  listResourcesInOrg,
  reorderResourcesInOrg,
  restoreResourceInOrg,
  updateResourceInOrg,
  type Resource,
  type ResourceKind,
} from '../server/resources';

/*
 * Lot B.3a — the public contract of the bookable resources (design S124 BookingResources; plan
 * reports/2026-11-08_2007_plan-booking-b2-b3.md §2). Reading with booking:read, writing with
 * booking:settings (owner, admin, application_manager), as the service catalog. The organization
 * comes only from the session; an id of another business answers ResourceNotFound (T1).
 *
 * Errors: InvalidInput (name, kind, units, serviceIds, resourceIds, includeArchived); Conflict
 * (resource_name_taken, resource_archived, resource_order_stale); ResourceNotFound; Forbidden;
 * AppNotEnabled.
 */

type Session = { sessionToken: string };

const read = (params: Session): Promise<TenantContext> =>
  authorize({
    sessionToken: params.sessionToken,
    applicationId: 'booking',
    permission: 'booking:read',
  });

const manage = (params: Session): Promise<TenantContext> =>
  authorize({
    sessionToken: params.sessionToken,
    applicationId: 'booking',
    permission: 'booking:settings',
  });

export type ResourceFields = {
  name: string;
  kind: ResourceKind;
  /** „Câte programări simultan”, 1–50. */
  units: number;
  /** „Servicii care o cer”: the complete list (on update, absent = unchanged). */
  serviceIds?: string[];
};
export type ListResourcesParams = Session & { includeArchived?: boolean };
export type ResourceIdParams = Session & { resourceId: string };
export type CreateResourceParams = Session & ResourceFields & { sortOrder?: number };
export type UpdateResourceParams = Session & ResourceFields & { resourceId: string };
export type ReorderResourcesParams = Session & { resourceIds: string[] };

/** BookingResources: „Active · n” / „Arhivate · n”. */
export async function listResources(params: ListResourcesParams): Promise<Resource[]> {
  return listResourcesInOrg(await read(params), { includeArchived: params.includeArchived });
}

export async function getResource(params: ResourceIdParams): Promise<Resource> {
  return getResourceInOrg(await read(params), params.resourceId);
}

/** „Resursă nouă”. */
export async function createResource(params: CreateResourceParams): Promise<Resource> {
  return createResourceInOrg(await manage(params), {
    name: params.name,
    kind: params.kind,
    units: params.units,
    serviceIds: params.serviceIds,
    sortOrder: params.sortOrder,
  });
}

/** „Editează”. */
export async function updateResource(params: UpdateResourceParams): Promise<Resource> {
  return updateResourceInOrg(await manage(params), params.resourceId, {
    name: params.name,
    kind: params.kind,
    units: params.units,
    serviceIds: params.serviceIds,
  });
}

/** „Arhivează resursa”. */
export async function archiveResource(params: ResourceIdParams): Promise<Resource> {
  return archiveResourceInOrg(await manage(params), params.resourceId);
}

/** „Restaurează”. */
export async function restoreResource(params: ResourceIdParams): Promise<Resource> {
  return restoreResourceInOrg(await manage(params), params.resourceId);
}

/** The order of the active resources (the calendar's resource columns). */
export async function reorderResources(params: ReorderResourcesParams): Promise<Resource[]> {
  return reorderResourcesInOrg(await manage(params), params.resourceIds);
}
