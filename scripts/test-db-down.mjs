#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { ROOT, TEST_ENV, composeCmd, composeEnv } from './test-db-config.mjs';

// Lot 2.9: doar containerele acestui worktree; nu importă test-db-up.mjs (care le-ar porni)
function findDocker() {
  const candidates = [
    process.env.DOCKER_PATH,
    'docker',
    `${process.env.LOCALAPPDATA}\\Programs\\DockerDesktop\\resources\\bin\\docker.exe`,
  ];
  for (const c of candidates) {
    if (!c) continue;
    try {
      execSync(`"${c}" version`, { stdio: 'ignore' });
      return c;
    } catch {}
  }
  throw new Error('Docker nu a fost găsit. Adaugă docker în PATH sau setează DOCKER_PATH.');
}

console.log(`[test:db:down] Opresc și șterg containerele ${TEST_ENV.project}...`);
execSync(composeCmd(findDocker(), 'down -v'), {
  cwd: ROOT,
  stdio: 'inherit',
  env: composeEnv(),
});
console.log('[test:db:down] Gata.');
