#!/usr/bin/env node
/**
 * guards-verify.mjs
 *
 * Verifies that each intentional violation file triggers its expected ESLint rule.
 * Exits with code 1 if any violation file does NOT produce the expected rule error.
 *
 * Usage: node scripts/guards-verify.mjs
 * Or via:  pnpm guards:verify
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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
];

const ESLINT_CONFIG = 'labs/violations/eslint.config.mjs';

// Resolve eslint binary once — from an app dir where eslint is a direct dep.
const { createRequire } = await import('node:module');
const req = createRequire(path.join(root, 'apps', 'platform', 'package.json'));
const eslintBin = path.join(path.dirname(req.resolve('eslint/package.json')), 'bin', 'eslint.js');

let allPassed = true;

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

if (!allPassed) {
  console.error('\nguards-verify: one or more guards are broken. Fix the ESLint rules above.');
  process.exit(1);
}

console.log('\nguards-verify: all guards confirmed.');
