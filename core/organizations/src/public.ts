import { getOrgDb } from './db';

/*
 * Lot B.11a — the business behind a public booking link (app.ventora-hub.com/r/<slug>), without a
 * session. One SECURITY DEFINER function (organizations_public_lookup) returns only what the page
 * may show; a suspended business, an unknown slug and a malformed one all give null.
 */

export type PublicOrganization = {
  organizationId: string;
  name: string;
  timeZone: string;
  /** Server only: the active owner (core/access checks the members for a caller who is one). */
  ownerUserId: string | null;
};

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export async function findPublicOrganization(slug: unknown): Promise<PublicOrganization | null> {
  if (typeof slug !== 'string') return null;
  const s = slug.trim().toLowerCase();
  if (!SLUG_RE.test(s)) return null;
  const rows = (await getOrgDb().$queryRaw`
    SELECT id, name, time_zone, owner_user_id FROM organizations.find_public_organization(${s})`) as Array<{
    id: string;
    name: string;
    time_zone: string;
    owner_user_id: string | null;
  }>;
  const r = rows[0];
  return r
    ? { organizationId: r.id, name: r.name, timeZone: r.time_zone, ownerUserId: r.owner_user_id }
    : null;
}
