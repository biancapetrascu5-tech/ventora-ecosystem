import {
  getOpenLastOrganization,
  setSessionActiveOrganization,
  type HubSession,
} from '@ventora/identity';
import {
  listMyOrganizations,
  markOrganizationOpened,
  resolveOrgContext,
} from '@ventora/organizations';

/* Unde ajunge cineva după intrare (și după acceptarea unei invitații). Partea de server comună
   acțiunilor din session-actions și invite-actions; nu e o acțiune de server. */

export type MembershipRow = {
  organization_id: string;
  organization_name: string;
  role: string;
  status: string;
  last_opened_at: Date | null;
};

/** Ordinea vine din list_my_memberships_v2: ultima deschisă prima, apoi după nume. */
export async function myMemberships(userId: string): Promise<MembershipRow[]> {
  const rows = (await listMyOrganizations(userId)) as MembershipRow[];
  return rows.filter((m) => m.status === 'active');
}

export type AfterSignIn = '/two-factor/setup' | '/choose-business' | '/' | '/sign-in';

/** Pune afacerea în sesiune (verifică apartenența) și notează deschiderea (Lot 2.6 · F). */
export async function openInSession(session: HubSession, organizationId: string): Promise<void> {
  const ctx = await resolveOrgContext({ userId: session.userId, organizationId });
  await setSessionActiveOrganization(session.token, ctx);
  await markOrganizationOpened(ctx);
}

/**
 * `joined`: afacerea în care tocmai a intrat prin invitație; se deschide ea, nu alegerea.
 */
export async function routeSignedIn(
  session: HubSession,
  joined: string | null = null,
): Promise<AfterSignIn> {
  const memberships = await myMemberships(session.userId);
  // R-2F1: proprietarul fără 2FA îl activează la prima intrare, fără perioadă de grație.
  if (!session.twoFactorEnabled && memberships.some((m) => m.role === 'owner'))
    return '/two-factor/setup';
  if (joined && memberships.some((m) => m.organization_id === joined)) {
    await openInSession(session, joined);
    return '/';
  }
  if (memberships.length === 1) {
    await openInSession(session, memberships[0]!.organization_id);
    return '/';
  }
  if (memberships.length > 1) {
    // Lot 2.6 · F: „Deschide direct ultima afacere data viitoare” bifat și o afacere deschisă
    // înainte → direct în ea; altfel alegerea.
    const last = memberships[0]!;
    if (last.last_opened_at && (await getOpenLastOrganization(session.userId))) {
      await openInSession(session, last.organization_id);
      return '/';
    }
    return '/choose-business';
  }
  return '/';
}
