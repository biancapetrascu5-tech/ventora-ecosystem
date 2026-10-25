import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'fra1';

function cleanUrl(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.delete('pgbouncer');
    u.searchParams.delete('connection_limit');
    return u.toString();
  } catch {
    return url;
  }
}

// Setup date de test E10 — idempotent (ON CONFLICT DO NOTHING)
// Folosește superuser pentru inserare directă
export async function POST(req: NextRequest) {
  const body = (await req.json()) as Record<string, unknown>;
  const action = body.action as string;

  const pool = new Pool({
    connectionString: cleanUrl(process.env.DATABASE_URL_SUPERUSER ?? ''),
    max: 1,
  });

  try {
    if (action === 'seed') {
      await pool.query(`
        INSERT INTO lab_core.organizations (id, name, "createdAt") VALUES
          ('e10-org-alpha',    'E10 Alpha Shop',    now()),
          ('e10-org-beta',     'E10 Beta Store',    now()),
          ('e10-org-disabled', 'E10 No-Catalog Org', now())
        ON CONFLICT (id) DO NOTHING
      `);

      await pool.query(`
        INSERT INTO lab_catalog.catalog_items (id, "organizationId", name, description, active, "createdAt") VALUES
          ('e10-item-alpha-1', 'e10-org-alpha', 'Alpha Widget',  'Widget de test alpha', true, now()),
          ('e10-item-alpha-2', 'e10-org-alpha', 'Alpha Gadget',  'Gadget de test alpha', true, now()),
          ('e10-item-beta-1',  'e10-org-beta',  'Beta Product',  'Produs de test beta',  true, now())
        ON CONFLICT (id) DO NOTHING
      `);

      return NextResponse.json({ ok: true, action: 'seed' });
    }

    if (action === 'cleanup') {
      await pool.query(`
        DELETE FROM lab_catalog.catalog_items WHERE id LIKE 'e10-%';
        DELETE FROM lab_catalog.outbox_events WHERE id LIKE 'e10-%';
        DELETE FROM lab_core.organizations WHERE id LIKE 'e10-%';
      `);
      return NextResponse.json({ ok: true, action: 'cleanup' });
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } finally {
    await pool.end();
  }
}
