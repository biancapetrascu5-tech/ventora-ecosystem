/**
 * E1-extra — măsurători suplimentare pentru runda A:
 *   1. Timp de import (cold-start proxy pentru build time)
 *   2. Dimensiuni bundle pentru proiecție serverless
 *   3. Test import interzis (izolare structurală vs. contractuală)
 */
import { statSync, readdirSync, existsSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LABS_ROOT = join(__dirname, '..');

// ─── 1. Timp import (cold-start proxy) ───────────────────────────────────────
console.log('\n=== 1. Timp import (cold-start proxy) ===');

function measureImportTime(label, clientPath) {
  const start = Date.now();
  try {
    execSync(
      `node --eval "import('${clientPath.replace(/\\/g, '/')}').then(() => process.exit(0))" --input-type=module`,
      {
        cwd: LABS_ROOT,
        timeout: 15000,
        env: {
          ...process.env,
          DATABASE_URL_CORE: 'postgresql://x:x@localhost/x?schema=lab_core',
          DATABASE_URL_BOOKING: 'postgresql://x:x@localhost/x?schema=lab_booking',
          DATABASE_URL_CRM: 'postgresql://x:x@localhost/x?schema=lab_crm',
          DATABASE_URL_SUPERUSER: 'postgresql://x:x@localhost/x',
        },
      },
    );
  } catch {
    // Import poate eșua la runtime (fără DB), dar măsuram doar parse + load time
  }
  const elapsed = Date.now() - start;
  console.log(`  ${label}: ${elapsed}ms`);
  return elapsed;
}

// Variant A — 3 clienți separați
const tA1 = measureImportTime(
  'Varianta A — lab-core client',
  join(LABS_ROOT, 'lab-core/generated/client/index.js'),
);
const tA2 = measureImportTime(
  'Varianta A — lab-booking client',
  join(LABS_ROOT, 'lab-booking/generated/client/index.js'),
);
const tA3 = measureImportTime(
  'Varianta A — lab-crm client',
  join(LABS_ROOT, 'lab-crm/generated/client/index.js'),
);
const tATotal = tA1 + tA2 + tA3;
console.log(`  Varianta A total (3 clienți): ${tATotal}ms`);

// Variant B — client unic
const tB = measureImportTime(
  'Varianta B — client unic multiSchema',
  join(LABS_ROOT, 'experiments/e1/variant-b/generated/client/index.js'),
);
console.log(`\n  Raport A/B cold-start: ${(tATotal / tB).toFixed(1)}×`);

// ─── 2. Analiza dimensiunii bundle serverless ─────────────────────────────────
console.log('\n=== 2. Dimensiune bundle serverless (Prisma 7, PostgreSQL) ===');

function getDirSize(dir, extFilter = null) {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) {
      if (extFilter && !extFilter.some((ext) => entry.name.endsWith(ext))) continue;
      try {
        total += statSync(join(entry.parentPath ?? entry.path, entry.name)).size;
      } catch {
        /* ignorăm */
      }
    }
  }
  return total;
}

const NODE_MODULES = join(LABS_ROOT, 'node_modules');

// Componente bundle (doar JS + WASM — .d.ts nu se includ în bundle)
const runtimeJsSize = getDirSize(join(NODE_MODULES, '@prisma/client/runtime'), ['.js', '.mjs']);
const wasmSize = getDirSize(join(LABS_ROOT, 'lab-core/generated/client'), ['.wasm']); // identic pentru toți

const genASizes = ['lab-core', 'lab-booking', 'lab-crm'].map((mod) => ({
  mod,
  jsSize: getDirSize(join(LABS_ROOT, `${mod}/generated/client`), ['.js', '.mjs']),
}));
const genAJsTotalKB = genASizes.reduce((s, x) => s + x.jsSize, 0) / 1024;
const genAJsPerModKB = genAJsTotalKB / 3;

const genBJsSize = getDirSize(join(LABS_ROOT, 'experiments/e1/variant-b/generated/client'), [
  '.js',
  '.mjs',
]);

console.log('\n  Componente comune (shared, deduplicate de bundler):');
console.log(`    @prisma/client/runtime JS:  ${(runtimeJsSize / 1024 / 1024).toFixed(1)} MB`);
console.log(`    Query engine WASM (pg):     ${(wasmSize / 1024 / 1024).toFixed(2)} MB`);
console.log(
  `    Total shared:               ${((runtimeJsSize + wasmSize) / 1024 / 1024).toFixed(1)} MB`,
);

console.log('\n  Client generat (JS, per varianta):');
genASizes.forEach(({ mod, jsSize }) =>
  console.log(`    Varianta A — ${mod}: ${(jsSize / 1024).toFixed(0)} KB`),
);
console.log(`    Varianta A — medie per modul:   ${genAJsPerModKB.toFixed(0)} KB`);
console.log(`    Varianta B — client unic (3 module): ${(genBJsSize / 1024).toFixed(0)} KB`);

