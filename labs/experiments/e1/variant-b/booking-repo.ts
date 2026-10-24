/**
 * E1 Varianta B — wrapper pentru modulul lab_booking.
 * Clientul unic e importat dintr-un singleton partajat; wraperul
 * expune doar operații pentru booking, fără a rupe izolarea prin tip.
 */
import { PrismaClient } from './generated/client/index.js';

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_SUPERUSER } },
});

export const bookingRepo = {
  services: {
    findMany: (organizationId: string) => db.service.findMany({ where: { organizationId } }),
    create: (data: { organizationId: string; name: string; durationMinutes: number }) =>
      db.service.create({ data }),
  },
  appointments: {
    findMany: (organizationId: string) => db.appointment.findMany({ where: { organizationId } }),
    create: (data: {
      organizationId: string;
      serviceId: string;
      contactId: string;
      scheduledAt: Date;
    }) => db.appointment.create({ data }),
  },
};

export type BookingRepo = typeof bookingRepo;
