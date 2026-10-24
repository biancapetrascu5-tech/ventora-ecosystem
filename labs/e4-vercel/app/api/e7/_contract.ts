// CRM contract — validates that a contactId belongs to the booking org
// Errors: AppNotEnabled, CrossOrgContact
import type { PrismaClient } from '@/generated/multi-client';

const CRM_DISABLED_ORGS = new Set(['e7-org-disabled']);

export type ContractResult =
  | { ok: true }
  | { ok: false; error: 'AppNotEnabled' }
  | { ok: false; error: 'CrossOrgContact'; contactOrgId: string };

export async function validateContact(
  orgId: string,
  contactId: string,
  db: PrismaClient,
): Promise<ContractResult> {
  if (CRM_DISABLED_ORGS.has(orgId)) {
    return { ok: false, error: 'AppNotEnabled' };
  }

  const contact = await db.contact.findUnique({
    where: { id: contactId },
    select: { organizationId: true },
  });

  if (!contact) {
    return { ok: false, error: 'CrossOrgContact', contactOrgId: 'not-found' };
  }

  if (contact.organizationId !== orgId) {
    return { ok: false, error: 'CrossOrgContact', contactOrgId: contact.organizationId };
  }

  return { ok: true };
}
