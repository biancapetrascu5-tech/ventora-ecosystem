/**
 * e7-outbox-relay.mjs — Dispecer outbox: retrimite evenimentele nelivrate
 *
 * Testează scenariul: Inngest oprit → booking creat → eveniment în outbox nelivrat
 *                     → Inngest pornit → relay → evenimentul ajunge la consumator o singură dată
 *
 * Rulare: cd C:\Projects\ventora-ecosystem\labs && node experiments/e7-outbox-relay.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import dotenv from 'dotenv';
import pg from 'pg';
import { Inngest } from 'inngest';
import { serve } from 'inngest/node';

process.env.INNGEST_DEV = '1';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const labsDir = path.resolve(__dirname, '..');
const allEnv = dotenv.parse(fs.readFileSync(path.join(labsDir, '.env.local')));

const dbUrl = allEnv['DATABASE_URL_SUPERUSER'];
if (!dbUrl) {
  console.error('DATABASE_URL_SUPERUSER lipsă');
  process.exit(1);
}
const dbHost = new URL(dbUrl).hostname.toLowerCase();
if (dbHost === 'localhost' || dbHost === '127.0.0.1') {
  console.error('localhost — refuzat');
  process.exit(1);
}

const dbClient = new pg.Client({ connectionString: dbUrl });
await dbClient.connect();
console.log(`\nDB: ${dbHost}`);

// ── Inngest client ────────────────────────────────────────────────────────────
const INNGEST_PORT = 8288; // același port ca în e7-inngest-test (funcționează)
const HANDLER_PORT = 3001;

const inngest = new Inngest({
  id: 'ventora-lab-e7-relay',
  eventKey: 'test-local-key',
  baseUrl: `http://127.0.0.1:${INNGEST_PORT}`,
});

// ── Tracking ──────────────────────────────────────────────────────────────────
const processed = new Map(); // outboxId → { attempts, completedAt }

// ── Handler Inngest ───────────────────────────────────────────────────────────
const relayConsumer = inngest.createFunction(
  {
    id: 'crm-relay-consumer',
    retries: 2,
    triggers: [{ event: 'lab-booking/appointment.created.v1' }],
  },
  async ({ event }) => {
    const { outboxEventId } = event.data;
    const rec = processed.get(outboxEventId) ?? { attempts: 0, firstAt: Date.now() };
    rec.attempts += 1;
    rec.completedAt = Date.now();
    processed.set(outboxEventId, rec);
    await dbClient.query(
      `UPDATE lab_booking.outbox_events SET "processedAt" = NOW(), attempts = $1 WHERE id = $2`,
      [rec.attempts, outboxEventId],
    );
    return { ok: true };
  },
);

// ── Server HTTP handler ───────────────────────────────────────────────────────
const handler = serve({ client: inngest, functions: [relayConsumer] });
const server = http.createServer((req, res) => {
  req.url = (req.url || '').replace(/^\/api\/inngest/, '');
  if (!req.url) req.url = '/';
  handler(req, res);
});
server.listen(HANDLER_PORT, '127.0.0.1');
console.log(`Handler HTTP: localhost:${HANDLER_PORT}/api/inngest`);

// ── Pornire Inngest dev server ────────────────────────────────────────────────
console.log('Pornire Inngest dev server...');
const devCmd = `npx --yes inngest-cli@1.49.0 dev --port ${INNGEST_PORT} --sdk-url http://127.0.0.1:${HANDLER_PORT}/api/inngest`;
const devProc = spawn(devCmd, { stdio: 'pipe', shell: true });
devProc.stdout.on('data', (d) => {
  const s = String(d).trim();
  if (s.includes('started') || s.includes('ready') || s.includes('error'))
    console.log('[dev]', s.substring(0, 120));
});
devProc.stderr.on('data', (d) => {
  const s = String(d).trim();
  if (s.includes('error') || s.includes('Error')) console.error('[dev-err]', s.substring(0, 120));
});

const waitPort = (port, timeoutMs = 30000) =>
  new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const try_ = () => {
      const sock = net.createConnection({ host: '127.0.0.1', port });
      sock.once('connect', () => {
        sock.destroy();
        resolve();
      });
      sock.once('error', () => {
        sock.destroy();
        if (Date.now() >= deadline) reject(new Error(`Port ${port} not ready in ${timeoutMs}ms`));
        else setTimeout(try_, 400);
      });
    };
    try_();
  });

await waitPort(INNGEST_PORT, 90000);
console.log('Inngest dev server activ.');
await new Promise((res) => setTimeout(res, 8000)); // 8s pentru sincronizare funcții + event key
console.log('Funcții sincronizate.');

// ── Relay function ────────────────────────────────────────────────────────────
/**
 * Citește evenimentele nelivrate din outbox (processedAt IS NULL) și le trimite
 * către Inngest. Folosește outboxEventId ca event-id Inngest → deduplicare automată.
 * Consumatorul marchează processedAt după procesare — nu relay-ul.
 */
async function relayPendingEvents() {
  const result = await dbClient.query(`
    SELECT id, "eventType", payload, "createdAt"
    FROM lab_booking.outbox_events
    WHERE "processedAt" IS NULL
    ORDER BY "createdAt" ASC
  `);

  let sent = 0;
  const errors = [];
  for (const row of result.rows) {
    try {
      await inngest.send({
        id: row.id,
        name: row.eventType,
        data: row.payload,
      });
      sent++;
    } catch (e) {
      errors.push({ id: row.id, error: e.message });
    }
  }
  return { pending: result.rows.length, sent, errors };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const waitProcessed = async (id, timeout = 12000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (processed.get(id)?.completedAt) return true;
    await sleep(300);
  }
  return false;
};

