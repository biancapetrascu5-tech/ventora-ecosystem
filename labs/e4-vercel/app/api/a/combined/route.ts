import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient as CoreClient } from '@/generated/core-client';
import { PrismaClient as BookingClient } from '@/generated/booking-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'fra1';

const corePool = new Pool({ connectionString: process.env.DATABASE_URL_CORE, max: 1 });
const coreAdapter = new PrismaPg(corePool);
const coreDb = new CoreClient({ adapter: coreAdapter });

const bookingPool = new Pool({ connectionString: process.env.DATABASE_URL_BOOKING, max: 1 });
const bookingAdapter = new PrismaPg(bookingPool);
const bookingDb = new BookingClient({ adapter: bookingAdapter });

export async function GET(request: Request) {
  const t0 = performance.now();
  const [orgs, services, appointments] = await Promise.all([
    coreDb.organization.findMany({ take: 10 }),
    bookingDb.service.findMany({ take: 10 }),
    bookingDb.appointment.findMany({ take: 10 }),
  ]);
  const latencyMs = Math.round(performance.now() - t0);

  return Response.json({
    variant: 'A',
    module: 'combined',
    roles: ['lab_core_user', 'lab_booking_user'],
    connectionsNote: '2 clienți Prisma × max=1 = 2 conexiuni pooler per funcție activă',
    organizations: orgs.length,
    services: services.length,
    appointments: appointments.length,
    latencyMs,
    region: request.headers.get('x-vercel-id') ?? 'local',
    timestamp: new Date().toISOString(),
  });
}
