/**
 * staging-migrate.mjs — Prisma migrate deploy pe Supabase staging
 *
 * Rulare:
 *   cd C:\Projects\ventora-ecosystem\labs
 *   npm run lab:staging:migrate
 *
 * Citește DATABASE_URL_SUPERUSER NUMAI din labs/.env.local (nu din .env, nu din mediu).
 * Refuză dacă variabila lipsește sau dacă hostul conține "localhost".
 * Afișează hostul și baza de date țintă (fără parolă) înainte de a rula.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const labsDir = path.resolve(__dirname, '..');
const envFile = path.join(labsDir, '.env.local');

// ── 1. Parsează .env.local direct (fără a atinge process.env) ───────────────
if (!fs.existsSync(envFile)) {
  console.error(`\nEroare: lipseste fisierul labs/.env.local`);
  console.error(
    `Creaza-l cu: DATABASE_URL_SUPERUSER=postgres://postgres.<ref>:<PAROLA>@<POOLER-HOST>:5432/postgres`,
  );
  process.exit(1);
}
const parsedEnv = dotenv.parse(fs.readFileSync(envFile));
const url = parsedEnv['DATABASE_URL_SUPERUSER'];

if (!url) {
  console.error(`\nEroare: DATABASE_URL_SUPERUSER lipseste din labs/.env.local`);
  process.exit(1);
}

// ── 2. Validare: nu localhost ────────────────────────────────────────────────
let parsed;
try {
  parsed = new URL(url);
} catch {
  console.error(`\nEroare: DATABASE_URL_SUPERUSER nu este un URL valid`);
  process.exit(1);
}

const host = parsed.hostname.toLowerCase();
if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local')) {
  console.error(
    `\nEroare: DATABASE_URL_SUPERUSER pointeaza spre un host local — nu Docker, ci Supabase staging este tinta.`,
  );
  console.error(`Host detectat: ${parsed.hostname}`);
  console.error(
    `Verifica labs/.env.local si asigura-te ca folosesti session pooler-ul Supabase (port 5432).`,
  );
  process.exit(1);
}

// ── 3. Afisare tinta (fara parola) ──────────────────────────────────────────
const dbName = parsed.pathname.replace(/^\//, '') || 'postgres';
console.log(`\n============================================================`);
console.log(`  Staging migrate — Supabase`);
console.log(`  Host:     ${parsed.hostname}:${parsed.port}`);
console.log(`  Baza:     ${dbName}`);
console.log(`  User:     ${parsed.username}`);
console.log(`  Schemas:  lab_core, lab_booking, lab_crm`);
console.log(`============================================================\n`);

// ── 4. migrate deploy pentru fiecare schema ──────────────────────────────────
const schemas = [
  { config: path.join(labsDir, 'lab-core', 'prisma.config.ts'), label: 'lab_core' },
  { config: path.join(labsDir, 'lab-booking', 'prisma.config.ts'), label: 'lab_booking' },
  { config: path.join(labsDir, 'lab-crm', 'prisma.config.ts'), label: 'lab_crm' },
];

const prismaBin = path.join(labsDir, 'node_modules', 'prisma', 'build', 'index.js');

for (const { config, label } of schemas) {
  console.log(`\n─── Migrate: ${label} ───`);
  try {
    execFileSync(process.execPath, [prismaBin, 'migrate', 'deploy', '--config', config], {
      cwd: labsDir,
      // Pasam URL-ul explicit; suprascrie orice variabila din mediu sau .env
      env: { ...process.env, DATABASE_URL_SUPERUSER: url },
      stdio: 'inherit',
    });
  } catch (err) {
    console.error(`\nEroare la migrate pentru ${label}. Verifica mesajul de mai sus.`);
    process.exit(1);
  }
}

console.log(`\n============================================================`);
console.log(`  Migratiil aplicate cu succes pe Supabase staging.`);
console.log(`  Pasul urmator: npm run lab:staging:seed`);
console.log(`============================================================\n`);
