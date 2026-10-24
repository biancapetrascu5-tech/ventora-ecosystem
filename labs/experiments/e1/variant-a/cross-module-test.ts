/**
 * E1 — test import interzis pentru Varianta A.
 * Încearcă să acceseze modele din alt modul pe clientul booking.
 * Așteptam: eroare TypeScript la compilare (izolare structurală).
 */
import { bookingDb } from './booking-client.js';

// EROARE TypeScript așteptată: Property 'organization' does not exist on type PrismaClient
// bookingDb cunoaște DOAR modele din lab_booking (Service, Appointment)
const org = await bookingDb.organization.findFirst(); // eroare TS

// EROARE TypeScript așteptată: Property 'contact' does not exist
const contact = await bookingDb.contact.findFirst(); // eroare TS

export {};
