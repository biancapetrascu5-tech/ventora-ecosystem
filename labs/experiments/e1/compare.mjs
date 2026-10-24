/**
 * E1 — compară Varianta A (3 clienți separați) cu Varianta B (1 client multiSchema).
 * Măsoară: timp generate, dimensiune bundle generat, număr fișiere generate, pași setup.
 */
import { execSync, spawnSync } from 'child_process';
import { statSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LABS_ROOT = join(__dirname, '..', '..');

function getDirSize(dirPath) {
  if (!existsSync(dirPath)) return 0;
  let total = 0;
  for (const entry of readdirSync(dirPath, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) {
      try {
        total += statSync(join(entry.parentPath ?? entry.path, entry.name)).size;
      } catch {
        // ignorăm fișierele inaccesibile
      }
    }
  }
  return total;
}

function countFiles(dirPath) {
  if (!existsSync(dirPath)) return 0;
  let count = 0;
  for (const entry of readdirSync(dirPath, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) count++;
  }
  return count;
}

function measureGenerate(label, schemaPath, outputDir) {
  console.log(`\n[GENERATE] ${label} …`);
  const start = Date.now();
  const result = spawnSync(
    'node',
    [
      join(LABS_ROOT, 'node_modules', 'prisma', 'build', 'index.js'),
      'generate',
      '--schema',
      schemaPath,
    ],
    {
      cwd: LABS_ROOT,
      env: {
        ...process.env,
        DATABASE_URL_CORE: 'postgresql://x:x@localhost/x?schema=lab_core',
        DATABASE_URL_BOOKING: 'postgresql://x:x@localhost/x?schema=lab_booking',
        DATABASE_URL_CRM: 'postgresql://x:x@localhost/x?schema=lab_crm',
        DATABASE_URL_SUPERUSER: 'postgresql://x:x@localhost/x',
      },
      encoding: 'utf8',
    },
  );
  const elapsed = Date.now() - start;
  if (result.status !== 0) {
    console.error(result.stderr);
    return { elapsed: -1, sizeBytes: 0, fileCount: 0 };
  }
  const sizeBytes = getDirSize(outputDir);
  const fileCount = countFiles(outputDir);
  console.log(
    `  Timp: ${elapsed}ms | Dimensiune: ${(sizeBytes / 1024).toFixed(1)} KB | Fișiere: ${fileCount}`,
  );
  return { elapsed, sizeBytes, fileCount };
}

// ─── Variant A: 3 scheme separate ─────────────────────────────────────────────
const variantAResults = [];

for (const [mod, schema, output] of [
  [
    'lab-core',
    join(LABS_ROOT, 'lab-core', 'prisma', 'schema.prisma'),
    join(LABS_ROOT, 'lab-core', 'generated', 'client'),
  ],
  [
    'lab-booking',
    join(LABS_ROOT, 'lab-booking', 'prisma', 'schema.prisma'),
    join(LABS_ROOT, 'lab-booking', 'generated', 'client'),
  ],
  [
    'lab-crm',
    join(LABS_ROOT, 'lab-crm', 'prisma', 'schema.prisma'),
    join(LABS_ROOT, 'lab-crm', 'generated', 'client'),
  ],
]) {
  variantAResults.push(measureGenerate(`Varianta A — ${mod}`, schema, output));
}

const variantATotal = {
  elapsed: variantAResults.reduce((s, r) => s + r.elapsed, 0),
  sizeBytes: variantAResults.reduce((s, r) => s + r.sizeBytes, 0),
  fileCount: variantAResults.reduce((s, r) => s + r.fileCount, 0),
  steps: 3,
};

// ─── Variant B: un singur client multiSchema ───────────────────────────────────
const variantBOutput = join(__dirname, 'variant-b', 'generated', 'client');
const variantBResult = measureGenerate(
  'Varianta B — multiSchema',
  join(__dirname, 'variant-b', 'prisma', 'schema.prisma'),
  variantBOutput,
);
const variantBTotal = {
  elapsed: variantBResult.elapsed,
  sizeBytes: variantBResult.sizeBytes,
  fileCount: variantBResult.fileCount,
  steps: 1,
};

// ─── Raport comparativ ─────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════');
console.log('E1 — Comparație Varianta A vs. Varianta B');
console.log('═══════════════════════════════════════════════════════════');
console.log('Metrică              Varianta A (3×)   Varianta B (1×)');
console.log('─────────────────────────────────────────────────────────');
console.log(
  `Timp generate (ms)   ${String(variantATotal.elapsed).padEnd(17)} ${variantBTotal.elapsed}`,
);
console.log(
  `Dimensiune (KB)      ${String((variantATotal.sizeBytes / 1024).toFixed(1)).padEnd(17)} ${(variantBTotal.sizeBytes / 1024).toFixed(1)}`,
);
console.log(
  `Fișiere generate     ${String(variantATotal.fileCount).padEnd(17)} ${variantBTotal.fileCount}`,
);
console.log(
  `Pași prisma generate ${String(variantATotal.steps).padEnd(17)} ${variantBTotal.steps}`,
);
console.log('═══════════════════════════════════════════════════════════');

// Output JSON pentru raport
const report = {
  variantA: { ...variantATotal, modules: variantAResults },
  variantB: variantBTotal,
  ratio: {
    elapsed: variantATotal.elapsed / variantBTotal.elapsed,
    sizeBytes: variantATotal.sizeBytes / variantBTotal.sizeBytes,
  },
};
console.log('\n[JSON]', JSON.stringify(report, null, 2));
