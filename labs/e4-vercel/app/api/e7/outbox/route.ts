import { db } from '../_db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'fra1';

export async function GET() {
  const events = await db.outboxEvent.findMany({
    where: { eventType: { startsWith: 'lab-booking/' } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return Response.json({ events });
}
