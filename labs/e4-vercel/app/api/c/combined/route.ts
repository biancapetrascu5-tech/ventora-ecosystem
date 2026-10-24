import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/runtime-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'fra1';

// Transaction pooler (port 6543): connections released after each transaction.
// lab_runtime has NOINHERIT — it cannot access module schemas directly.
// SET LOCAL ROLE grants module-role access for the current transaction only.
const pool = new Pool({ connectionString: process.env.DATABASE_URL_RUNTIME, max: 1 });
const adapter = new PrismaPg(pool);
const db = new PrismaClient({ adapter });

export async function GET(request: Request) {
  const t0 = performance.now();

  const { orgs, services, appointments } = await db.$transaction(async (tx) => {
    // Activate booking + core access for this transaction only.
    // SET LOCAL ROLE reverts automatically at transaction end.
    await tx.$executeRawUnsafe('SET LOCAL ROLE lab_booking_user');
    const [orgsResult, servicesResult, appointmentsResult] = await Promise.all([
      tx.organization.findMany({ take: 10 }),
      tx.service.findMany({ take: 10 }),
      tx.appointment.findMany({ take: 10 }),
    ]);
    return { orgs: orgsResult, services: servicesResult, appointments: appointmentsResult };
  });

  const latencyMs = Math.round(performance.now() - t0);

  return Response.json({
    variant: 'C',
    module: 'combined',
    connectRole: 'lab_runtime (NOINHERIT)',
    queryRole: 'lab_booking_user (SET LOCAL ROLE per transaction)',
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
