// Contract public al modulului lab-catalog
// Singurul import permis din afara modulului (ARCHITECTURE §3, §11.1)
//
// TenantContext: organizația vine din sesiune/context, nu de la apelant ca parametru brut.
// Apelantul nu poate injecta organizationId prin parametrii cererii.

export interface TenantContext {
  organizationId: string;
  userId?: string;
  actor?: 'user' | 'system' | 'support';
}

export type ValidateItemResult =
  | { ok: true }
  | { ok: false; error: 'AppNotEnabled' }
  | { ok: false; error: 'CrossOrgItem'; itemOrgId: string };

// Simulate AppNotEnabled: orgs fără modulul catalog activat
const CATALOG_DISABLED_ORGS = new Set(['e10-org-disabled']);

export async function validateItem(
  ctx: TenantContext,
  itemId: string,
  db: {
    catalogItem: {
      findUnique: (args: {
        where: { id: string };
        select: { organizationId: boolean };
      }) => Promise<{ organizationId: string } | null>;
    };
  },
): Promise<ValidateItemResult> {
  if (CATALOG_DISABLED_ORGS.has(ctx.organizationId)) {
    return { ok: false, error: 'AppNotEnabled' };
  }

  const item = await db.catalogItem.findUnique({
    where: { id: itemId },
    select: { organizationId: true },
  });

  if (!item) {
    return { ok: false, error: 'CrossOrgItem', itemOrgId: 'not-found' };
  }

  if (item.organizationId !== ctx.organizationId) {
    return { ok: false, error: 'CrossOrgItem', itemOrgId: item.organizationId };
  }

  return { ok: true };
}
