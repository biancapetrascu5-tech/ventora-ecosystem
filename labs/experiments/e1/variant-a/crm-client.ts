/**
 * E1 Varianta A — client Prisma izolat pentru lab-crm.
 * Clientul cunoaște DOAR modelele din lab_crm.
 */
import { PrismaClient } from '../../../lab-crm/generated/client/index.js';

export const crmDb = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_CRM } },
});

export type CrmContact = Awaited<ReturnType<typeof crmDb.contact.findFirst>>;
