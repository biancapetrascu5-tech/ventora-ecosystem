import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/__tests__/runtime-role.setup.ts'],
    testTimeout: 30000,
    // Lot B.1: the suites share the database and configureAccess; one file at a time
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL ?? '',
      DIRECT_URL: process.env.DATABASE_URL_ADMIN_TEST ?? process.env.DIRECT_URL ?? '',
      // Lot B.8: a test-only key for the health answers (32 bytes, not a secret); the
      // real key lives only in .env.local / Vercel
      BOOKING_MEDICAL_KEY:
        process.env.BOOKING_MEDICAL_KEY_TEST ?? 'dGVzdC1vbmx5LWtleS1ib29raW5nLW1lZGljYWwtMzI=',
    },
  },
});
