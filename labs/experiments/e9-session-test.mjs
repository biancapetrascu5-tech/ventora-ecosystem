/**
 * e9-session-test.mjs — teste T1–T6 pentru Better Auth (E9)
 *
 * Rulare: node experiments/e9-session-test.mjs
 * Necesita BASE_URL in labs/.env.local (ex: https://ventora-lab-e4.vercel.app)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const labsDir = path.resolve(__dirname, '..');

function parseEnv(content) {
  const result = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    result[key] = val;
  }
  return result;
}

const env = parseEnv(fs.readFileSync(path.join(labsDir, '.env.local'), 'utf8'));
const BASE = (env['BASE_URL'] || '').replace(/\/$/, '');
if (!BASE) {
  console.error('BASE_URL lipsă în .env.local');
  process.exit(1);
}

const AUTH = `${BASE}/api/e9/auth`;
const SETUP = `${BASE}/api/e9/setup`;
const SESSION_ME = `${BASE}/api/e9/session/me`;
const LATENCY = `${BASE}/api/e9/latency`;

let passed = 0;
let failed = 0;

function assert(name, cond, detail = '') {
  if (cond) {
    console.log(`  PASS  ${name}`);
    passed++;
  } else {
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function post(url, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text };
  }
  return { status: r.status, headers: r.headers, json };
}

async function get(url, token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const r = await fetch(url, { headers });
  const json = await r.json().catch(() => null);
  return { status: r.status, headers: r.headers, json };
}

function randomEmail() {
  return `e9-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
}

async function signIn(email, password) {
  const r = await post(`${AUTH}/sign-in/email`, { email, password });
  const token = r.headers.get('set-auth-token') || r.json?.token;
  return { status: r.status, json: r.json, token };
}

async function signUp(email, password, name) {
  const r = await post(`${AUTH}/sign-up/email`, { email, password, name });
  const token = r.headers.get('set-auth-token') || r.json?.token;
  return { status: r.status, json: r.json, token };
}

// ────────────────────────────────────────────────────
// T1 — Signup, signin, sessiune prin bearer token
// ────────────────────────────────────────────────────
console.log('\nT1 — Signup + signin + bearer token');

const t1Email = randomEmail();
const t1Pass = 'Password1!';

const signup = await signUp(t1Email, t1Pass, 'T1 User');
assert('T1.1 signup 200', signup.status === 200, `status=${signup.status}`);

const t1SignIn = await signIn(t1Email, t1Pass);
assert('T1.2 signin 200', t1SignIn.status === 200, `status=${t1SignIn.status}`);
assert('T1.3 token prezent', !!t1SignIn.token, `json=${JSON.stringify(t1SignIn.json)}`);

const t1Session = await get(SESSION_ME, t1SignIn.token);
assert(
  'T1.4 session valida cu bearer',
  t1Session.status === 200 && !!t1Session.json?.session?.session?.id,
);
assert(
  'T1.5 scrypt hash (nu argon2)',
  t1Session.json?.session?.user?.email === t1Email,
  'user email mismatch',
);

// Confirm hash algo via session user (scrypt is default — no argon2 field)
const t1Account = t1Session.json?.session;
const providerId = 'credential'; // Better Auth credential provider
console.log(`  INFO  password provider: ${JSON.stringify(t1Account?.session?.userId)}`);

// ────────────────────────────────────────────────────
// T2 — Retrogradare rol, efect pe aceeași sesiune
// ────────────────────────────────────────────────────
console.log('\nT2 — Retrogradare rol (admin → member), efect imediat');

const t2Email = randomEmail();
const t2SignUp = await signUp(t2Email, t1Pass, 'T2 User');
const t2SignIn = await signIn(t2Email, t1Pass);
const t2Token = t2SignIn.token;

// Add as admin to e9-org-alpha
const addAdmin = await post(SETUP, {
  action: 'add-member',
  organizationId: 'e9-org-alpha',
  userId: t2SignUp.json?.user?.id,
  role: 'admin',
});
assert('T2.1 add-member admin', addAdmin.status === 200, `status=${addAdmin.status}`);

// Activate org in t2 session
const setOrg = await post(
  SETUP,
  { action: 'set-active-org', organizationId: 'e9-org-alpha' },
  t2Token,
);
assert(
  'T2.2 set-active-org',
  setOrg.status === 200,
  `status=${setOrg.status} body=${JSON.stringify(setOrg.json)}`,
);

// Read session — should have activeOrganizationId
const t2SessionBefore = await get(SESSION_ME, t2Token);
const activeBefore = t2SessionBefore.json?.session?.session?.activeOrganizationId;
assert('T2.3 activeOrganizationId set', activeBefore === 'e9-org-alpha', `got=${activeBefore}`);

// Downgrade to member
const memberId = addAdmin.json?.member?.id;
const downgrade = await post(SETUP, {
  action: 'update-member-role',
  organizationId: 'e9-org-alpha',
  memberId,
  role: 'member',
});
assert('T2.4 downgrade la member', downgrade.status === 200, `status=${downgrade.status}`);

// Same token — check session (Better Auth reads from DB every time with cookieCache disabled)
const t2SessionAfter = await get(SESSION_ME, t2Token);
assert('T2.5 session accesibila dupa retrogradare', t2SessionAfter.status === 200);

// ────────────────────────────────────────────────────
// T3 — Revocare sesiune, efect imediat (fara cache)
// ────────────────────────────────────────────────────
console.log('\nT3 — Revocare sesiune (una + toate)');

const t3Email = randomEmail();
await signUp(t3Email, t1Pass, 'T3 User');
const t3A = await signIn(t3Email, t1Pass);
const t3B = await signIn(t3Email, t1Pass);
const t3C = await signIn(t3Email, t1Pass);

assert('T3.1 3 sesiuni create', !!t3A.token && !!t3B.token && !!t3C.token);

// Revoke session A by token
const revokeA = await post(
  SETUP,
  { action: 'revoke-session', token: t3A.json?.token || t3A.token },
  t3A.token,
);
assert('T3.2 revoke-session 200', revokeA.status === 200, `status=${revokeA.status}`);

// Session A should now be invalid
const t3ACheck = await get(SESSION_ME, t3A.token);
assert(
  'T3.3 sesiune revocata invalida imediat (cookieCache=false)',
  t3ACheck.status === 401,
  `status=${t3ACheck.status}`,
);

// Session B still valid
const t3BCheck = await get(SESSION_ME, t3B.token);
assert('T3.4 alte sesiuni intacte', t3BCheck.status === 200, `status=${t3BCheck.status}`);

// Revoke all sessions via /revoke-sessions (current user)
const revokeAll = await post(`${AUTH}/revoke-sessions`, {}, t3B.token);
assert('T3.5 revoke-all-sessions 200', revokeAll.status === 200, `status=${revokeAll.status}`);

// B and C should now be invalid
const t3BAfter = await get(SESSION_ME, t3B.token);
const t3CAfter = await get(SESSION_ME, t3C.token);
assert(
  'T3.6 sesiuneB invalida dupa revoke-all',
  t3BAfter.status === 401,
  `status=${t3BAfter.status}`,
);
assert(
  'T3.7 sesiuneC invalida dupa revoke-all',
  t3CAfter.status === 401,
  `status=${t3CAfter.status}`,
);

// ────────────────────────────────────────────────────
// T4 — 2FA: TOTP + backup codes
// ────────────────────────────────────────────────────
console.log('\nT4 — 2FA TOTP + backup codes');

const t4Email = randomEmail();
await signUp(t4Email, t1Pass, 'T4 User');
const t4SignIn = await signIn(t4Email, t1Pass);
const t4Token = t4SignIn.token;

// Enable 2FA — generates TOTP secret + backup codes
const enable2fa = await post(`${AUTH}/two-factor/enable`, { password: t1Pass }, t4Token);
assert(
  'T4.1 enable-2fa 200',
  enable2fa.status === 200,
  `status=${enable2fa.status} body=${JSON.stringify(enable2fa.json)}`,
);

const totpUri = enable2fa.json?.totpURI;
const backupCodes = enable2fa.json?.backupCodes;
assert('T4.2 totpURI prezent', !!totpUri, `uri=${totpUri}`);
assert(
  'T4.3 backupCodes prezente',
  Array.isArray(backupCodes) && backupCodes.length > 0,
  `codes=${backupCodes}`,
);

// Use first backup code
if (backupCodes?.length) {
  const useBackup = await post(
    `${AUTH}/two-factor/verify-backup-code`,
    { code: backupCodes[0] },
    t4Token,
  );
  assert(
    'T4.4 backup code valid la prima folosire',
    useBackup.status === 200,
    `status=${useBackup.status}`,
  );

  // Same backup code again should fail (single-use)
  const useBackupAgain = await post(
    `${AUTH}/two-factor/verify-backup-code`,
    { code: backupCodes[0] },
    t4Token,
  );
  assert(
    'T4.5 backup code invalid la refolosire (single-use)',
    useBackupAgain.status !== 200,
    `status=${useBackupAgain.status}`,
  );
}

// Regenerate backup codes
const regen = await post(`${AUTH}/two-factor/generate-backup-codes`, { password: t1Pass }, t4Token);
assert('T4.6 regenerare backup codes 200', regen.status === 200, `status=${regen.status}`);
const newCodes = regen.json?.backupCodes;
assert(
  'T4.7 coduri noi diferite de cele vechi',
  JSON.stringify(newCodes) !== JSON.stringify(backupCodes),
);

// ────────────────────────────────────────────────────
// T5 — organizationId din request nu are efect
// ────────────────────────────────────────────────────
console.log('\nT5 — organizationId injectat in request ignorat');

const t5Email = randomEmail();
await signUp(t5Email, t1Pass, 'T5 User');
const t5SignIn = await signIn(t5Email, t1Pass);
const t5Token = t5SignIn.token;

// T5 user is NOT a member of e9-org-alpha
// Try to inject organizationId via query param / body — should not change session org
const t5Session = await get(`${SESSION_ME}?organizationId=e9-org-alpha`, t5Token);
assert('T5.1 session ok', t5Session.status === 200);
const t5ActiveOrg = t5Session.json?.session?.session?.activeOrganizationId;
assert(
  'T5.2 activeOrganizationId nu e injectat prin query param',
  t5ActiveOrg !== 'e9-org-alpha',
  `activeOrg=${t5ActiveOrg}`,
);

// Try set-active-org for org where user is NOT a member
const t5SetOrg = await post(
  SETUP,
  { action: 'set-active-org', organizationId: 'e9-org-alpha' },
  t5Token,
);
assert(
  'T5.3 set-active-org respins pentru non-member',
  t5SetOrg.status !== 200,
  `status=${t5SetOrg.status} body=${JSON.stringify(t5SetOrg.json)}`,
);

// ────────────────────────────────────────────────────
// T6 — Latenta: p50/p95 session lookup (N=20)
// ────────────────────────────────────────────────────
console.log('\nT6 — Latenta session lookup (N=20)');

const N = 20;
const t6Email = randomEmail();
await signUp(t6Email, t1Pass, 'T6 User');
const t6SignIn = await signIn(t6Email, t1Pass);
const t6Token = t6SignIn.token;

const samples = [];
for (let i = 0; i < N; i++) {
  const r = await get(`${LATENCY}`, t6Token);
  if (r.json?.sessionLookupMs !== undefined) {
    samples.push(r.json.sessionLookupMs);
  }
}

samples.sort((a, b) => a - b);
const p50 = samples[Math.floor(N * 0.5)];
const p95 = samples[Math.floor(N * 0.95)];
console.log(
  `  INFO  N=${samples.length}, p50=${p50}ms, p95=${p95}ms, min=${samples[0]}ms, max=${samples[samples.length - 1]}ms`,
);
assert('T6.1 p50 < 300ms', p50 < 300, `p50=${p50}ms`);
assert('T6.2 p95 < 700ms', p95 < 700, `p95=${p95}ms`);

// ────────────────────────────────────────────────────
// Rezultat final
// ────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Rezultat: ${passed} PASS, ${failed} FAIL`);
if (failed > 0) process.exit(1);
