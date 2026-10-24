import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/runtime-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'fra1';

// Strip Prisma-specific URL params (pgbouncer, connection_limit) — not valid pg params.
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

// Transaction pooler (port 6543): connection released after each transaction.
// lab_runtime NOINHERIT — cannot access module schemas without SET ROLE.
const pool = new Pool({
  connectionString: cleanUrl(process.env.DATABASE_URL_RUNTIME ?? ''),
  max: 1,
});
const adapter = new PrismaPg(pool);
const db = new PrismaClient({ adapter });

export async function GET(request: Request) {
  const t0 = performance.now();

  // Two separate transactions — each module role has access to its own schema only.
  // SET LOCAL ROLE reverts automatically at each transaction end.
  const orgs = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL ROLE lab_core_user');
    return tx.organization.findMany({ take: 10 });
  });

  const { services, appointments } = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL ROLE lab_booking_user');
    const [s, a] = await Promise.all([
      tx.service.findMany({ take: 10 }),
      tx.appointment.findMany({ take: 10 }),
    ]);
    return { services: s, appointments: a };
  });

  const latencyMs = Math.round(performance.now() - t0);

  return Response.json({
    variant: 'C',
    module: 'combined',
    connectRole: 'lab_runtime (NOINHERIT)',
    queryRoles: 'lab_core_user + lab_booking_user (SET LOCAL ROLE, tranzactii separate)',
    pooler: 'transaction pooler port 6543',
    isolationNote:
      'SET LOCAL ROLE reverts at transaction end — lab_runtime cannot access module schemas directly',
    organizations: orgs.length,
    services: services.length,
    appointments: appointments.length,
    latencyMs,
    region: request.headers.get('x-vercel-id') ?? 'local',
    timestamp: new Date().toISOString(),
  });
}
