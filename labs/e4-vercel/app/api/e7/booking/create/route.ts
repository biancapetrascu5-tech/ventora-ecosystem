import { db } from '../../_db';
import { validateContact } from '../../_contract';
import { inngest } from '@/inngest/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'fra1';

export async function POST(request: Request) {
  const body = (await request.json()) as {
    orgId: string;
    contactId: string;
    serviceId: string;
    scheduledAt: string;
    appointmentId?: string;
  };

  // 1. CRM contract validation (synchronous)
  const contractResult = await validateContact(body.orgId, body.contactId, db);
  if (!contractResult.ok) {
    return Response.json({ ok: false, contractError: contractResult.error }, { status: 422 });
  }

  const appointmentId = body.appointmentId ?? `e7-apt-${Date.now()}`;
  const outboxEventId = `e7-out-${Date.now()}`;

  // 2. Create appointment + outbox entry in the same transaction
  await db.$transaction(async (tx) => {
    await tx.appointment.create({
      data: {
        id: appointmentId,
        organizationId: body.orgId,
        serviceId: body.serviceId,
        contactId: body.contactId,
        scheduledAt: new Date(body.scheduledAt),
        status: 'pending',
      },
    });

    await tx.outboxEvent.create({
      data: {
        id: outboxEventId,
        eventType: 'lab-booking/appointment.created.v1',
        payload: {
          appointmentId,
          organizationId: body.orgId,
          contactId: body.contactId,
          serviceId: body.serviceId,
          scheduledAt: body.scheduledAt,
          outboxEventId,
        },
      },
    });
  });

  // 3. Relay outbox event to Inngest (best-effort — outside main TX; fails gracefully without dev server)
  const outboxWrittenAt = Date.now();
  let inngestSent = false;
  let inngestError: string | null = null;
  try {
    await inngest.send({
      id: outboxEventId,
      name: 'lab-booking/appointment.created.v1',
      data: {
        appointmentId,
        organizationId: body.orgId,
        contactId: body.contactId,
        serviceId: body.serviceId,
        scheduledAt: body.scheduledAt,
        outboxEventId,
      },
    });
    inngestSent = true;
  } catch (e) {
    inngestError = e instanceof Error ? e.message : String(e);
  }
  const inngestSentMs = Date.now() - outboxWrittenAt;

  return Response.json({
    ok: true,
    appointmentId,
    outboxEventId,
    inngestSent,
    inngestError,
    inngestSentMs,
  });
}
