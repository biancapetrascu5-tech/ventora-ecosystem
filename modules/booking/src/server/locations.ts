import type { TenantContext } from '@ventora/access';
import { InvalidInput, ResourceNotFound } from '@ventora/errors';
import { getActiveLocation, getOrganizationTimeZone } from '@ventora/organizations';
import { isUuid } from './validation';

/*
 * Lot B.10 — the business's locations in Booking (C.1 holds them, in core/organizations).
 *
 * A member, a resource and an appointment may carry a location_id. Booking never reads
 * organizations.location: it checks an id through getActiveLocation (ARCHITECTURE §6.4 b), so an
 * id of another business, an unknown one and an archived one are all `locationId:not_found`.
 * null means „every location” (a member who works everywhere, a business with one site).
 *
 * The time zone (DE VALIDAT TEHNIC / PROPUS, report B.10): the schedules, the free slots and the
 * appointments still run in the business time zone (C.0). A location in another time zone would
 * need the hours of the week read in that zone everywhere (B.2, B.4, B.5), so until that lot such
 * a location is refused in Booking (`locationId:time_zone_differs`) instead of being shown wrong.
 */

/** null, or the id of an active location of the context's business in its time zone. */
export async function bookingLocation(ctx: TenantContext, raw: unknown): Promise<string | null> {
  if (raw === null) return null;
  if (!isUuid(raw)) throw new InvalidInput('locationId', 'not_found');
  let location;
  try {
    location = await getActiveLocation({ organizationId: ctx.organizationId }, raw);
  } catch (err) {
    if (err instanceof ResourceNotFound) throw new InvalidInput('locationId', 'not_found');
    throw err;
  }
  if (location.timeZone !== (await getOrganizationTimeZone(ctx))) {
    throw new InvalidInput('locationId', 'time_zone_differs');
  }
  return location.id;
}

/** A filter by location: undefined = all; otherwise an active location (as above). */
export async function locationFilter(
  ctx: TenantContext,
  raw: unknown,
): Promise<string | undefined> {
  if (raw === undefined || raw === null) return undefined;
  return (await bookingLocation(ctx, raw)) ?? undefined;
}
