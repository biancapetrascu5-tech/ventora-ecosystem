/**
 * E1 Varianta A — client Prisma izolat pentru lab-core.
 * Clientul cunoaște DOAR modelele din lab_core.
 * Izolarea e garantată structural: tipul PrismaClient generat nu expune modele din alte module.
 */
import { PrismaClient } from '../../../lab-core/generated/client/index.js';

export const coreDb = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_CORE } },
});

// Demonstrație: accesul la modele din alte module e imposibil la nivel de tip.
// coreDb.contact   → TypeScript error: Property 'contact' does not exist
// coreDb.service   → TypeScript error: Property 'service' does not exist
export type CoreOrganization = Awaited<ReturnType<typeof coreDb.organization.findFirst>>;
