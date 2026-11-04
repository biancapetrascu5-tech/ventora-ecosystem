import { defineConfig } from 'vitest/config';

// DATABASE_URL_TEST         → app_runtime (the engine, the quota: workflows_rw, commercial_rw)
// DATABASE_URL_FOUNDER_TEST → founder_runtime (Founder · Automatizări: workflows_founder)
// DATABASE_URL_ADMIN_TEST   → postgres (fixtures and checks)
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/__tests__/runtime-role.setup.ts'],
    include: ['src/__tests__/**/*.integration.test.ts'],
    testTimeout: 30000,
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? '',
      DATABASE_URL_FOUNDER: process.env.DATABASE_URL_FOUNDER_TEST ?? '',
      DIRECT_URL: process.env.DATABASE_URL_ADMIN_TEST ?? '',
    },
  },
});
