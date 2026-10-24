import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/runtime-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'fra1';

// RLS overhead benchmark: variant "rls" (with set_config) vs "norls" (without set_config).
// Both paths use SET LOCAL ROLE lab_booking_user and execute service.findMany().
// Difference: set_config call + RLS policy matches rows (rls: 2 rows) vs no match (norls: 0 rows).
// True RLS bypass requires BYPASSRLS attribute; this measures set_config + data-return overhead.

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

const pool = new Pool({
  connectionString: cleanUrl(process.env.DATABASE_URL_RUNTIME ?? ''),
  max: 1,
});
const adapter = new PrismaPg(pool);
const db = new PrismaClient({ adapter });

export async function GET(request: Request) {
  const variant = new URL(request.url).searchParams.get('v') ?? 'rls';
  const t0 = performance.now();

  let rowsReturned = 0;

  if (variant === 'rls') {
    // With org context: RLS filters to e4-org-alpha rows (2 services)
    const rows = await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE lab_booking_user');
      await tx.$executeRaw`SELECT set_config('app.organization_id', 'e4-org-alpha', true)`;
      return tx.service.findMany();
    });
    rowsReturned = rows.length;
  } else {
    // Without org context: RLS with empty GUC → 0 rows (same policy evaluation path)
    const rows = await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE lab_booking_user');
      return tx.service.findMany();
    });
    rowsReturned = rows.length;
  }

  const latencyMs = Math.round(performance.now() - t0);

  return Response.json({
    variant,
    rowsReturned,
    latencyMs,
    region: request.headers.get('x-vercel-id') ?? 'local',
    timestamp: new Date().toISOString(),
  });
}
