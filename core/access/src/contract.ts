import { getAccessDb } from './db';
import {
  NotAuthenticated,
  NotMember,
  AppNotEnabled,
  Forbidden,
  ResourceNotFound,
  TwoFactorRequired,
} from '@ventora/errors';
import type { EntitlementProvider } from '@ventora/contracts';
import { getSession } from '@ventora/identity';
import { resolveOrgContext, acceptInvitation } from '@ventora/organizations';
import {
  AuditActions,
  readOrganizationAuditLog,
  writeAuditEvent,
  type AuditLogEntry,
  type AuditLogFilters,
} from '@ventora/audit';
import { PLATFORM_APPLICATION_ID } from './platform-manifest';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function assertUuid(value: string, fieldName: string): void {
  if (!UUID_RE.test(value)) {
    throw new TypeError(
      `[validation] ${fieldName} must be a UUID, got: ${JSON.stringify(value.slice(0, 32))}`,
    );
  }
}

// System role names matching organizations.MembershipRole enum.
type MembershipRole =
  'owner' | 'admin' | 'member' | 'external_collaborator' | 'application_manager';

type AccessConfig = {
  entitlementProvider: EntitlementProvider;
};

let _config: AccessConfig | undefined;

export function configureAccess(config: AccessConfig): void {
  _config = config;
}

/** Idempotent: sets the default provider only if not already configured.
 *  Modules call this at load time; tests call configureAccess() explicitly to override. */
export function ensureAccessConfigured(config: AccessConfig): void {
  if (!_config) _config = config;
}

/** Internal: the configured provider, for authorizeSupport() (same step 3 as authorize()). */
export function getEntitlementProvider(): EntitlementProvider {
  if (!_config) throw new Error('[access] configureAccess() must be called before authorize()');
  return _config.entitlementProvider;
}

export type TenantContext = {
  /** The acting person: the Hub user, or the Founder for actor 'support'. */
  userId: string;
  organizationId: string;
  /** null for actor 'support': a Founder has no membership in the supported organization. */
  membershipId: string | null;
  /** 'support' is a system role without membership, produced only by authorizeSupport(). */
  role: MembershipRole | 'support';
  applicationId: string;
  actor: 'user' | 'system' | 'support';
  roleInApp?: string | null;
  /** Set only for actor 'support' (Lot 2.5c). */
  founderId?: string;
  supportSessionId?: string;
};

export type AuthorizeParams = {
  sessionToken: string;
  applicationId: string;
  permission?: string;
  resource?: {
    type: string;
    id: string;
    exists: (ctx: TenantContext) => Promise<boolean>;
  };
  actor?: 'user' | 'system' | 'support';
};

// Roles that bypass the application_access table check (ADR-0004)
const IMPLICIT_ACCESS_ROLES = new Set<MembershipRole>(['owner', 'admin']);

export async function authorize(params: AuthorizeParams): Promise<TenantContext> {
  const actor = params.actor ?? 'user';

  // Step 1: validate session
  const headers = new Headers({ authorization: `Bearer ${params.sessionToken}` });
  const session = await getSession(headers);
  if (!session?.userId) throw new NotAuthenticated();
  assertUuid(session.userId, 'session.userId');

  const organizationId = session.activeOrganizationId;
  if (!organizationId) throw new NotMember();

  // Step 2: verify active membership (re-checked on every request, never cached)
  let orgCtx: Awaited<ReturnType<typeof resolveOrgContext>>;
  try {
    orgCtx = await resolveOrgContext({ userId: session.userId, organizationId });
  } catch {
    throw new NotMember();
  }

  const role = orgCtx.role as MembershipRole;
  const membershipId = orgCtx.membershipId;

  // Step 2b: owner must have 2FA enabled
  if (role === 'owner' && !session.twoFactorEnabled) {
    // E29 (best_effort): useful for owner recovery. Other authorize() refusals are not audited (volume).
    await writeAuditEvent(
      {
        category: 'access',
        action: AuditActions.authorizeTwoFactorRequired,
        outcome: 'denied',
        actorType: 'user',
        actorId: session.userId,
        organizationId,
        targetType: 'user',
        targetId: session.userId,
        metadata: { applicationId: params.applicationId, permission: params.permission ?? null },
      },
      { mode: 'best_effort' },
    );
    throw new TwoFactorRequired();
  }

  // Step 3: application enabled (entitlement check — provider mandatory).
  // The platform pseudo-application (Hub-level permissions) is always enabled.
  const entitlementProvider = getEntitlementProvider();
  if (params.applicationId !== PLATFORM_APPLICATION_ID) {
    const enabled = await entitlementProvider.isEnabled(organizationId, params.applicationId);
    if (!enabled) throw new AppNotEnabled();
  }

  // Step 4: application access (skip for owner/admin — ADR-0004)
  let effectiveRole: MembershipRole = role;
  let roleInApp: string | null = null;

  if (!IMPLICIT_ACCESS_ROLES.has(role)) {
    const result = await _checkApplicationAccess(
      organizationId,
      session.userId,
      params.applicationId,
    );
    if (!result.hasAccess) throw new Forbidden();
    roleInApp = result.roleInApp;
    // application_manager without role_in_app = 'manager' → downgrade to member permissions
    effectiveRole = role === 'application_manager' && roleInApp !== 'manager' ? 'member' : role;
  }

  // Step 5: permission check
  if (params.permission) {
    const allowed = await _checkRolePermission(
      effectiveRole,
      params.applicationId,
      params.permission,
    );
    if (!allowed) throw new Forbidden();
  }

  const ctx: TenantContext = {
    userId: session.userId,
    organizationId,
    membershipId,
    role,
    applicationId: params.applicationId,
    actor,
    roleInApp,
  };

  // Step 6: resource existence + optional policy restrictions
  if (params.resource) {
    const exists = await params.resource.exists(ctx);
    if (!exists) throw new ResourceNotFound();
    const restricted = await _checkResourcePolicyRestriction(
      organizationId,
      effectiveRole,
      params.resource.type,
      params.resource.id,
    );
    if (restricted === false) throw new ResourceNotFound();
  }

  return ctx;
}

