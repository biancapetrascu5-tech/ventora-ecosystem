import { defineConfig } from 'vitest/config';

// DATABASE_URL_TEST       → app_runtime (billing_rw; commercial_rw for the activation; org_rw and
//                           notifications_rw for the owner's notification)
// DATABASE_URL_FOUNDER_TEST → founder_runtime (Lot 3.6: the Founder reads, billing.founder_*)
// DATABASE_URL_ADMIN_TEST → postgres (fixtures and checks)
// The commercial registry is the real one (synced from the manifests before this suite).
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
