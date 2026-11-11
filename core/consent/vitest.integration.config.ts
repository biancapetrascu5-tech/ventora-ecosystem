import { randomBytes } from 'node:crypto';
import { defineConfig } from 'vitest/config';

// DATABASE_URL_TEST       → app_runtime (consent_rw)
// DATABASE_URL_ADMIN_TEST → postgres (checks)
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/__tests__/runtime-role.setup.ts'],
    include: ['src/__tests__/**/*.integration.test.ts'],
    testTimeout: 30000,
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? '',
      DIRECT_URL: process.env.DATABASE_URL_ADMIN_TEST ?? '',
      // Decision 11.11.2026: HMAC with CONSENT_HASH_KEY. The CI test secret when set, else a random
      // key per run (like BOOKING_MEDICAL_KEY); no key value lives in the code
      CONSENT_HASH_KEY: process.env.CONSENT_HASH_KEY_TEST || randomBytes(32).toString('base64'),
    },
  },
});
