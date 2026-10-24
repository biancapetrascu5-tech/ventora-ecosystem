#!/usr/bin/env node
/**
 * guards-verify.mjs
 *
 * Verifies that each intentional violation file triggers its expected ESLint rule,
 * that i18n:check catches malformed message catalogs, and that gitleaks detects
 * secrets (if installed; otherwise CI handles this via gitleaks/gitleaks-action@v2).
 *
 * Usage: node scripts/guards-verify.mjs
 * Or via:  pnpm guards:verify
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function findBinary(name) {
  const ext = process.platform === 'win32' ? '.exe' : '';
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const full = path.join(dir, name + ext);
    try {
      statSync(full);
      return full;
    } catch {
      // not in this dir
    }
  }
  return null;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const VIOLATIONS = [
  {
    file: 'labs/violations/boundary-import.ts',
    expectedRule: 'boundaries/dependencies',
    description: 'lab imports directly from module (not via package)',
  },
  {
    file: 'labs/violations/raw-db-query.ts',
    expectedRule: 'no-restricted-syntax',
    description: 'raw prisma.$queryRaw usage',
  },
  {
    file: 'labs/violations/system-context-in-request.ts',
    expectedRule: 'no-restricted-syntax',
    description: 'withSystemContext in request handler',
  },
  {
    file: 'labs/violations/hardcoded-text.tsx',
    expectedRule: 'i18next/no-literal-string',
    description: 'hardcoded JSX literal string',
  },
  {
    file: 'labs/violations/native-select.tsx',
    expectedRule: 'no-restricted-syntax',
    description: 'native <select> instead of @ventora/ui Select',
  },
  {
    file: 'labs/violations/wrong-ui-import.tsx',
    expectedRule: 'no-restricted-syntax',
    description: 'Button imported from wrong path (not @ventora/ui)',
  },
  {
    file: 'labs/violations/inline-color.tsx',
    expectedRule: 'no-restricted-syntax',
    description: 'hardcoded hex/rgb color or Tailwind arbitrary value',
  },
];

const ESLINT_CONFIG = 'labs/violations/eslint.config.mjs';

// Resolve eslint binary once — from an app dir where eslint is a direct dep.
const { createRequire } = await import('node:module');
const req = createRequire(path.join(root, 'apps', 'platform', 'package.json'));
const eslintBin = path.join(path.dirname(req.resolve('eslint/package.json')), 'bin', 'eslint.js');

let allPassed = true;

// --- ESLint violation checks ---

for (const { file, expectedRule, description } of VIOLATIONS) {
  const result = spawnSync(
    process.execPath,
    [eslintBin, '--config', ESLINT_CONFIG, '--format', 'json', file],
    { cwd: root, encoding: 'utf-8' },
  );

  let messages = [];
  try {
    const parsed = JSON.parse(result.stdout);
    messages = parsed.flatMap((r) => r.messages ?? []);
  } catch {
    console.error(`[FAIL] ${file}: could not parse ESLint JSON output`);
    console.error('  stdout:', result.stdout.slice(0, 200));
    console.error('  stderr:', result.stderr.slice(0, 200));
    allPassed = false;
    continue;
  }

  const ruleIds = messages.map((m) => m.ruleId);
  if (ruleIds.includes(expectedRule)) {
    console.log(`[PASS] ${file}`);
    console.log(`       rule "${expectedRule}" triggered — ${description}`);
  } else {
    console.error(`[FAIL] ${file}`);
    console.error(`       expected rule "${expectedRule}" but got: ${JSON.stringify(ruleIds)}`);
    console.error(`       description: ${description}`);
    allPassed = false;
  }
}

// --- i18n:check violations ---
// labs/violations/i18n/ has: EN missing a key (common.probe), FR with an extra key (common.frOnly).
// i18n:check must exit non-zero on this catalog.

const i18nResult = spawnSync(
  process.execPath,
  ['packages/i18n/scripts/check.mjs', '--dir=labs/violations/i18n'],
  { cwd: root, encoding: 'utf-8' },
);

if (i18nResult.status !== 0) {
  console.log('[PASS] i18n:check — correctly detected violations in labs/violations/i18n');
  console.log('       (EN missing common.probe; FR has extra common.frOnly)');
} else {
  console.error(
    '[FAIL] i18n:check — should have detected violations in labs/violations/i18n but passed',
  );
  allPassed = false;
}

// --- Gitleaks secret detection ---
// Writes a temp file with a GitHub PAT-style token OUTSIDE the repository,
// runs gitleaks against it, verifies detection, then deletes the file.
// SKIP if gitleaks is not installed locally — CI handles this via gitleaks/gitleaks-action@v2.

const gitleaksBin = findBinary('gitleaks');

if (!gitleaksBin) {
  console.log(
    '[SKIP] gitleaks not installed locally — CI job secrets-scan uses gitleaks/gitleaks-action@v2',
  );
} else {
  const tmpDir = path.join(tmpdir(), 'ventora-gitleaks-test');
  const tmpFile = path.join(tmpDir, 'fake-secret.env');
  try {
    mkdirSync(tmpDir, { recursive: true });
    // GitHub PAT-style pattern — triggers gitleaks github-pat rule.
    // Written OUTSIDE the repository; deleted immediately after the check.
    writeFileSync(tmpFile, 'GITHUB_TOKEN=ghp_aaaBBBcccDDD111222333444555666777\n', 'utf-8');

    const gitleaksResult = spawnSync(
      gitleaksBin,
      ['detect', '--source', tmpDir, '--no-git', '--exit-code', '1'],
      { encoding: 'utf-8' },
    );

    if (gitleaksResult.status !== 0) {
      console.log('[PASS] gitleaks — correctly detected fake secret in temp file outside repo');
    } else {
      console.error(
        '[FAIL] gitleaks — did NOT detect the fake secret; check gitleaks rule configuration',
      );
      allPassed = false;
    }
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

if (!allPassed) {
  console.error('\nguards-verify: one or more guards are broken. Fix the ESLint rules above.');
  process.exit(1);
}

console.log('\nguards-verify: all guards confirmed.');
