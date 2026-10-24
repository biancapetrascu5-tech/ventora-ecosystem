/**
 * E1 — test import interzis pentru Varianta B.
 * Încearcă să acceseze modele din alt modul pe clientul unic.
 * Așteptam: TypeScript NU generează eroare — clientul cunoaște TOATE modelele.
 * Izolarea lipsește la nivel de tip; trebuie asigurată prin lint/convenție.
 */
import { PrismaClient } from './generated/client/index.js';

const db = new PrismaClient();

// Varianta B: clientul unic cunoaște TOATE modelele din toate schemele
// Un modul "booking" poate accesa contact sau organization fără eroare TypeScript
const org = await db.organization.findFirst(); // TypeScript: OK — izolarea LIPSEȘTE
const contact = await db.contact.findFirst(); // TypeScript: OK — izolarea LIPSEȘTE

// Fără lint boundaries, codul compilează chiar dacă e o violare arhitecturală
export {};
