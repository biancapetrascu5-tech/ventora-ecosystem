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

export type OrganizationCard = {
  organizationId: string;
  slug: string;
  name: string;
  timeZone: string;
  /** false when the business is suspended: its modules send nothing to its clients. */
  active: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lot B.13 — the business behind a module's job (server only, never from a request): the name,
 * the slug of its public links and its time zone, for the e-mails EasyBook sends to its clients.
 * Read in the business's own context (RLS); null for an unknown id.
 */
export async function getOrganizationCard(
  organizationId: string,
): Promise<OrganizationCard | null> {
  if (!UUID_RE.test(organizationId)) return null;
  const r = (await getOrgDb().$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
    return tx.organization.findUnique({
      where: { id: organizationId },
      select: { slug: true, name: true, timeZone: true, status: true },
    });
  })) as { slug: string; name: string; timeZone: string; status: string } | null;
  return r
    ? {
        organizationId,
        slug: r.slug,
        name: r.name,
        timeZone: r.timeZone,
        active: r.status === 'active',
      }
    : null;
}
