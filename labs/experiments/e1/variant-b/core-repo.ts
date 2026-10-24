/**
 * E1 Varianta B — wrapper pentru modulul lab_core.
 * Un singur PrismaClient cunoaște toate schemele, dar fiecare
 * modul expune doar propriile operații prin wrapper.
 * Izolarea nu e structurală (tipuri) — e contractuală (lint + wrapper).
 */
import { PrismaClient } from './generated/client/index.js';

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_SUPERUSER } },
});

export const coreRepo = {
  organizations: {
    findMany: () => db.organization.findMany(),
    create: (data: { name: string }) => db.organization.create({ data }),
  },
  users: {
    findByEmail: (email: string) => db.user.findUnique({ where: { email } }),
    create: (data: { email: string; name: string }) => db.user.create({ data }),
  },
};

// NOTĂ: Nimic nu împiedică tehnic un apel db.contact.findMany() din acest fișier.
// Izolarea depinde de disciplina de cod și de reguli lint (no-cross-module-db-access).
export type CoreRepo = typeof coreRepo;
