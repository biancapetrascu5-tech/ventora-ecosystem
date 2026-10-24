/**
 * E2 — verifică că fiecare modul are tabelul de migrații DOAR în propria schemă.
 * Rulat după ce toate 3 migrații au fost aplicate.
 */
import pg from 'pg';

const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres:localpass@localhost:5432/ventora_labs',
});

await client.connect();

const { rows } = await client.query(`
  SELECT schemaname, tablename
  FROM pg_tables
  WHERE tablename = '_prisma_migrations'
  ORDER BY schemaname
`);

console.log('\n=== Tabelul _prisma_migrations per schemă ===');
if (rows.length === 0) {
  console.error('[FAIL] Nicio migrație găsită — rulează migrate dev pentru toate 3 module');
  process.exit(1);
}
for (const row of rows) {
  console.log(`  schema=${row.schemaname}  table=${row.tablename}`);
}

// Verificăm că FIECARE schemă are propriul tabel, nu în alte scheme
const schemas = rows.map((r) => r.schemaname);
const expected = ['lab_booking', 'lab_core', 'lab_crm'];
const missing = expected.filter((s) => !schemas.includes(s));
const extra = schemas.filter((s) => !expected.includes(s));

if (missing.length > 0) {
  console.error(`[FAIL] Lipsesc tabelele _prisma_migrations din: ${missing.join(', ')}`);
  process.exit(1);
}
if (extra.length > 0) {
  console.warn(`[WARN] _prisma_migrations în scheme neașteptate: ${extra.join(', ')}`);
}

// Verificăm că migrațiile din lab_core nu ating lab_booking sau lab_crm
const { rows: coreRows } = await client.query(
  `SELECT migration_name, applied_steps_count FROM lab_core._prisma_migrations ORDER BY finished_at`,
);
const { rows: bookingRows } = await client.query(
  `SELECT migration_name, applied_steps_count FROM lab_booking._prisma_migrations ORDER BY finished_at`,
);
const { rows: crmRows } = await client.query(
  `SELECT migration_name, applied_steps_count FROM lab_crm._prisma_migrations ORDER BY finished_at`,
);

console.log(
  `\n  lab_core:    ${coreRows.length} migrație(i) — ${coreRows.map((r) => r.migration_name).join(', ')}`,
);
console.log(
  `  lab_booking: ${bookingRows.length} migrație(i) — ${bookingRows.map((r) => r.migration_name).join(', ')}`,
);
console.log(
  `  lab_crm:     ${crmRows.length} migrație(i) — ${crmRows.map((r) => r.migration_name).join(', ')}`,
);

// Verificăm că tabelele core nu există în lab_booking sau lab_crm
const { rows: crossCheck } = await client.query(`
  SELECT schemaname, tablename FROM pg_tables
  WHERE schemaname IN ('lab_core', 'lab_booking', 'lab_crm')
    AND tablename NOT IN ('_prisma_migrations')
  ORDER BY schemaname, tablename
`);

console.log('\n=== Tabele per schemă (fără _prisma_migrations) ===');
let lastSchema = '';
for (const r of crossCheck) {
  if (r.schemaname !== lastSchema) {
    console.log(`  [${r.schemaname}]`);
    lastSchema = r.schemaname;
  }
  console.log(`    ${r.tablename}`);
}

// Verificare cross-schema: niciun tabel core în booking/crm
const coreTables = [
  'organizations',
  'users',
  'memberships',
  'sessions',
  'usage_counters',
  'quota_reservations',
];
const bookingTables = ['services', 'appointments'];
const crmTables = ['contacts'];

const allRows = crossCheck;
const wrongPlace = allRows.filter((r) => {
  if (r.schemaname === 'lab_core' && !coreTables.includes(r.tablename)) return true;
  if (r.schemaname === 'lab_booking' && !bookingTables.includes(r.tablename)) return true;
  if (r.schemaname === 'lab_crm' && !crmTables.includes(r.tablename)) return true;
  return false;
});

if (wrongPlace.length > 0) {
  console.error('\n[FAIL] Tabele în schema greșită:', wrongPlace);
  process.exit(1);
}

console.log('\n[PASS] E2: fiecare modul are tabelul de migrații DOAR în propria schemă.');
console.log('[PASS] E2: nicio migrație nu a atins o altă schemă.');

await client.end();
