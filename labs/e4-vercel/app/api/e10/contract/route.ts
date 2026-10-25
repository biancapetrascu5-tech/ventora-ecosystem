import { NextRequest, NextResponse } from 'next/server';
import { validateItem } from '../_contract';
import type { TenantContext } from '../_contract';
import { withCatalogContext } from '../_catalog-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'fra1';

// Tests:
//   ?orgId=e10-org-alpha&itemId=e10-item-alpha-1  → ok
//   ?orgId=e10-org-alpha&itemId=e10-item-beta-1   → CrossOrgItem
//   ?orgId=e10-org-disabled&itemId=e10-item-alpha-1 → AppNotEnabled
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get('orgId') ?? '';
  const itemId = searchParams.get('itemId') ?? '';

  if (!orgId || !itemId) {
    return NextResponse.json({ error: 'orgId and itemId required' }, { status: 400 });
  }

  // TenantContext: organizationId vine din sesiune/context, nu de la apelant ca parametru brut
  // În labs, îl simulăm din query param pentru testabilitate
  const ctx: TenantContext = { organizationId: orgId, actor: 'user' };

  const t0 = performance.now();

  const result = await withCatalogContext(orgId, async (tx) => {
    return validateItem(ctx, itemId, tx as unknown as Parameters<typeof validateItem>[2]);
  });

  const ms = Number((performance.now() - t0).toFixed(1));

  return NextResponse.json({ ...result, orgId, itemId, ms });
}
