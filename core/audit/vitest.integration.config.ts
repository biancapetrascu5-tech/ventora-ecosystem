import { defineConfig } from 'vitest/config';

// DATABASE_URL_TEST         → app_runtime (writes via audit_writer, reads via audit_org_reader)
// DATABASE_URL_FOUNDER_TEST → founder_runtime (audit_writer + audit_founder_reader)
// DATABASE_URL_ADMIN_TEST   → postgres (immutability triggers, setup)
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/__tests__/runtime-role.setup.ts'],
    include: ['src/__tests__/**/*.integration.test.ts'],
    testTimeout: 30000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? '',
      DATABASE_URL_FOUNDER: process.env.DATABASE_URL_FOUNDER_TEST ?? '',
      DIRECT_URL: process.env.DATABASE_URL_ADMIN_TEST ?? '',
    },
  },
});
