import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/multi-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'fra1';

const pool = new Pool({ connectionString: process.env.DATABASE_URL_MULTI, max: 1 });
const adapter = new PrismaPg(pool);
const db = new PrismaClient({ adapter });

export async function GET(request: Request) {
  const t0 = performance.now();
  const [orgs, services, contacts] = await Promise.all([
    db.organization.findMany({ take: 10 }),
    db.service.findMany({ take: 10 }),
    db.contact.findMany({ take: 10 }),
  ]);
  const latencyMs = Math.round(performance.now() - t0);

  return Response.json({
    variant: 'B',
    module: 'combined',
    role: 'lab_multi_user',
    isolationNote:
      'lab_multi_user are acces la toate 3 schemele — izolarea modulelor e asigurata doar de cod (lint + wrapper)',
    organizations: orgs.length,
    services: services.length,
    contacts: contacts.length,
    latencyMs,
    region: request.headers.get('x-vercel-id') ?? 'local',
    timestamp: new Date().toISOString(),
  });
}
