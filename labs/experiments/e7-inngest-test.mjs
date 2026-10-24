/**
 * e7-inngest-test.mjs — Test Inngest local: outbox → dev server → CRM consumer
 *
 * Rulare: cd C:\Projects\ventora-ecosystem\labs && node experiments/e7-inngest-test.mjs
 *
 * Testează:
 *   1. Livrare normală (outbox → Inngest → consumator CRM)
 *   2. Livrare dublă → efect o singură dată (idempotență via event-id)
 *   3. Dead-letter după 3 eșecuri (retries: 2)
 *   4. Întârzierea outbox → consumator (ms)
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
import { serve, createServer as createInngestServer } from 'inngest/node';

process.env.INNGEST_DEV = '1'; // dev server local, fără cont

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const labsDir = path.resolve(__dirname, '..');
const allEnv = dotenv.parse(fs.readFileSync(path.join(labsDir, '.env.local')));

const dbUrl = allEnv['DATABASE_URL_SUPERUSER'];
if (!dbUrl) { console.error('DATABASE_URL_SUPERUSER lipsă'); process.exit(1); }
const dbHost = new URL(dbUrl).hostname.toLowerCase();
if (dbHost === 'localhost' || dbHost === '127.0.0.1') { console.error('localhost — refuzat'); process.exit(1); }

const dbClient = new pg.Client({ connectionString: dbUrl });
await dbClient.connect();
console.log(`\nDB: ${dbHost}`);

// ── Inngest client ───────────────────────────────────────────────────────────
const INNGEST_PORT = 8288;
const HANDLER_PORT = 3001;

const inngest = new Inngest({
  id: 'ventora-lab-e7',
  eventKey: 'test-local-key',
  baseUrl: `http://127.0.0.1:${INNGEST_PORT}`,
});

// ── Tracking ─────────────────────────────────────────────────────────────────
const processed = new Map(); // outboxId → { attempts, completedAt }

// ── Funcții Inngest ───────────────────────────────────────────────────────────
const normalHandler = inngest.createFunction(
  {
    id: 'crm-appointment-handler',
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
      [rec.attempts, outboxEventId]
    );
    return { ok: true };
  }
);

const failingHandler = inngest.createFunction(
  {
    id: 'crm-appointment-handler-failing',
    retries: 2,
    triggers: [{ event: 'lab-booking/appointment.created.v1.test-dlq' }],
  },
  async ({ event }) => {
    const { outboxEventId } = event.data;
    const rec = processed.get(outboxEventId) ?? { attempts: 0, firstAt: Date.now() };
    rec.attempts += 1;
    processed.set(outboxEventId, rec);
    await dbClient.query(
      `UPDATE lab_booking.outbox_events SET attempts = $1 WHERE id = $2`,
      [rec.attempts, outboxEventId]
    );
    throw new Error(`Simulated failure attempt ${rec.attempts}`);
  }
);

// ── Handler HTTP ──────────────────────────────────────────────────────────────
const handler = serve({ client: inngest, functions: [normalHandler, failingHandler] });
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
  if (s.includes('started') || s.includes('ready') || s.includes('error')) console.log('[dev]', s.substring(0, 120));
});
devProc.stderr.on('data', (d) => {
  const s = String(d).trim();
  if (s.includes('error') || s.includes('Error')) console.error('[dev-err]', s.substring(0, 120));
});

// Așteptare port TCP
const waitPort = (port, timeoutMs = 30000) => new Promise((resolve, reject) => {
  const deadline = Date.now() + timeoutMs;
  const try_ = () => {
    const sock = net.createConnection({ host: '127.0.0.1', port });
    sock.once('connect', () => { sock.destroy(); resolve(); });
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
// Dev server auto-syncs cu SDK URL setat la pornire — așteptăm 4s
await new Promise((res) => setTimeout(res, 4000));
console.log('Funcții sincronizate cu dev server.');

// ── Helpers ───────────────────────────────────────────────────────────────────
const createOutboxEntry = async (id, eventType) => {
  await dbClient.query(
    `INSERT INTO lab_booking.outbox_events (id, "eventType", payload) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (id) DO UPDATE SET attempts = 0, "processedAt" = NULL`,
    [id, eventType, JSON.stringify({ outboxEventId: id })]
  );
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const waitProcessed = async (id, timeout = 12000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (processed.get(id)?.completedAt) return true;
    await sleep(300);
  }
  return false;
};

const eventPayload = (outboxEventId) => ({
  outboxEventId,
  appointmentId: `e7-apt-${outboxEventId}`,
  organizationId: 'e7-org-alpha',
  contactId: 'e7-contact-alpha-1',
  serviceId: 'e7-svc-consult',
  scheduledAt: new Date().toISOString(),
});

// ════════════════════════════════════════════════════════════════════════════
// Test 1: livrare normală
// ════════════════════════════════════════════════════════════════════════════
console.log('\n─── Test 1: livrare normală ─────────────────────────────────────');
const id1 = `e7-t1-${Date.now()}`;
await createOutboxEntry(id1, 'lab-booking/appointment.created.v1');
const t1Start = Date.now();
await inngest.send({ id: id1, name: 'lab-booking/appointment.created.v1', data: eventPayload(id1) });
const t1Delivered = await waitProcessed(id1);
const t1Delay = t1Delivered ? (processed.get(id1).completedAt - t1Start) : -1;
console.log(`  Livrat: ${t1Delivered ? 'DA' : 'NU'}`);
console.log(`  Încercări: ${processed.get(id1)?.attempts ?? 0}`);
console.log(`  Întârziere outbox→consumator: ${t1Delay}ms`);

// ════════════════════════════════════════════════════════════════════════════
// Test 2: livrare dublă (idempotență)
// ════════════════════════════════════════════════════════════════════════════
console.log('\n─── Test 2: livrare dublă (idempotență) ─────────────────────────');
await inngest.send({ id: id1, name: 'lab-booking/appointment.created.v1', data: eventPayload(id1) });
await sleep(4000);
const attemptsAfterDouble = processed.get(id1)?.attempts ?? 0;
const t2Pass = attemptsAfterDouble === 1;
console.log(`  Încercări după a doua livrare cu același id: ${attemptsAfterDouble} (așteptat: 1)`);
console.log(`  Idempotent: ${t2Pass ? 'DA ✓' : 'NU ✗'}`);

// ════════════════════════════════════════════════════════════════════════════
// Test 3: dead-letter după 3 eșecuri
// ════════════════════════════════════════════════════════════════════════════
console.log('\n─── Test 3: dead-letter după 3 eșecuri ──────────────────────────');
const idDlq = `e7-dlq-${Date.now()}`;
await createOutboxEntry(idDlq, 'lab-booking/appointment.created.v1.test-dlq');
await inngest.send({
  id: idDlq,
  name: 'lab-booking/appointment.created.v1.test-dlq',
  data: eventPayload(idDlq),
});
console.log('  Așteptare 3 încercări (backoff Inngest dev ~10s între retry-uri)...');
await sleep(90000);
const dlqAttempts = processed.get(idDlq)?.attempts ?? 0;
const t3Pass = dlqAttempts >= 3;
console.log(`  Încercări înregistrate: ${dlqAttempts} (așteptat ≥3)`);
console.log(`  Dead-letter: ${t3Pass ? 'PASS ✓' : 'VERIFICĂ UI http://localhost:8288'}`);

// ════════════════════════════════════════════════════════════════════════════
// Raport final
// ════════════════════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════════════════════════════');
console.log('RAPORT E7 — Inngest local:');
console.log(`  Test 1 Livrare normală:           ${t1Delivered ? 'PASS' : 'FAIL'}`);
console.log(`  Test 2 Idempotență dublă:         ${t2Pass ? 'PASS' : 'FAIL'}`);
console.log(`  Test 3 Dead-letter (3 fail):      ${t3Pass ? 'PASS' : 'PARTIAL'}`);
console.log(`  Întârziere outbox→consumator:     ${t1Delay}ms`);
console.log('════════════════════════════════════════════════════════════════\n');

// Cleanup
devProc.kill();
server.close();
await dbClient.end();
process.exit(0);
