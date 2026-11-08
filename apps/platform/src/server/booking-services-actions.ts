'use server';

import './access-config';
import { headers } from 'next/headers';
import { authorize } from '@ventora/access';
import {
  archiveService,
  archiveServiceCategory,
  createService,
  createServiceCategory,
  listServiceCategories,
  listServices,
  reorderServiceCategories,
  restoreService,
  restoreServiceCategory,
  updateService,
  updateServiceCategory,
  type Service,
  type ServiceCategory,
  type ServiceInputParams,
} from '@ventora/booking';
import { getCatalogForOrg, getUsage } from '@ventora/commercial';
import { getSession } from '@ventora/identity';
import { getOrganizationTimeZone } from '@ventora/organizations';
import { reportActionError } from './report-error';

/* Lot B.1-UI — EasyBook · Setări · „Servicii” (BookingServices, S123). The business and the
   person come only from the session; every call goes through the booking contracts, which start
   with authorize() (booking:read to read, booking:settings to write, D-B1-1). S123-8: the page is
   only for booking:settings. The data reaches the screen without Date objects (ISO). */

export type ServiceData = {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  durationMinutes: number;
  durationMaxMinutes: number | null;
  priceKind: 'fixed' | 'from' | 'range';
  priceMinor: number;
  priceMaxMinor: number | null;
  currency: 'RON' | 'EUR';
  capacity: number;
  bookableOnline: boolean;
  sortOrder: number;
  archivedAt: string | null;
};

export type CategoryData = {
  id: string;
  name: string;
  sortOrder: number;
  archivedAt: string | null;
};

export type ServicesPageData = {
  services: ServiceData[];
  categories: CategoryData[];
  /** S123-2: the business's currency, the default of a new service. */
  currency: 'RON' | 'EUR';
  /** C.0: the dates of the archived rows are shown in the business's time zone. */
  timeZone: string;
};

export type ServicesPage =
  | { kind: 'ok'; data: ServicesPageData }
  | { kind: 'signedOut' }
  | { kind: 'notEnabled' }
  | { kind: 'forbidden' };

const toService = (s: Service): ServiceData => ({
  id: s.id,
  categoryId: s.categoryId,
  name: s.name,
  description: s.description,
  durationMinutes: s.durationMinutes,
  durationMaxMinutes: s.durationMaxMinutes,
  priceKind: s.priceKind,
  priceMinor: s.priceMinor,
  priceMaxMinor: s.priceMaxMinor,
  currency: s.currency,
  capacity: s.capacity,
  bookableOnline: s.bookableOnline,
  sortOrder: s.sortOrder,
  archivedAt: s.archivedAt ? s.archivedAt.toISOString() : null,
});

const toCategory = (c: ServiceCategory): CategoryData => ({
  id: c.id,
  name: c.name,
  sortOrder: c.sortOrder,
  archivedAt: c.archivedAt ? c.archivedAt.toISOString() : null,
});

const codeOf = (err: unknown) => (err as { code?: string } | null)?.code;

async function sessionToken(): Promise<string | null> {
  const session = await getSession(await headers());
  return session?.token ?? null;
}

/** The page: who may open it (S123-8), then the catalog, active and archived. */
export async function readServicesPage(): Promise<ServicesPage> {
  const token = await sessionToken();
  if (!token) return { kind: 'signedOut' };
  let organizationId: string;
  try {
    const ctx = await authorize({
      sessionToken: token,
      applicationId: 'booking',
      permission: 'booking:settings',
    });
    organizationId = ctx.organizationId;
  } catch (err) {
    const code = codeOf(err);
    if (code === 'APP_NOT_ENABLED') return { kind: 'notEnabled' };
    if (code === 'NOT_AUTHENTICATED') return { kind: 'signedOut' };
    reportActionError('booking.services.read', err, { quietIfExpected: true });
    return { kind: 'forbidden' };
  }
  const [services, categories, catalog, timeZone] = await Promise.all([
    listServices({ sessionToken: token, includeArchived: true }),
    listServiceCategories({ sessionToken: token, includeArchived: true }),
    getCatalogForOrg(organizationId),
    getOrganizationTimeZone({ organizationId }),
  ]);
  return {
    kind: 'ok',
    data: {
      services: services.map(toService),
      categories: categories.map(toCategory),
      currency: catalog.currency === 'EUR' ? 'EUR' : 'RON',
      timeZone,
    },
  };
}

export type BookingShellData = {
  /** S123-8: „Setări” in the Spine only for booking:settings. */
  canSettings: boolean;
  /** The Spine meter: appointments this month (booking.appointments), when the plan has a limit. */
  usage: { used: number; limit: number } | null;
};

