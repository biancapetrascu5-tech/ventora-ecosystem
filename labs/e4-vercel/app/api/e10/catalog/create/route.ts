import { NextRequest, NextResponse } from 'next/server';
import { withCatalogContext } from '../../_catalog-db';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'fra1';

// POST body: { orgId, name, description? }
// Creează un CatalogItem + outbox event în aceeași tranzacție (E7 pattern)
export async function POST(request: NextRequest) {
  const body = (await request.json()) as Record<string, unknown>;
  const orgId = body.orgId as string;
  const name = body.name as string;
  const description = (body.description as string | undefined) ?? null;

  if (!orgId || !name) {
    return NextResponse.json({ error: 'orgId and name required' }, { status: 400 });
  }

  const t0 = performance.now();

  const result = await withCatalogContext(orgId, async (tx) => {
    const item = await tx.catalogItem.create({
      data: {
        organizationId: orgId,
        name,
        description,
        active: true,
      },
    });

    const eventId = randomUUID();
    await tx.catalogOutboxEvent.create({
      data: {
        id: eventId,
        eventType: 'lab-catalog.item.created.v1',
        payload: {
          itemId: item.id,
          organizationId: orgId,
          name: item.name,
        },
      },
    });

    return { item, eventId };
  });

  const ms = Number((performance.now() - t0).toFixed(1));

  return NextResponse.json({ ok: true, ...result, ms });
}
