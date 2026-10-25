import { NextRequest, NextResponse } from 'next/server';
import { withCatalogContext } from '../_catalog-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'fra1';

// Setup date de test E10 — idempotent (upsert via try/catch)
// Folosește DATABASE_URL_RUNTIME cu SET LOCAL ROLE lab_catalog_rw + set_config per org
export async function POST(req: NextRequest) {
  const body = (await req.json()) as Record<string, unknown>;
  const action = body.action as string;

  if (action === 'seed') {
    // Seed pentru org-alpha
    await withCatalogContext('e10-org-alpha', async (tx) => {
      await tx.$executeRaw`
        INSERT INTO lab_catalog.catalog_items (id, "organizationId", name, description, active, "createdAt")
        VALUES
          ('e10-item-alpha-1', 'e10-org-alpha', 'Alpha Widget',  'Widget de test alpha', true, now()),
          ('e10-item-alpha-2', 'e10-org-alpha', 'Alpha Gadget',  'Gadget de test alpha', true, now())
        ON CONFLICT (id) DO NOTHING
      `;
    });

    // Seed pentru org-beta
    await withCatalogContext('e10-org-beta', async (tx) => {
      await tx.$executeRaw`
        INSERT INTO lab_catalog.catalog_items (id, "organizationId", name, description, active, "createdAt")
        VALUES
          ('e10-item-beta-1', 'e10-org-beta', 'Beta Product', 'Produs de test beta', true, now())
        ON CONFLICT (id) DO NOTHING
      `;
    });

    return NextResponse.json({ ok: true, action: 'seed' });
  }

  if (action === 'cleanup') {
    // Cleanup: șterge pe org-by-org (RLS permite doar rândurile proprii)
    await withCatalogContext('e10-org-alpha', async (tx) => {
      await tx.$executeRaw`DELETE FROM lab_catalog.catalog_items WHERE id LIKE 'e10-%alpha%'`;
      await tx.$executeRaw`DELETE FROM lab_catalog.outbox_events WHERE id LIKE 'e10-%'`;
    });
    await withCatalogContext('e10-org-beta', async (tx) => {
      await tx.$executeRaw`DELETE FROM lab_catalog.catalog_items WHERE id LIKE 'e10-%beta%'`;
    });

    return NextResponse.json({ ok: true, action: 'cleanup' });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
