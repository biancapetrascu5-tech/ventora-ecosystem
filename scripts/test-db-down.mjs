#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DOCKER } from './test-db-up.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

console.log('[test:db:down] Opresc și șterg containerele de test...');
execSync(`"${DOCKER}" compose -f docker-compose.test.yml down -v`, {
  cwd: ROOT,
  stdio: 'inherit',
});
console.log('[test:db:down] Gata.');