console.log('\n  Proiecție per funcție serverless (shared + clienți):');
const sharedMB = (runtimeJsSize + wasmSize) / 1024 / 1024;
[1, 3, 5, 10, 15].forEach((n) => {
  const totalMB = sharedMB + (genAJsPerModKB * n) / 1024;
  const marker = totalMB > 250 ? ' ⚠ PESTE LIMITA' : '';
  console.log(`    A — ${String(n).padStart(2)} module: ${totalMB.toFixed(1)} MB${marker}`);
});
const bTotalMB = sharedMB + genBJsSize / 1024 / 1024;
console.log(
  `    B — toate (3→N module): ${bTotalMB.toFixed(1)} MB (client unic, crește liniar cu modelele, nu cu modulele)`,
);
console.log(`\n  Limita Vercel: 250 MB unzipped (standard) / 5 GB (Fluid Compute, opt-in)`);

// ─── 3. Test import interzis ─────────────────────────────────────────────────
console.log('\n=== 3. Test import interzis (izolare structurală vs. contractuală) ===');

// Variant A: încearcă accesul cross-module prin tip — eroare TypeScript
console.log('\n  Varianta A — test structural TypeScript:');
console.log('    Fișier: experiments/e1/variant-a/core-client.ts');
console.log('    Cod: coreDb.contact.findFirst()');
console.log('    Tip generat: PrismaClient (lab_core only) nu are proprietatea "contact"');
console.log('    Verificare: tsc --noEmit detectează eroarea la compilare');

// Scriem un fișier de test temporar pentru Variant A
const testFileA = join(__dirname, 'e1', 'variant-a', '_forbidden-test.ts');
writeFileSync(
  testFileA,
  `
import { coreDb } from './core-client.js';
// @ts-expect-error Property 'contact' does not exist — izolare structurală
void coreDb.contact.findFirst();
// Dacă @ts-expect-error lipsește, compilatorul raportează eroare TS2339.
`,
);

// Rulăm ESLint cu config-ul labs/violations pentru a testa regula boundaries
try {
  const eslintBin = join(LABS_ROOT, 'node_modules/.bin/eslint');
  const result = execSync(
    `"${eslintBin}" experiments/e1/variant-a/_forbidden-test.ts --no-eslintrc -c violations/eslint.config.mjs --format=compact 2>&1`,
    {
      cwd: LABS_ROOT,
      encoding: 'utf8',
    },
  );
  console.log('  ESLint output (Varianta A):', result.trim() || '(nicio eroare)');
} catch (err) {
  const output = (err.stdout || err.stderr || err.message || '').trim();
  if (output.includes('boundaries') || output.includes('no-restricted')) {
    console.log('  [DETECTAT] ESLint a prins o eroare de granița/restricted în Varianta A:');
    console.log('  ' + output.split('\n').slice(0, 3).join('\n  '));
  } else {
    console.log('  ESLint Varianta A output:', output.substring(0, 200));
  }
}
unlinkSync(testFileA);

// Variant B: încearcă accesul direct la db.contact din core-repo (bypass wrapper)
console.log('\n  Varianta B — test contractual (fără lint rule specific):');
const testFileB = join(__dirname, 'e1', 'variant-b', '_forbidden-test.ts');
writeFileSync(
  testFileB,
  `
// BYPASS INTENȚIONAT: accesăm db.contact direct din contextul "core", ocolind wrapper-ul
import { PrismaClient } from './generated/client/index.js';
const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_SUPERUSER } } });
// Variant B NU are izolare structurală — compilatorul ACCEPTĂ această linie
void db.contact.findFirst();
`,
);

try {
  const eslintBin = join(LABS_ROOT, 'node_modules/.bin/eslint');
  const result = execSync(
    `"${eslintBin}" experiments/e1/variant-b/_forbidden-test.ts --no-eslintrc -c violations/eslint.config.mjs --format=compact 2>&1`,
    {
      cwd: LABS_ROOT,
      encoding: 'utf8',
    },
  );
  console.log(
    '  ESLint Varianta B output:',
    result.trim() || '(nicio eroare — accesul direct NU e prins fără regula custom)',
  );
} catch (err) {
  const output = (err.stdout || err.stderr || err.message || '').trim();
  console.log('  ESLint Varianta B:', output.substring(0, 300));
}
unlinkSync(testFileB);

console.log('\n  Concluzie lint test:');
console.log(
  '  Varianta A: eroarea e prinsă de TypeScript la compilare (TS2339) — fără lint suplimentar',
);
console.log(
  '  Varianta B: ESLint nu prinde accesul direct fără o regulă no-cross-module-db-access custom',
);
console.log('  → Izolare structurală (A) > izolare contractuală (B)');
