import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/core-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'fra1';

const pool = new Pool({ connectionString: process.env.DATABASE_URL_CORE, max: 1 });
const adapter = new PrismaPg(pool);
const db = new PrismaClient({ adapter });

export async function GET(request: Request) {
  const t0 = performance.now();
  const orgs = await db.organization.findMany({ take: 10 });
  const latencyMs = Math.round(performance.now() - t0);

  return Response.json({
    variant: 'A',
    module: 'core',
    role: 'lab_core_user',
    organizations: orgs.length,
    latencyMs,
    region: request.headers.get('x-vercel-id') ?? 'local',
    timestamp: new Date().toISOString(),
  });
}
