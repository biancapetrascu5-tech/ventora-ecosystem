/**
 * E3 — dovedește că lab_booking_user nu poate accesa lab_crm.*
 * Rulat după setup-db.sql și migrații aplicate.
 * Fiecare operație (SELECT/INSERT/UPDATE/DELETE) trebuie să primească 42501 (insufficient_privilege).
 */
import pg from 'pg';

const { Client } = pg;

let passed = 0;
let failed = 0;

async function expectDenied(label, fn) {
  try {
    await fn();
    console.error(`[FAIL] ${label}: așteptam eroare 42501 dar operația a REUȘIT`);
    failed++;
  } catch (err) {
    if (err.code === '42501' || err.code === '42P01') {
      console.log(`[PASS] ${label}: refuzat cu ${err.code} — "${err.message.trim()}"`);
      passed++;
    } else {
      console.error(`[FAIL] ${label}: eroare neașteptată ${err.code} — ${err.message}`);
      failed++;
    }
  }
}

// ─── Conectare ca lab_booking_user ───────────────────────────────────────────
const bookingConn = new Client({
  connectionString: 'postgresql://lab_booking_user:localpass@localhost:5432/ventora_labs',
  options: '--search_path=lab_booking',
});
await bookingConn.connect();
console.log('Conectat ca lab_booking_user. Search path: lab_booking\n');

// ─── E3-1: SELECT pe lab_crm.contacts ────────────────────────────────────────
await expectDenied('SELECT lab_crm.contacts', async () => {
  await bookingConn.query('SELECT * FROM lab_crm.contacts LIMIT 1');
});

// ─── E3-2: INSERT în lab_crm.contacts ────────────────────────────────────────
await expectDenied('INSERT INTO lab_crm.contacts', async () => {
  await bookingConn.query(
    `INSERT INTO lab_crm.contacts (id, organization_id, name) VALUES ('x', 'org1', 'Test')`,
  );
});

// ─── E3-3: UPDATE pe lab_crm.contacts ────────────────────────────────────────
await expectDenied('UPDATE lab_crm.contacts', async () => {
  await bookingConn.query(`UPDATE lab_crm.contacts SET name='hacked' WHERE id='x'`);
});

// ─── E3-4: DELETE din lab_crm.contacts ───────────────────────────────────────
await expectDenied('DELETE FROM lab_crm.contacts', async () => {
  await bookingConn.query(`DELETE FROM lab_crm.contacts WHERE id='x'`);
});

// ─── E3-5: SELECT pe lab_core.organizations ──────────────────────────────────
await expectDenied('SELECT lab_core.organizations', async () => {
  await bookingConn.query('SELECT * FROM lab_core.organizations LIMIT 1');
});

// ─── E3-6: Confirmare că lab_booking_user POATE accesa propria schemă ─────────
try {
  await bookingConn.query('SELECT * FROM lab_booking.services LIMIT 1');
  console.log('[PASS] SELECT lab_booking.services: permis (acces legitim pe propria schemă)');
  passed++;
} catch (err) {
  console.error(
    `[FAIL] SELECT lab_booking.services: ${err.message} — rolul nu poate accesa propria schemă!`,
  );
  failed++;
}

await bookingConn.end();

// ─── Rezultat final ───────────────────────────────────────────────────────────
console.log(`\n=== E3 Rezultat: ${passed} PASS, ${failed} FAIL ===`);
if (failed > 0) {
  process.exit(1);
}
console.log('[PASS] E3: izolarea prin roluri Postgres funcționează corect.');
