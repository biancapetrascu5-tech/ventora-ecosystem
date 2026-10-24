import { inngest } from './client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/multi-client';

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

const pool = new Pool({ connectionString: cleanUrl(process.env.DATABASE_URL_MULTI ?? ''), max: 3 });
const adapter = new PrismaPg(pool);
const db = new PrismaClient({ adapter });

// Main CRM consumer — retries: 2 means 3 total attempts, then onFailure fires
export const crmAppointmentHandler = inngest.createFunction(
  {
    id: 'crm-appointment-created',
    retries: 2,
    triggers: [{ event: 'lab-booking/appointment.created.v1' }],
    onFailure: async ({ event, error }: { event: unknown; error: Error }) => {
      console.error('[DLQ] crm-appointment-created failed permanently:', error.message);
    },
  },
  async ({ event, step }) => {
    const data = event.data as {
      appointmentId: string;
      organizationId: string;
      contactId: string;
      serviceId: string;
      scheduledAt: string;
      outboxEventId: string;
    };

    await step.run('mark-outbox-processed', async () => {
      await db.outboxEvent.update({
        where: { id: data.outboxEventId },
        data: { processedAt: new Date(), attempts: { increment: 1 } },
      });
    });

    await step.run('sync-to-crm', async () => {
      const contact = await db.contact.findUnique({ where: { id: data.contactId } });
      return { contactId: data.contactId, contactName: contact?.name ?? 'unknown' };
    });

    return { ok: true, appointmentId: data.appointmentId };
  },
);

// Always-failing consumer — tests dead-letter after 3 attempts
export const crmAppointmentHandlerFailing = inngest.createFunction(
  {
    id: 'crm-appointment-created-failing',
    retries: 2,
    triggers: [{ event: 'lab-booking/appointment.created.v1.test-dlq' }],
    onFailure: async ({ event }: { event: unknown }) => {
      console.error('[DLQ] failing handler exhausted:', JSON.stringify(event));
    },
  },
  async ({ event }) => {
    const data = event.data as { outboxEventId: string };
    await db.outboxEvent.update({
      where: { id: data.outboxEventId },
      data: { attempts: { increment: 1 } },
    });
    throw new Error(`Simulated CRM failure for outbox ${data.outboxEventId}`);
  },
);
