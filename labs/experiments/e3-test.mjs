/**
 * E3 — dovedește că lab_booking_user nu poate accesa lab_crm.*
 *    și că POATE face toate operațiile DML pe propria schemă (probă de control).
 * Rulat după setup-db.sql și migrații aplicate.
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

async function expectSuccess(label, fn) {
  try {
    const result = await fn();
    console.log(
      `[PASS] ${label}: succes${result?.rowCount !== undefined ? ` (${result.rowCount} rând(uri) afectat(e))` : ''}`,
    );
    passed++;
    return result;
  } catch (err) {
    console.error(`[FAIL] ${label}: eroare neașteptată ${err.code} — ${err.message}`);
    failed++;
    return null;
  }
}

// ─── Conectare ca lab_booking_user ───────────────────────────────────────────
const bookingConn = new Client({
  connectionString: 'postgresql://lab_booking_user:localpass@localhost:5432/ventora_labs',
  options: '--search_path=lab_booking',
});
await bookingConn.connect();
console.log('Conectat ca lab_booking_user. Search path: lab_booking\n');

// ─── E3-1 … E3-5: Acces cross-schema refuzat ─────────────────────────────────
console.log('--- Probe de izolare (cross-schema trebuie refuzat) ---');

await expectDenied('E3-1 SELECT lab_crm.contacts', async () => {
  await bookingConn.query('SELECT * FROM lab_crm.contacts LIMIT 1');
});

await expectDenied('E3-2 INSERT INTO lab_crm.contacts', async () => {
  await bookingConn.query(
    `INSERT INTO lab_crm.contacts (id, organization_id, name) VALUES ('x', 'org1', 'Test')`,
  );
});

await expectDenied('E3-3 UPDATE lab_crm.contacts', async () => {
  await bookingConn.query(`UPDATE lab_crm.contacts SET name='hacked' WHERE id='x'`);
});

await expectDenied('E3-4 DELETE FROM lab_crm.contacts', async () => {
  await bookingConn.query(`DELETE FROM lab_crm.contacts WHERE id='x'`);
});

await expectDenied('E3-5 SELECT lab_core.organizations', async () => {
  await bookingConn.query('SELECT * FROM lab_core.organizations LIMIT 1');
});

// ─── E3-6 … E3-9: Probă de control — DML complet pe propria schemă ──────────
console.log('\n--- Probă de control (propria schemă trebuie să permită DML complet) ---');

await expectSuccess('E3-6 SELECT lab_booking.services', async () => {
  return bookingConn.query('SELECT * FROM lab_booking.services LIMIT 1');
});

// INSERT — creăm un rând de test cu id fix pentru UPDATE/DELETE
await expectSuccess('E3-7 INSERT INTO lab_booking.services', async () => {
  return bookingConn.query(
    `INSERT INTO lab_booking.services (id, "organizationId", name, "durationMinutes")
     VALUES ('e3-control-probe', 'org-test', 'Probe Service', 30)
     ON CONFLICT (id) DO NOTHING`,
  );
});

await expectSuccess('E3-8 UPDATE lab_booking.services', async () => {
  return bookingConn.query(
    `UPDATE lab_booking.services SET name = 'Probe Service Updated' WHERE id = 'e3-control-probe'`,
  );
});

await expectSuccess('E3-9 DELETE FROM lab_booking.services', async () => {
  return bookingConn.query(`DELETE FROM lab_booking.services WHERE id = 'e3-control-probe'`);
});

await bookingConn.end();

// ─── Rezultat final ───────────────────────────────────────────────────────────
console.log(`\n=== E3 Rezultat: ${passed} PASS, ${failed} FAIL ===`);
if (failed > 0) {
  process.exit(1);
}
console.log('[PASS] E3: izolarea prin roluri Postgres funcționează corect.');
