import { getAccessDb } from './db.js';
import {
  NotAuthenticated,
  NotMember,
  AppNotEnabled,
  Forbidden,
  ResourceNotFound,
} from '@ventora/errors';
import type { EntitlementProvider } from '@ventora/contracts';

// System role names matching organizations.MembershipRole enum.
// Defined locally to avoid a compile-time dependency on @ventora/organizations.
type MembershipRole =
  'owner' | 'admin' | 'member' | 'external_collaborator' | 'application_manager';

// In-process permission cache — module-level, reset on cold start.
// Permissions change only at deploy (sync-permissions.ts), so a long-lived cache is safe.
const _permCache = new Map<string, boolean>();

export type TenantContext = {
  userId: string;
  organizationId: string;
  membershipId: string;
  role: MembershipRole;
  applicationId: string;
  actor: 'user' | 'system' | 'support';
};

export type AuthorizeParams = {
  sessionToken: string;
  applicationId: string;
  permission?: string;
  resourceType?: string;
  resourceId?: string;
  entitlementProvider?: EntitlementProvider;
  actor?: 'user' | 'system' | 'support';
};

// Roles that bypass the application_access table check (ADR-0004)
const IMPLICIT_ACCESS_ROLES = new Set<MembershipRole>(['owner', 'admin']);

export async function authorize(params: AuthorizeParams): Promise<TenantContext> {
  const actor = params.actor ?? 'user';

  // Step 1: validate session
  const { getSession } = await import('@ventora/identity');
  const headers = new Headers({ authorization: `Bearer ${params.sessionToken}` });
  const session = await getSession(headers);
  if (!session?.userId) throw new NotAuthenticated();

  const organizationId = session.activeOrganizationId;
  if (!organizationId) throw new NotMember();

  // Step 2: verify active membership (re-checked on every request, never cached)
  const { resolveOrgContext } = await import('@ventora/organizations');
  let orgCtx: Awaited<ReturnType<typeof resolveOrgContext>>;
  try {
    orgCtx = await resolveOrgContext({ userId: session.userId, organizationId });
  } catch {
    // resolveOrgContext throws NotMemberError when membership is missing/suspended.
    // Translate to the canonical error from @ventora/errors.
    throw new NotMember();
  }

  const role = orgCtx.role;

  // Step 3: application enabled (entitlement check)
  const provider = params.entitlementProvider;
  if (provider) {
    const enabled = await provider.isEnabled(organizationId, params.applicationId);
    if (!enabled) throw new AppNotEnabled();
  }

  // Step 4: application access (skip for owner/admin — ADR-0004)
  if (!IMPLICIT_ACCESS_ROLES.has(role)) {
    const hasAccess = await _checkApplicationAccess(organizationId, params.applicationId);
    if (!hasAccess) throw new Forbidden();
  }

  // Step 5: permission check
  if (params.permission) {
    const allowed = await _checkRolePermission(role, params.applicationId, params.permission);
    if (!allowed) throw new Forbidden();
  }

  // Step 6: resource ownership (if resourceType + resourceId given)
  if (params.resourceType && params.resourceId) {
    const owns = await _checkResourcePolicy(
      organizationId,
      role,
      params.resourceType,
      params.resourceId,
    );
    if (!owns) throw new ResourceNotFound();
  }

  // membershipId not stored in orgCtx; pass organizationId+userId combo as membershipId placeholder
  // Real membershipId lookup is deferred to Lot 2.5 (audit)
  const membershipId = `${organizationId}:${session.userId}`;

  return {
    userId: session.userId,
    organizationId,
    membershipId,
    role,
    applicationId: params.applicationId,
    actor,
  };
}

async function _checkApplicationAccess(
  organizationId: string,
  applicationId: string,
): Promise<boolean> {
  const db = getAccessDb();
  return db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
    const row = await tx.applicationAccess.findUnique({
      where: { organizationId_applicationId: { organizationId, applicationId } },
      select: { id: true },
    });
    return row !== null;
  });
}

async function _checkRolePermission(
  role: MembershipRole,
  applicationId: string,
  permissionName: string,
): Promise<boolean> {
  const cacheKey = `${role}:${applicationId}:${permissionName}`;
  const cached = _permCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const db = getAccessDb();
  const result = await db.$transaction(async (tx: any) => {
    // system roles have NULL organization_id — SET LOCAL ROLE is still needed for access_rw
    await tx.$executeRaw`SELECT set_config('app.organization_id', '', true)`;
    const row = await tx.rolePermission.findFirst({
      where: {
        role: { name: role, organizationId: null },
        permission: { applicationId, name: permissionName },
      },
      select: { id: true },
    });
    return row !== null;
  });

  _permCache.set(cacheKey, result);
  return result;
}

async function _checkResourcePolicy(
  organizationId: string,
  role: MembershipRole,
  resourceType: string,
  resourceId: string,
): Promise<boolean> {
  const db = getAccessDb();
  return db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
    // Resolve system role id (organization_id IS NULL) before querying policy
    const roleRow = await tx.role.findFirst({
      where: { name: role, organizationId: null },
      select: { id: true },
    });
    if (!roleRow) return false;
    const row = await tx.resourceAccessPolicy.findFirst({
      where: {
        organizationId,
        roleId: roleRow.id,
        resourceType,
        OR: [{ resourceId: null }, { resourceId }],
      },
      select: { id: true },
    });
    return row !== null;
  });
}

/**
 * Grant application access to a user's organization.
 * Called from acceptInvitation in core/organizations — idempotent (ON CONFLICT DO NOTHING).
 * Only called for member/external_collaborator/application_manager roles (ADR-0004).
 */
export async function grantApplicationAccess(
  organizationId: string,
  _userId: string,
  applicationIds: string[],
): Promise<void> {
  if (applicationIds.length === 0) return;
  const db = getAccessDb();
  await db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
    for (const applicationId of applicationIds) {
      await tx.$executeRaw`
        INSERT INTO access.application_access (organization_id, application_id)
        VALUES (${organizationId}::uuid, ${applicationId})
        ON CONFLICT DO NOTHING
      `;
    }
  });
}

/**
 * Check whether a role has a specific permission.
 * Used by sync-permissions.ts to verify grants after upsert.
 */
export async function checkRolePermission(
  role: string,
  applicationId: string,
  permissionName: string,
): Promise<boolean> {
  return _checkRolePermission(role as MembershipRole, applicationId, permissionName);
}
