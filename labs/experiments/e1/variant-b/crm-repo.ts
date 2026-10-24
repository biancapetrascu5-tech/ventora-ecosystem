/**
 * E1 Varianta B — wrapper pentru modulul lab_crm.
 */
import { PrismaClient } from './generated/client/index.js';

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_SUPERUSER } },
});

export const crmRepo = {
  contacts: {
    findMany: (organizationId: string) => db.contact.findMany({ where: { organizationId } }),
    create: (data: { organizationId: string; name: string; email?: string; phone?: string }) =>
      db.contact.create({ data }),
  },
};

export type CrmRepo = typeof crmRepo;
