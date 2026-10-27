import { hubAuth } from './auth.js';

/**
 * Updates the session's active organization.
 * Pass null to clear, or a verified OrgContext obtained from resolveOrgContext
 * (@ventora/organizations) to set. The OrgContext acts as proof that membership
 * was verified in the DB before this call — callers MUST NOT pass a self-constructed
 * object; always use resolveOrgContext.
 */
export async function setSessionActiveOrganization(
  sessionToken: string,
  orgContext: { userId: string; organizationId: string; role: string } | null,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (hubAuth.api as any).updateSession({
    body: { activeOrganizationId: orgContext?.organizationId ?? null },
    headers: { authorization: `Bearer ${sessionToken}` },
  });
}
