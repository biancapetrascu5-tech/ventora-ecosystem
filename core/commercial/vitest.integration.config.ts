import { defineConfig } from 'vitest/config';

// DATABASE_URL_TEST         → app_runtime (reads the registry through commercial_rw)
// DATABASE_URL_FOUNDER_TEST → founder_runtime (Founder's key check)
// DATABASE_URL_ADMIN_TEST   → postgres (the registry sync, as at deploy; setup)
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.integration.test.ts'],
    testTimeout: 30000,
    // the sync tests rewrite the shared registry: files must not run side by side
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? '',
      DATABASE_URL_FOUNDER: process.env.DATABASE_URL_FOUNDER_TEST ?? '',
      DIRECT_URL: process.env.DATABASE_URL_ADMIN_TEST ?? '',
    },
  },
});