// ════════════════════════════════════════════════════════════════════════════
// Curățare outbox din testele anterioare
// ════════════════════════════════════════════════════════════════════════════
await dbClient.query(
  `UPDATE lab_booking.outbox_events SET "processedAt" = NOW() WHERE "processedAt" IS NULL AND id LIKE 'e7-%'`,
);
console.log('Outbox curatit (events precedente marcate processed).');

// ════════════════════════════════════════════════════════════════════════════
// Scenariul: eveniment nelivrat → relay → consumator → o singură dată
// ════════════════════════════════════════════════════════════════════════════

// PASUL 1: simulare „Inngest oprit la momentul booking-ului"
// Inserăm direct în outbox fără a apela inngest.send() (cum se întâmplă când
// booking/create încearcă să trimită dar Inngest nu răspunde → best-effort eșuează)
console.log('\n─── Pas 1: creare eveniment în outbox (fără livrare — Inngest era oprit) ──');
const outboxId = `e7-relay-${Date.now()}`;
const createdAt = new Date();
await dbClient.query(
  `INSERT INTO lab_booking.outbox_events (id, "eventType", payload, "createdAt")
   VALUES ($1, $2, $3::jsonb, $4)
   ON CONFLICT (id) DO UPDATE SET "processedAt" = NULL, attempts = 0`,
  [
    outboxId,
    'lab-booking/appointment.created.v1',
    JSON.stringify({
      outboxEventId: outboxId,
      appointmentId: `e7-apt-relay-${Date.now()}`,
      organizationId: 'e7-org-alpha',
      contactId: 'e7-contact-alpha-1',
      serviceId: 'e7-svc-consult',
      scheduledAt: new Date().toISOString(),
    }),
    createdAt.toISOString(),
  ],
);
console.log(`  Outbox entry creat: ${outboxId}`);
console.log(`  processedAt: NULL (nelivrat)`);

// PASUL 2: verificare outbox înainte de relay
const { rows: beforeRows } = await dbClient.query(
  `SELECT id, "processedAt", attempts FROM lab_booking.outbox_events WHERE id = $1`,
  [outboxId],
);
console.log(
  `  Status înainte de relay: processedAt=${beforeRows[0]?.processedAt ?? 'NULL'}, attempts=${beforeRows[0]?.attempts}`,
);

// PASUL 3: rulare relay (Inngest e acum activ)
console.log('\n─── Pas 2: rulare relay (Inngest activ acum) ────────────────────────────');
const relayStart = Date.now();
const relayResult = await relayPendingEvents();
console.log(`  Pending în outbox: ${relayResult.pending}`);
console.log(`  Trimise: ${relayResult.sent}`);
if (relayResult.errors.length > 0) console.log(`  Erori: ${JSON.stringify(relayResult.errors)}`);

// PASUL 4: așteptare procesare de către consumator
console.log('\n─── Pas 3: așteptare procesare de consumatorul CRM ─────────────────────');
const delivered = await waitProcessed(outboxId);
const deliveredAt = new Date();
const timeInOutbox = deliveredAt.getTime() - createdAt.getTime();

const { rows: afterRows } = await dbClient.query(
  `SELECT "processedAt", attempts FROM lab_booking.outbox_events WHERE id = $1`,
  [outboxId],
);

console.log(`  Livrat: ${delivered ? 'DA' : 'NU'}`);
console.log(`  Încercări consumator: ${processed.get(outboxId)?.attempts ?? 0}`);
console.log(`  processedAt în DB: ${afterRows[0]?.processedAt ?? 'NULL'}`);
console.log(`  Timp în outbox (createdAt → processedAt): ${timeInOutbox}ms`);

// PASUL 5: al doilea relay — trebuie să nu retrimită (processedAt setat)
console.log('\n─── Pas 4: al doilea relay — idempotență ────────────────────────────────');
await sleep(2000);
const relay2Result = await relayPendingEvents();
await sleep(3000);
const attemptsAfterRelay2 = processed.get(outboxId)?.attempts ?? 0;
console.log(
  `  Pending în outbox după procesare: ${relay2Result.pending} (așteptat: 0 pentru acest eveniment)`,
);
console.log(`  Încercări total după al doilea relay: ${attemptsAfterRelay2} (așteptat: 1)`);
const idempotent = attemptsAfterRelay2 === 1;
console.log(`  Idempotent: ${idempotent ? 'DA ✓' : 'NU ✗'}`);

// ════════════════════════════════════════════════════════════════════════════
// Raport final
// ════════════════════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════════════════════════════════════');
console.log('RAPORT E7 — Relay outbox:');
console.log(`  Pas 1 Eveniment în outbox (nelivrat):   OK`);
console.log(
  `  Pas 2 Relay → Inngest:                  ${relayResult.sent > 0 ? 'PASS' : 'FAIL'} (${relayResult.sent} trimise)`,
);
console.log(`  Pas 3 Consumator procesează:            ${delivered ? 'PASS' : 'FAIL'}`);
console.log(`  Pas 4 Al doilea relay → idempotent:     ${idempotent ? 'PASS' : 'FAIL'}`);
console.log(`  Timp în outbox:                         ${timeInOutbox}ms`);
console.log('════════════════════════════════════════════════════════════════════════\n');

devProc.kill();
server.close();
await dbClient.end();
process.exit(0);
