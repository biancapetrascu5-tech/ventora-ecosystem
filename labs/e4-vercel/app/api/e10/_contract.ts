// Contract local pentru E10 — copie din labs/lab-catalog/src/contract/index.ts
// Permite importul în e4-vercel fără path cross-project (ARCHITECTURE §11.1)
// TenantContext: organizationId vine din sesiune/authorize(), nu de la apelant

export interface TenantContext {
  organizationId: string;
  userId?: string;
  actor?: 'user' | 'system' | 'support';
}

export type ValidateItemResult =
  | { ok: true }
  | { ok: false; error: 'AppNotEnabled' }
  | { ok: false; error: 'CrossOrgItem'; itemOrgId: string };

// Organizații fără modulul catalog activat (simulare — în producție: registrul comercial)
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