async function _checkApplicationAccess(
  organizationId: string,
  userId: string,
  applicationId: string,
): Promise<{ hasAccess: boolean; roleInApp: string | null }> {
  const db = getAccessDb();
  return db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
    const row = await tx.applicationAccess.findUnique({
      where: { organizationId_userId_applicationId: { organizationId, userId, applicationId } },
      select: { id: true, roleInApp: true },
    });
    return { hasAccess: row !== null, roleInApp: row?.roleInApp ?? null };
  });
}

async function _checkRolePermission(
  role: MembershipRole,
  applicationId: string,
  permissionName: string,
): Promise<boolean> {
  // Per-call permission cache — scoped to this invocation only.
  const _permCache = new Map<string, boolean>();

  const cacheKey = `${role}:${applicationId}:${permissionName}`;
  const cached = _permCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const db = getAccessDb();
  const result = await db.$transaction(async (tx: any) => {
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

async function _checkResourcePolicyRestriction(
  organizationId: string,
  role: MembershipRole,
  resourceType: string,
  resourceId: string,
): Promise<boolean | null> {
  const db = getAccessDb();
  return db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
    const roleRow = await tx.role.findFirst({
      where: { name: role, organizationId: null },
      select: { id: true },
    });
    if (!roleRow) return null;
    const anyPolicy = await tx.resourceAccessPolicy.findFirst({
      where: { organizationId, roleId: roleRow.id, resourceType },
      select: { id: true },
    });
    if (!anyPolicy) return null; // no policies → no restriction
    const specific = await tx.resourceAccessPolicy.findFirst({
      where: {
        organizationId,
        roleId: roleRow.id,
        resourceType,
        OR: [{ resourceId: null }, { resourceId }],
      },
      select: { id: true },
    });
    return specific !== null;
  });
}

export async function grantApplicationAccess(
  organizationId: string,
  userId: string,
  applicationIds: string[],
  roleInApp?: string,
  actor: { type: 'user' | 'system'; id?: string | null } = { type: 'system' },
): Promise<void> {
  assertUuid(userId, 'userId');
  if (applicationIds.length === 0) return;
  const db = getAccessDb();
  const granted = await db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
    const inserted: string[] = [];
    for (const applicationId of applicationIds) {
      const count = await tx.$executeRaw`
        INSERT INTO access.application_access (organization_id, user_id, application_id, role_in_app)
        VALUES (${organizationId}::uuid, ${userId}::uuid, ${applicationId}, ${roleInApp ?? null})
        ON CONFLICT (organization_id, user_id, application_id) DO NOTHING
      `;
      if (Number(count) > 0) inserted.push(applicationId);
    }
    return inserted;
  });

  // E27 (best_effort): only rows actually created — an idempotent re-grant writes nothing
  if (granted.length > 0) {
    await writeAuditEvent(
      {
        category: 'access',
        action: AuditActions.applicationAccessGranted,
        outcome: 'success',
        actorType: actor.type,
        actorId: actor.type === 'user' ? (actor.id ?? null) : null,
        organizationId,
        targetType: 'user',
        targetId: userId,
        metadata: { applicationIds: granted, roleInApp: roleInApp ?? null },
      },
      { mode: 'best_effort' },
    );
  }
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

/**
 * Orchestrates invitation acceptance + application access grant.
 * organizations.acceptInvitation returns { organizationId, role, applicationIds } without side-effects.
 * access module handles the grant here.
 * If grant fails, membership is still created — the operation can be retried idempotently.
 */
export async function acceptInvitationWithAccess(params: {
  token: string;
  userId: string;
  userEmail: string;
}): Promise<{ organizationId: string; role: string }> {
  assertUuid(params.userId, 'userId');
  const result = await acceptInvitation(params);
  const { organizationId, role, applicationIds } = result;

  if (role !== 'owner' && role !== 'admin' && applicationIds.length > 0) {
    await grantApplicationAccess(organizationId, params.userId, applicationIds, undefined, {
      type: 'user',
      id: params.userId,
    });
  }

  return { organizationId, role };
}

/**
 * Audit log of the session's active organization (TA.9). Requires `audit.log.read` on the
 * platform application — granted to owner and admin only (D4). Rows are filtered by RLS
 * (audit_org_reader + app.organization_id) and by an explicit organization_id predicate.
 */
export async function listAuditLogs(params: {
  sessionToken: string;
  filters?: AuditLogFilters;
}): Promise<AuditLogEntry[]> {
  const ctx = await authorize({
    sessionToken: params.sessionToken,
    applicationId: PLATFORM_APPLICATION_ID,
    permission: 'audit.log.read',
  });
  return readOrganizationAuditLog(ctx.organizationId, params.filters);
}
