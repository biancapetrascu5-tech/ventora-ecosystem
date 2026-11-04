import { defineConfig } from 'vitest/config';

// D3-1: scripts/seed-pricing.ts on a clean base of its own — every migration and the registry
// synced from the real manifests, no prices yet (the other commercial tests set their own).
// DATABASE_URL_TEST         → app_runtime
// DATABASE_URL_FOUNDER_TEST → founder_runtime (the Founder contracts)
// DATABASE_URL_ADMIN_TEST   → postgres (checks)
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/__tests__/runtime-role.setup.ts'],
    include: ['src/__tests__/pricing/**/*.integration.test.ts'],
    testTimeout: 60000,
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? '',
      DATABASE_URL_FOUNDER: process.env.DATABASE_URL_FOUNDER_TEST ?? '',
      DIRECT_URL: process.env.DATABASE_URL_ADMIN_TEST ?? '',
    },
  },
});
