import { hubAuth } from './auth';
import type { OrgContext } from '@ventora/organizations';
import { AuditActions, writeAuditEvent } from '@ventora/audit';

// Pass null to clear, or a verified OrgContext from resolveOrgContext to set.
export async function setSessionActiveOrganization(
  sessionToken: string,
  orgContext: OrgContext | null,
): Promise<void> {
  const headers = { authorization: `Bearer ${sessionToken}` };
  const current = await hubAuth.api.getSession({ headers: new Headers(headers) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (hubAuth.api as any).updateSession({
    body: { activeOrganizationId: orgContext?.organizationId ?? null },
    headers,
  });

  // E7 (best_effort, D2)
  const userId = orgContext?.userId ?? current?.session.userId ?? null;
  await writeAuditEvent(
    {
      category: 'identity',
      action: AuditActions.activeOrganizationChanged,
      outcome: 'success',
      actorType: userId ? 'user' : 'anonymous',
      actorId: userId,
      organizationId: orgContext?.organizationId ?? null,
      targetType: 'organization',
      targetId: orgContext?.organizationId ?? null,
      metadata: {
        previousOrganizationId:
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (current?.session as any)?.activeOrganizationId ?? null,
        cleared: orgContext === null,
      },
    },
    { mode: 'best_effort' },
  );
}
