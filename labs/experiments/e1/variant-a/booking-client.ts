/**
 * E1 Varianta A — client Prisma izolat pentru lab-booking.
 * Clientul cunoaște DOAR modelele din lab_booking.
 */
import { PrismaClient } from '../../../lab-booking/generated/client/index.js';

export const bookingDb = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_BOOKING } },
});

// bookingDb.contact      → TypeScript error (nu există în schemă)
// bookingDb.organization → TypeScript error (nu există în schemă)
export type BookingAppointment = Awaited<ReturnType<typeof bookingDb.appointment.findFirst>>;