/** The EasyBook Spine (Hub shell under /booking). */
export async function readBookingShell(): Promise<BookingShellData | null> {
  const token = await sessionToken();
  if (!token) return null;
  try {
    const ctx = await authorize({ sessionToken: token, applicationId: 'booking' });
    const canSettings = await authorize({
      sessionToken: token,
      applicationId: 'booking',
      permission: 'booking:settings',
    }).then(
      () => true,
      () => false,
    );
    const usage = (await getUsage({ organizationId: ctx.organizationId })).find(
      (q) => q.quotaKey === 'booking.appointments',
    );
    return {
      canSettings,
      usage: usage && usage.limit !== null ? { used: usage.used, limit: usage.limit } : null,
    };
  } catch (err) {
    reportActionError('booking.shell', err, { quietIfExpected: true });
    return null;
  }
}

export type ActionError =
  | 'name_taken'
  | 'category_name_taken'
  | 'category_not_empty'
  | 'not_found'
  | 'forbidden'
  | 'failed'
  | `invalid:${string}`;

export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: ActionError };

async function run<T>(action: string, fn: (token: string) => Promise<T>): Promise<ActionResult<T>> {
  const token = await sessionToken();
  if (!token) return { ok: false, error: 'forbidden' };
  try {
    return { ok: true, value: await fn(token) };
  } catch (err) {
    reportActionError(action, err, { quietIfExpected: true });
    const code = codeOf(err);
    const message = (err as Error | null)?.message ?? '';
    if (code === 'CONFLICT') {
      if (message === 'service_name_taken') return { ok: false, error: 'name_taken' };
      if (message === 'service_category_name_taken')
        return { ok: false, error: 'category_name_taken' };
      if (message === 'service_category_not_empty')
        return { ok: false, error: 'category_not_empty' };
    }
    if (code === 'INVALID_INPUT') {
      return { ok: false, error: `invalid:${(err as { field?: string }).field ?? ''}` };
    }
    if (code === 'RESOURCE_NOT_FOUND') return { ok: false, error: 'not_found' };
    if (code === 'FORBIDDEN' || code === 'APP_NOT_ENABLED' || code === 'NOT_AUTHENTICATED') {
      return { ok: false, error: 'forbidden' };
    }
    return { ok: false, error: 'failed' };
  }
}

export type ServiceFields = Omit<ServiceInputParams, 'sortOrder'> & { sortOrder?: number };

export async function saveService(
  serviceId: string | null,
  fields: ServiceFields,
): Promise<ActionResult<ServiceData>> {
  return run('booking.services.save', async (sessionToken) =>
    toService(
      serviceId
        ? await updateService({ sessionToken, serviceId, ...fields })
        : await createService({ sessionToken, ...fields }),
    ),
  );
}

export async function archiveServiceAction(serviceId: string): Promise<ActionResult<ServiceData>> {
  return run('booking.services.archive', async (sessionToken) =>
    toService(await archiveService({ sessionToken, serviceId })),
  );
}

/** C1: a service whose category is archived comes back in „Fără categorie”. */
export async function restoreServiceAction(serviceId: string): Promise<ActionResult<ServiceData>> {
  return run('booking.services.restore', async (sessionToken) =>
    toService(await restoreService({ sessionToken, serviceId })),
  );
}

export async function saveCategory(
  categoryId: string | null,
  name: string,
  sortOrder?: number,
): Promise<ActionResult<CategoryData>> {
  return run('booking.categories.save', async (sessionToken) =>
    toCategory(
      categoryId
        ? await updateServiceCategory({ sessionToken, categoryId, name, sortOrder })
        : await createServiceCategory({ sessionToken, name, sortOrder }),
    ),
  );
}

export async function archiveCategoryAction(
  categoryId: string,
): Promise<ActionResult<CategoryData>> {
  return run('booking.categories.archive', async (sessionToken) =>
    toCategory(await archiveServiceCategory({ sessionToken, categoryId })),
  );
}

export async function restoreCategoryAction(
  categoryId: string,
): Promise<ActionResult<CategoryData>> {
  return run('booking.categories.restore', async (sessionToken) =>
    toCategory(await restoreServiceCategory({ sessionToken, categoryId })),
  );
}

/** C4: the whole order of the active categories, in one transaction. */
export async function reorderCategories(categoryIds: string[]): Promise<ActionResult<null>> {
  return run('booking.categories.reorder', async (sessionToken) => {
    await reorderServiceCategories({ sessionToken, categoryIds });
    return null;
  });
}
