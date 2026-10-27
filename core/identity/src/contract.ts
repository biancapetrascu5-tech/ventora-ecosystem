import { hubAuth } from './auth.js';

export async function setSessionActiveOrganization(
  sessionToken: string,
  organizationId: string | null,
): Promise<void> {
  await hubAuth.api.updateSession({
    body: { activeOrganizationId: organizationId ?? undefined },
    headers: { authorization: `Bearer ${sessionToken}` },
  });
}
