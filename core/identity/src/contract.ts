import { hubAuth } from './auth';
import type { OrgContext } from '@ventora/organizations';

// Pass null to clear, or a verified OrgContext from resolveOrgContext to set.
export async function setSessionActiveOrganization(
  sessionToken: string,
  orgContext: OrgContext | null,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (hubAuth.api as any).updateSession({
    body: { activeOrganizationId: orgContext?.organizationId ?? null },
    headers: { authorization: `Bearer ${sessionToken}` },
  });
}
